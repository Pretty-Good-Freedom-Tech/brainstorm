#!/bin/bash

# This calculates number of hops from scratch starting with CUSTOMER_PUBKEY which by definition is 0 hops away
# The resuls are stored in neo4j in the relevant NostrUserWotMetricsCard nodesusing the property: hops
# This script is called with a command like:
# sudo bash calculateHops.sh <customer_pubkey> <customer_id> <customer_name>

source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, BRAINSTORM_LOG_DIR

# Source structured logging utility
source "$BRAINSTORM_MODULE_BASE_DIR/src/utils/structuredLogging.sh"

# Check if customer_pubkey, customer_id, customer_name are provided
if [ -z "$1" ] || [ -z "$2" ] || [ -z "$3" ]; then
    echo "Usage: $0 <customer_pubkey> <customer_id> <customer_name>"
    exit 1
fi

# Get customer_pubkey
CUSTOMER_PUBKEY="$1"

# Get customer_id
CUSTOMER_ID="$2"

# Get customer_name
CUSTOMER_NAME="$3"

# Get log directory
LOG_DIR="$BRAINSTORM_LOG_DIR/customers/$CUSTOMER_NAME"

# Create log directory if it doesn't exist; chown to brainstorm user
mkdir -p "$LOG_DIR"
sudo chown brainstorm:brainstorm "$LOG_DIR"

# Log file
LOG_FILE="$LOG_DIR/calculateHops.log"
touch ${LOG_FILE}
sudo chown brainstorm:brainstorm ${LOG_FILE}

CYPHER1="MATCH (c:NostrUserWotMetricsCard {observer_pubkey:'$CUSTOMER_PUBKEY'}) SET c.hops=999"
CYPHER2="MATCH (c:NostrUserWotMetricsCard {observer_pubkey:'$CUSTOMER_PUBKEY', observee_pubkey:'$CUSTOMER_PUBKEY'}) SET c.hops=0"
CYPHER3="MATCH (c1:NostrUserWotMetricsCard {observer_pubkey:'$CUSTOMER_PUBKEY'})-[:SPECIFIC_INSTANCE]-(:SetOfNostrUserWotMetricsCards)-[:WOT_METRICS_CARDS]-(u1:NostrUser)-[:FOLLOWS]->(u2:NostrUser)-[:WOT_METRICS_CARDS]->(:SetOfNostrUserWotMetricsCards)-[:SPECIFIC_INSTANCE]->(c2:NostrUserWotMetricsCard {observer_pubkey:'$CUSTOMER_PUBKEY'}) WHERE c2.hops - c1.hops > 1 SET c2.hops = c1.hops + 1 RETURN count(c2) as numUpdates"

numHops=1

echo "$(date): Starting calculateHops"
echo "$(date): Starting calculateHops" >> ${LOG_FILE}

# Emit structured event for task start
startMetadata=$(cat <<EOF
{
    "customer_id": "$CUSTOMER_ID",
    "customer_pubkey": "$CUSTOMER_PUBKEY",
    "customer_name": "$CUSTOMER_NAME",
    "algorithm": "customer_hop_distance"
}
EOF
)
emit_task_event "TASK_START" "calculateCustomerHops" "$CUSTOMER_PUBKEY" "$startMetadata"

# Initialize hop distances (set all to 999, then customer to 0)
progressMetadata=$(cat <<EOF
{
    "customer_id": "$CUSTOMER_ID",
    "customer_name": "$CUSTOMER_NAME",
    "step": "initialization",
    "message": "Setting initial hop distances"
}
EOF
)
emit_task_event "PROGRESS" "calculateCustomerHops" "$CUSTOMER_PUBKEY" "$progressMetadata"

sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1"
sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER2"
cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER3")
numUpdates="${cypherResults:11}"

echo "$(date): Continuing calculateHops; numUpdates: $numUpdates numHops: $numHops"
echo "$(date): Continuing calculateHops; numUpdates: $numUpdates numHops: $numHops" >> ${LOG_FILE}

# Emit structured event for initial iteration
progressMetadata=$(cat <<EOF
{
    "customer_id": "$CUSTOMER_ID",
    "customer_name": "$CUSTOMER_NAME",
    "step": "iteration",
    "hop_level": $numHops,
    "updates_count": $numUpdates,
    "message": "Initial hop calculation iteration"
}
EOF
)
emit_task_event "PROGRESS" "calculateCustomerHops" "$CUSTOMER_PUBKEY" "$progressMetadata"

while [[ "$numUpdates" -gt 0 ]] && [[ "$numHops" -lt 12 ]];
do
    ((numHops++))
    
    # Emit structured event for iteration start
    progressMetadata=$(cat <<EOF
{
    "customer_id": "$CUSTOMER_ID",
    "customer_name": "$CUSTOMER_NAME",
    "step": "iteration",
    "hop_level": $numHops,
    "message": "Processing hop level $numHops"
}
EOF
)
    emit_task_event "PROGRESS" "calculateCustomerHops" "$CUSTOMER_PUBKEY" "$progressMetadata"
    
    cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER3")
    numUpdates="${cypherResults:11}"
    
    echo "$(date): Continuing calculateHops; numUpdates: $numUpdates numHops: $numHops"
    echo "$(date): Continuing calculateHops; numUpdates: $numUpdates numHops: $numHops" >> ${LOG_FILE}
    
    # Emit structured event for iteration completion
    progressMetadata=$(cat <<EOF
{
    "customer_id": "$CUSTOMER_ID",
    "customer_name": "$CUSTOMER_NAME",
    "step": "iteration_complete",
    "hop_level": $numHops,
    "updates_count": $numUpdates,
    "message": "Completed hop level $numHops with $numUpdates updates"
}
EOF
)
    emit_task_event "PROGRESS" "calculateCustomerHops" "$CUSTOMER_PUBKEY" "$progressMetadata"
done

echo "$(date): Finished calculateHops for observer_pubkey $CUSTOMER_PUBKEY"
echo "$(date): Finished calculateHops for observer_pubkey $CUSTOMER_PUBKEY" >> ${LOG_FILE}

# Determine completion reason and emit structured event
if [[ "$numUpdates" -eq 0 ]]; then
    completion_reason="converged"
    completion_message="Algorithm converged - no more updates needed"
elif [[ "$numHops" -ge 12 ]]; then
    completion_reason="max_hops_reached"
    completion_message="Maximum hop limit (12) reached"
else
    completion_reason="unknown"
    completion_message="Algorithm completed for unknown reason"
fi

# Emit structured event for task completion
endMetadata=$(cat <<EOF
{
    "customer_id": "$CUSTOMER_ID",
    "customer_pubkey": "$CUSTOMER_PUBKEY",
    "customer_name": "$CUSTOMER_NAME",
    "status": "success",
    "final_hop_level": $numHops,
    "final_updates_count": $numUpdates,
    "completion_reason": "$completion_reason",
    "message": "$completion_message"
}
EOF
)
emit_task_event "TASK_END" "calculateCustomerHops" "$CUSTOMER_PUBKEY" "$endMetadata"
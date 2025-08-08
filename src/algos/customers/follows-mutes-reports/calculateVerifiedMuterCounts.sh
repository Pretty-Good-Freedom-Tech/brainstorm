#!/bin/bash
# to run:
# sudo bash calculateVerifiedMuterCounts.sh e5272de914bd301755c439b88e6959a43c9d2664831f093c51e9c799a16a102f 0 straycat
# sudo bash calculateVerifiedMuterCounts.sh  7cc328a08ddb2afdf9f9be77beff4c83489ff979721827d628a542f32a247c0e 1 cloudfodder

source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR

# Source structured logging utilities
source "$BRAINSTORM_MODULE_BASE_DIR/src/utils/structuredLogging.sh"

# Check if customer_pubkey, customer_id, and customer_name are provided
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

# Get customer preferences
CUSTOMER_DIR="/var/lib/brainstorm/customers/$CUSTOMER_NAME"
source $CUSTOMER_DIR/preferences/whitelist.conf
source $CUSTOMER_DIR/preferences/blacklist.conf
source $CUSTOMER_DIR/preferences/graperank.conf # VERIFIED_MUTERS_INFLUENCE_CUTOFF

# If VERIFIED_MUTERS_INFLUENCE_CUTOFF is not set, then default it to 0.01
if [ -z "$VERIFIED_MUTERS_INFLUENCE_CUTOFF" ]; then
    VERIFIED_MUTERS_INFLUENCE_CUTOFF=0.01
fi

# Get log directory
LOG_DIR="$BRAINSTORM_LOG_DIR/customers/$CUSTOMER_NAME"

# Create log directory if it doesn't exist; chown to brainstorm user
mkdir -p "$LOG_DIR"
sudo chown brainstorm:brainstorm "$LOG_DIR"

# Log file
LOG_FILE="$LOG_DIR/calculateVerifiedMuterCounts.log"
touch ${LOG_FILE}
sudo chown brainstorm:brainstorm ${LOG_FILE}

echo "$(date): Starting calculateVerifiedMuterCounts"
echo "$(date): Starting calculateVerifiedMuterCounts" >> ${LOG_FILE}

# Emit structured event for task start
emit_task_event "TASK_START" "calculateVerifiedMuterCounts" \
    "customer_id=$CUSTOMER_ID" \
    "customer_pubkey=$CUSTOMER_PUBKEY" \
    "customer_name=$CUSTOMER_NAME" \
    "influence_cutoff=$VERIFIED_MUTERS_INFLUENCE_CUTOFF" \
    "message=Starting verified muter counts calculation"

CYPHER1="
MATCH (mutee:NostrUser)<-[m:MUTES]-(muter:NostrUser)-[:WOT_METRICS_CARDS]->(:SetOfNostrUserWotMetricsCards)-[:SPECIFIC_INSTANCE]->(muterCard:NostrUserWotMetricsCard {customer_id: $CUSTOMER_ID})
WHERE muterCard.observee_pubkey = muter.pubkey AND muterCard.influence > $VERIFIED_MUTERS_INFLUENCE_CUTOFF
OPTIONAL MATCH (mutee)-[:WOT_METRICS_CARDS]->(:SetOfNostrUserWotMetricsCards)-[:SPECIFIC_INSTANCE]->(muteeCard:NostrUserWotMetricsCard {customer_id: $CUSTOMER_ID})
WITH muteeCard, count(m) AS verifiedMuterCount
SET muteeCard.verifiedMuterCount = verifiedMuterCount
RETURN COUNT(muteeCard) AS numCardsUpdated"

CYPHER2="
MATCH (mutee:NostrUser)
OPTIONAL MATCH (mutee)<-[m:MUTES]-(muter:NostrUser)-[:WOT_METRICS_CARDS]->(:SetOfNostrUserWotMetricsCards)-[:SPECIFIC_INSTANCE]->(muterCard:NostrUserWotMetricsCard {customer_id: $CUSTOMER_ID})
WHERE muterCard.observee_pubkey = muter.pubkey AND muterCard.influence > $VERIFIED_MUTERS_INFLUENCE_CUTOFF
OPTIONAL MATCH (mutee)-[:WOT_METRICS_CARDS]->(:SetOfNostrUserWotMetricsCards)-[:SPECIFIC_INSTANCE]->(muteeCard:NostrUserWotMetricsCard {customer_id: $CUSTOMER_ID})
WITH muteeCard, count(m) AS verifiedMuterCount
WHERE verifiedMuterCount = 0
SET muteeCard.verifiedMuterCount = 0
RETURN COUNT(muteeCard) AS numCardsUpdated"

# Emit structured event for Phase 1 start
emit_task_event "PROGRESS" "calculateVerifiedMuterCounts" \
    "customer_id=$CUSTOMER_ID" \
    "customer_name=$CUSTOMER_NAME" \
    "step=nonzero_counts" \
    "phase=1" \
    "influence_cutoff=$VERIFIED_MUTERS_INFLUENCE_CUTOFF" \
    "message=Calculating non-zero verified muter counts"

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1")
numUsersUpdated="${cypherResults:16}"

echo "$(date): numUsersUpdated: $numUsersUpdated (with nonzero verifiedMuterCount)"
echo "$(date): numUsersUpdated: $numUsersUpdated (with nonzero verifiedMuterCount)" >> ${LOG_FILE}

# Emit structured event for Phase 1 completion
emit_task_event "PROGRESS" "calculateVerifiedMuterCounts" \
    "customer_id=$CUSTOMER_ID" \
    "customer_name=$CUSTOMER_NAME" \
    "step=nonzero_counts_complete" \
    "phase=1" \
    "users_updated=$numUsersUpdated" \
    "message=Completed non-zero verified muter counts calculation"

# Emit structured event for Phase 2 start
emit_task_event "PROGRESS" "calculateVerifiedMuterCounts" \
    "customer_id=$CUSTOMER_ID" \
    "customer_name=$CUSTOMER_NAME" \
    "step=zero_counts" \
    "phase=2" \
    "message=Setting zero verified muter counts for remaining users"

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER2")
numUsersUpdated="${cypherResults:16}"

echo "$(date): numUsersUpdated: $numUsersUpdated (with zero verifiedMuterCount)"
echo "$(date): numUsersUpdated: $numUsersUpdated (with zero verifiedMuterCount)" >> ${LOG_FILE}

# Emit structured event for Phase 2 completion
emit_task_event "PROGRESS" "calculateVerifiedMuterCounts" \
    "customer_id=$CUSTOMER_ID" \
    "customer_name=$CUSTOMER_NAME" \
    "step=zero_counts_complete" \
    "phase=2" \
    "users_updated=$numUsersUpdated" \
    "message=Completed zero verified muter counts assignment"

echo "$(date): Finished calculateVerifiedMuterCounts"

# Emit structured event for task completion
emit_task_event "TASK_END" "calculateVerifiedMuterCounts" \
    "customer_id=$CUSTOMER_ID" \
    "customer_pubkey=$CUSTOMER_PUBKEY" \
    "customer_name=$CUSTOMER_NAME" \
    "status=success" \
    "phases_completed=2" \
    "influence_cutoff=$VERIFIED_MUTERS_INFLUENCE_CUTOFF" \
    "algorithm=verified_muter_counts" \
    "message=Verified muter counts calculation completed successfully"
echo "$(date): Finished calculateVerifiedMuterCounts" >> ${LOG_FILE}
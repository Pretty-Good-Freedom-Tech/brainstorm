#!/bin/bash
set -e          # Exit immediately on command failure
set -o pipefail # Fail if any pipeline command fails

# This calculates number of hops from scratch starting with BRAINSTORM_OWNER_PUBKEY which by definition is 0 hops away
# The resuls are stored in neo4j using the property: hops

source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, BRAINSTORM_OWNER_PUBKEY, BRAINSTORM_LOG_DIR

# Source structured logging utility
source /usr/local/lib/node_modules/brainstorm/src/utils/structuredLogging.sh

CYPHER1="MATCH (u:NostrUser) SET u.hops=999"
CYPHER2="MATCH (u:NostrUser {pubkey:'$BRAINSTORM_OWNER_PUBKEY'}) SET u.hops=0"
CYPHER3="MATCH (u1:NostrUser)-[:FOLLOWS]->(u2:NostrUser) WHERE u2.hops - u1.hops > 1 SET u2.hops = u1.hops + 1 RETURN count(u2) as numUpdates"

# Start structured logging
oMetadata=$(cat <<EOF
{
    "algorithm": "hop_distance",
    "target": "owner",
    "owner_pubkey": "$BRAINSTORM_OWNER_PUBKEY",
    "max_hops": 12
}
EOF
)
emit_task_event "TASK_START" "calculateOwnerHops" "system" "$oMetadata"

numHops=1

echo "$(date): Starting calculateHops"
echo "$(date): Starting calculateHops" >> ${BRAINSTORM_LOG_DIR}/calculateHops.log

# Phase 1: Initialize hop distances
progressMetadata=$(cat <<EOF
{
    "phase": "initialization",
    "step": "reset_all_hops",
    "description": "Setting all users to 999 hops"
}
EOF
)
emit_task_event "PROGRESS" "calculateOwnerHops" "system" "$progressMetadata"
sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1"

progressMetadata=$(cat <<EOF
{
    "phase": "initialization",
    "step": "set_owner_zero",
    "description": "Setting owner to 0 hops",
    "owner_pubkey": "$BRAINSTORM_OWNER_PUBKEY"
}
EOF
)
emit_task_event "PROGRESS" "calculateOwnerHops" "system" "$progressMetadata"
sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER2"

# Phase 2: Iterative hop calculation
progressMetadata=$(cat <<EOF
{
    "phase": "calculation",
    "step": "start_iterations",
    "description": "Beginning iterative hop distance calculation"
}
EOF
)
emit_task_event "PROGRESS" "calculateOwnerHops" "system" "$progressMetadata"
cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER3")
numUpdates="${cypherResults:11}"

progressMetadata=$(cat <<EOF
{
    "phase": "calculation",
    "step": "initial_iteration",
    "hop_level": 1,
    "updates": $numUpdates,
    "description": "Completed initial hop calculation"
}
EOF
)
emit_task_event "PROGRESS" "calculateOwnerHops" "system" "$progressMetadata"

while [[ "$numUpdates" -gt 0 ]] && [[ "$numHops" -lt 12 ]];
do
    ((numHops++))
    cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER3")
    numUpdates="${cypherResults:11}"

    echo "$(date): calculateHops iteration $numHops"
    echo "$(date): calculateHops iteration $numHops" >> ${BRAINSTORM_LOG_DIR}/calculateHops.log
    
    progressMetadata=$(cat <<EOF
{
    "phase": "calculation",
    "step": "iteration",
    "hop_level": $numHops,
    "updates": $numUpdates,
    "description": "Completed hop level $numHops calculation"
}
EOF
)
    emit_task_event "PROGRESS" "calculateOwnerHops" "system" "$progressMetadata"
done

# Phase 3: Completion
final_hops=$((numHops - 1))
completion_reason="max_hops_reached"
if [[ "$numUpdates" -eq 0 ]]; then
    completion_reason="no_more_updates"
fi

progressMetadata=$(cat <<EOF
{
    "phase": "completion",
    "final_hop_level": $final_hops,
    "total_iterations": $numHops,
    "completion_reason": "$completion_reason",
    "description": "Hop distance calculation completed"
}
EOF
)
emit_task_event "PROGRESS" "calculateOwnerHops" "system" "$progressMetadata"

echo "$(date): Finished calculateHops"
echo "$(date): Finished calculateHops" >> ${BRAINSTORM_LOG_DIR}/calculateHops.log

# End structured logging
endMetadata=$(cat <<EOF
{
    "final_hop_level": $final_hops,
    "total_iterations": $numHops,
    "completion_reason": "$completion_reason",
    "max_hops": 12
}
EOF
)
emit_task_event "TASK_END" "calculateOwnerHops" "system" "$endMetadata"
exit 0  # Explicit success exit code for parent script orchestration
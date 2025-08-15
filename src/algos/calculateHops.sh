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
oMetadata=$(jq -n \
    --arg algorithm "hop_distance" \
    --arg target "owner" \
    --arg owner_pubkey "$BRAINSTORM_OWNER_PUBKEY" \
    --argjson max_hops 12 \
    '{
        algorithm: $algorithm,
        target: $target,
        owner_pubkey: $owner_pubkey,
        max_hops: $max_hops
    }')
emit_task_event "TASK_START" "calculateOwnerHops" "system" "$oMetadata"

numHops=1

echo "$(date): Starting calculateHops"
echo "$(date): Starting calculateHops" >> ${BRAINSTORM_LOG_DIR}/calculateHops.log

# Phase 1: Initialize hop distances
progressMetadata=$(jq -n \
    --arg phase "initialization" \
    --arg step "reset_all_hops" \
    --arg description "Setting all users to 999 hops" \
    '{
        phase: $phase,
        step: $step,
        description: $description
    }')
emit_task_event "PROGRESS" "calculateOwnerHops" "system" "$progressMetadata"
sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1"

progressMetadata=$(jq -n \
    --arg phase "initialization" \
    --arg step "set_owner_zero" \
    --arg description "Setting owner to 0 hops" \
    --arg owner_pubkey "$BRAINSTORM_OWNER_PUBKEY" \
    '{
        phase: $phase,
        step: $step,
        description: $description,
        owner_pubkey: $owner_pubkey
    }')
emit_task_event "PROGRESS" "calculateOwnerHops" "system" "$progressMetadata"
sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER2"

# Phase 2: Iterative hop calculation
progressMetadata=$(jq -n \
    --arg phase "calculation" \
    --arg step "start_iterations" \
    --arg description "Beginning iterative hop distance calculation" \
    '{
        phase: $phase,
        step: $step,
        description: $description
    }')
emit_task_event "PROGRESS" "calculateOwnerHops" "system" "$progressMetadata"
cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER3")
numUpdates="${cypherResults:11}"

progressMetadata=$(jq -n \
    --arg phase "calculation" \
    --arg step "initial_iteration" \
    --argjson hop_level 1 \
    --argjson updates "$numUpdates" \
    --arg description "Completed initial hop calculation" \
    '{
        phase: $phase,
        step: $step,
        hop_level: $hop_level,
        updates: $updates,
        description: $description
    }')
emit_task_event "PROGRESS" "calculateOwnerHops" "system" "$progressMetadata"

while [[ "$numUpdates" -gt 0 ]] && [[ "$numHops" -lt 12 ]];
do
    ((numHops++))
    cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER3")
    numUpdates="${cypherResults:11}"

    echo "$(date): calculateHops iteration $numHops"
    echo "$(date): calculateHops iteration $numHops" >> ${BRAINSTORM_LOG_DIR}/calculateHops.log
    
    progressMetadata=$(jq -n \
        --arg phase "calculation" \
        --arg step "iteration" \
        --argjson hop_level "$numHops" \
        --argjson updates "$numUpdates" \
        --arg description "Completed hop level $numHops calculation" \
        '{
            phase: $phase,
            step: $step,
            hop_level: $hop_level,
            updates: $updates,
            description: $description
        }')
    emit_task_event "PROGRESS" "calculateOwnerHops" "system" "$progressMetadata"
done

# Phase 3: Completion
final_hops=$((numHops - 1))
completion_reason="max_hops_reached"
if [[ "$numUpdates" -eq 0 ]]; then
    completion_reason="no_more_updates"
fi

progressMetadata=$(jq -n \
    --arg phase "completion" \
    --argjson final_hop_level "$final_hops" \
    --argjson total_iterations "$numHops" \
    --arg completion_reason "$completion_reason" \
    --arg description "Hop distance calculation completed" \
    '{
        phase: $phase,
        final_hop_level: $final_hop_level,
        total_iterations: $total_iterations,
        completion_reason: $completion_reason,
        description: $description
    }')
emit_task_event "PROGRESS" "calculateOwnerHops" "system" "$progressMetadata"

echo "$(date): Finished calculateHops"
echo "$(date): Finished calculateHops" >> ${BRAINSTORM_LOG_DIR}/calculateHops.log

# End structured logging
endMetadata=$(jq -n \
    --argjson final_hop_level "$final_hops" \
    --argjson total_iterations "$numHops" \
    --arg completion_reason "$completion_reason" \
    --argjson max_hops 12 \
    '{
        final_hop_level: $final_hop_level,
        total_iterations: $total_iterations,
        completion_reason: $completion_reason,
        max_hops: $max_hops
    }')
emit_task_event "TASK_END" "calculateOwnerHops" "system" "$endMetadata"
exit 0  # Explicit success exit code for parent script orchestration
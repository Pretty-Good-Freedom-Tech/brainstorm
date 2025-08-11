#!/bin/bash

source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, STRFRY_PLUGINS_DATA
source /etc/whitelist.conf

# Source structured logging utilities
source "$BRAINSTORM_MODULE_BASE_DIR/src/utils/structuredLogging.sh"

WHITELIST_OUTPUT_DIR=${STRFRY_PLUGINS_DATA}

touch ${BRAINSTORM_LOG_DIR}/exportWhitelist.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/exportWhitelist.log

echo "$(date): Starting exportWhitelist" >> ${BRAINSTORM_LOG_DIR}/exportWhitelist.log

# Emit structured event for task start
emit_task_event "TASK_START" "exportWhitelist" "$BRAINSTORM_OWNER_PUBKEY" '{
    "message": "Starting whitelist export algorithm",
    "task_type": "owner_export",
    "algorithm": "whitelist_export",
    "scope": "owner",
    "phases": ["configuration_and_query_building", "neo4j_query_execution", "json_file_generation", "cleanup_and_finalization"],
    "output_file": "whitelist_pubkeys.json",
    "configuration_driven": true,
    "database": "neo4j",
    "category": "export",
    "parent_task": "processAllTasks"
}'

# Emit structured event for Phase 1 start
emit_task_event "PROGRESS" "exportWhitelist" "$BRAINSTORM_OWNER_PUBKEY" '{
    "message": "Starting Phase 1: Configuration and query building",
    "phase": "configuration_and_query_building",
    "step": "phase_1_start",
    "algorithm": "whitelist_export",
    "configuration_loaded": true,
    "scope": "owner"
}'

echo "Running exportWhiteList. This script updates ${WHITELIST_OUTPUT_DIR}/whitelist_pubkeys.json based on personalizedPageRank scores stored in neo4j."

CYPHER1="
MATCH (n:NostrUser) WHERE n.personalizedPageRank > 0.000001
RETURN n.personalizedPageRank, n.pubkey
ORDER BY n.personalizedPageRank DESC
"

CYPHER2="MATCH (n:NostrUser) "

# Add condition based on combination logic
if [ "$COMBINATION_LOGIC" = "AND" ]; then
    CYPHER2+="WHERE (n.influence >= $INFLUENCE_CUTOFF AND n.hops <= $HOPS_CUTOFF)"
else
    CYPHER2+="WHERE (n.influence >= $INFLUENCE_CUTOFF OR n.hops <= $HOPS_CUTOFF)"
fi

# Add blacklist condition if needed
if [ "$INCORPORATE_BLACKLIST" = "true" ]; then
    CYPHER2+=" AND (n.blacklisted IS NULL OR n.blacklisted = 0)"
fi
        
CYPHER2+="
RETURN n.influence, n.pubkey
ORDER BY n.influence DESC
"

# Emit structured event for Phase 1 completion and Phase 2 start
emit_task_event "PROGRESS" "exportWhitelist" "$BRAINSTORM_OWNER_PUBKEY" '{
    "message": "Phase 1 completed, starting Phase 2: Neo4j query execution",
    "phase": "neo4j_query_execution",
    "step": "phase_2_start",
    "algorithm": "whitelist_export",
    "combination_logic": "'"$COMBINATION_LOGIC"'",
    "influence_cutoff": "'"$INFLUENCE_CUTOFF"'",
    "hops_cutoff": "'"$HOPS_CUTOFF"'",
    "incorporate_blacklist": "'"$INCORPORATE_BLACKLIST"'",
    "query_built": true,
    "scope": "owner"
}'

echo "$CYPHER2" >> ${BRAINSTORM_LOG_DIR}/exportWhitelist.log

sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER2" | tail -n +2 > ${WHITELIST_OUTPUT_DIR}/whitelistQueryOutput.txt

# Emit structured event for Phase 2 completion and Phase 3 start
emit_task_event "PROGRESS" "exportWhitelist" "$BRAINSTORM_OWNER_PUBKEY" '{
    "message": "Phase 2 completed, starting Phase 3: JSON file generation",
    "phase": "json_file_generation",
    "step": "phase_3_start",
    "algorithm": "whitelist_export",
    "query_executed": true,
    "intermediate_file": "whitelistQueryOutput.txt",
    "scope": "owner"
}'

# create whitelist

touch ${WHITELIST_OUTPUT_DIR}/whitelist_pubkeys.json

echo "{" > ${WHITELIST_OUTPUT_DIR}/whitelist_pubkeys.json

# iterate through all pubkeys and add to json file

numLines=$(wc -l ${WHITELIST_OUTPUT_DIR}/whitelistQueryOutput.txt | awk '{print $1}')

# Emit structured event for JSON processing details
emit_task_event "PROGRESS" "exportWhitelist" "$BRAINSTORM_OWNER_PUBKEY" '{
    "message": "Processing query results into JSON format",
    "phase": "json_file_generation",
    "step": "json_processing",
    "algorithm": "whitelist_export",
    "total_lines": '"$numLines"',
    "output_file": "whitelist_pubkeys.json",
    "scope": "owner"
}'

whichLine=1
while read -r p;
do
  IFS=','
  read -ra array1 <<< "$p"
  IFS='"'
  read -ra array2 <<< "$p"
  if [ "$whichLine" -lt "$numLines" ]; then
    echo "  \"${array2[1]}\": true," >> ${WHITELIST_OUTPUT_DIR}/whitelist_pubkeys.json
  else
    echo "  \"${array2[1]}\": true" >> ${WHITELIST_OUTPUT_DIR}/whitelist_pubkeys.json
  fi
  ((whichLine++))
done < ${WHITELIST_OUTPUT_DIR}/whitelistQueryOutput.txt

echo "}" >> ${WHITELIST_OUTPUT_DIR}/whitelist_pubkeys.json

# Emit structured event for Phase 3 completion and Phase 4 start
emit_task_event "PROGRESS" "exportWhitelist" "$BRAINSTORM_OWNER_PUBKEY" '{
    "message": "Phase 3 completed, starting Phase 4: Cleanup and finalization",
    "phase": "cleanup_and_finalization",
    "step": "phase_4_start",
    "algorithm": "whitelist_export",
    "json_file_created": true,
    "total_pubkeys_processed": '"$numLines"',
    "scope": "owner"
}'

sudo chown brainstorm:brainstorm ${WHITELIST_OUTPUT_DIR}/whitelist_pubkeys.json

# clean up
sudo rm ${WHITELIST_OUTPUT_DIR}/whitelistQueryOutput.txt

# Emit structured event for successful completion
emit_task_event "TASK_END" "exportWhitelist" "$BRAINSTORM_OWNER_PUBKEY" '{
    "message": "Whitelist export completed successfully",
    "status": "success",
    "task_type": "owner_export",
    "algorithm": "whitelist_export",
    "phases_completed": ["configuration_and_query_building", "neo4j_query_execution", "json_file_generation", "cleanup_and_finalization"],
    "output_file": "whitelist_pubkeys.json",
    "total_pubkeys_exported": '"$numLines"',
    "configuration_parameters": {
        "combination_logic": "'"$COMBINATION_LOGIC"'",
        "influence_cutoff": "'"$INFLUENCE_CUTOFF"'",
        "hops_cutoff": "'"$HOPS_CUTOFF"'",
        "incorporate_blacklist": "'"$INCORPORATE_BLACKLIST"'"
    },
    "database": "neo4j",
    "category": "export",
    "scope": "owner",
    "parent_task": "processAllTasks"
}'

echo "$(date): Finished exportWhitelist" >> ${BRAINSTORM_LOG_DIR}/exportWhitelist.log
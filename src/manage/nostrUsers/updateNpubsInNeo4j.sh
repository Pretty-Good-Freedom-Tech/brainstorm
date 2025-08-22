#!/bin/bash

# updateNpubsInNeo4j.sh - Update Neo4j NostrUser nodes with generated npub values
# This script uses APOC to read the JSON file and update nodes in batches

# Source configuration
source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, BRAINSTORM_LOG_DIR

# Source structured logging utilities
source "${BRAINSTORM_MODULE_SRC_DIR}/utils/structuredLogging.sh"

# Neo4j import file path
NEO4J_IMPORT_FILE="/var/lib/neo4j/import/npub_updates.json"

# Log file
LOG_FILE="$BRAINSTORM_LOG_DIR/processNpubsOneBlock.log"

# Function to log messages
log_message() {
    local message="$1"
    echo "$(date): $message"
    echo "$(date): $message" >> "$LOG_FILE"
}

# Emit structured event for task start
emit_task_event "TASK_START" "updateNpubsInNeo4j" "system" '{
  "message": "Starting Neo4j npub updates from generated JSON",
  "task_type": "neo4j_npub_update",
  "operation": "update_nostr_users_with_npubs",
  "neo4j_import_file": "/var/lib/neo4j/import/npub_updates.json",
  "phases": ["initialization_and_validation", "json_processing_and_counting", "apoc_batch_update_execution", "verification_and_completion"],
  "apoc_method": "apoc.periodic.iterate",
  "batch_size": 250,
  "parallel_processing": false,
  "category": "maintenance",
  "scope": "system",
  "parent_task": "npubManager"
}'

log_message "Starting Neo4j npub updates"

# Emit structured event for Phase 1 start
emit_task_event "PROGRESS" "updateNpubsInNeo4j" "system" '{
  "message": "Starting Phase 1: Initialization and validation",
  "phase": "initialization_and_validation",
  "step": "phase_1_start",
  "operation": "update_nostr_users_with_npubs",
  "neo4j_import_file": "/var/lib/neo4j/import/npub_updates.json",
  "scope": "system"
}'

# Check if import file exists
if [ ! -f "$NEO4J_IMPORT_FILE" ]; then
    log_message "ERROR: Import file not found: $NEO4J_IMPORT_FILE"
    
    # Emit structured event for error
    emit_task_event "TASK_ERROR" "updateNpubsInNeo4j" "system" '{
  "message": "Neo4j npub update failed - import file not found",
  "error": "import_file_not_found",
  "error_message": "Import file not found",
  "operation": "update_nostr_users_with_npubs",
  "neo4j_import_file": "/var/lib/neo4j/import/npub_updates.json",
  "scope": "system"
}'
    
    exit 1
fi

# Validate JSON file
if ! jq empty "$NEO4J_IMPORT_FILE" 2>/dev/null; then
    log_message "ERROR: Import file contains invalid JSON"
    
    # Emit structured event for error
    emit_task_event "TASK_ERROR" "updateNpubsInNeo4j" "system" '{
  "message": "Neo4j npub update failed - invalid JSON in import file",
  "error": "invalid_json_file",
  "error_message": "Import file contains invalid JSON",
  "operation": "update_nostr_users_with_npubs",
  "neo4j_import_file": "/var/lib/neo4j/import/npub_updates.json",
  "scope": "system"
}'
    
    exit 1
fi

# Emit structured event for Phase 1 completion and Phase 2 start
emit_task_event "PROGRESS" "updateNpubsInNeo4j" "system" '{
  "message": "Phase 1 completed, starting Phase 2: JSON processing and counting",
  "phase": "json_processing_and_counting",
  "step": "phase_2_start",
  "operation": "update_nostr_users_with_npubs",
  "import_file_validated": true,
  "json_valid": true,
  "scope": "system"
}'

# Count records to update
RECORD_COUNT=$(jq length "$NEO4J_IMPORT_FILE" 2>/dev/null || echo "0")
log_message "Preparing to update $RECORD_COUNT NostrUser nodes with npub values"

if [ "$RECORD_COUNT" -eq 0 ]; then
    log_message "No records to update. Exiting."
    
    # Emit structured event for successful completion with no updates
    emit_task_event "TASK_END" "updateNpubsInNeo4j" "system" '{
  "message": "Neo4j npub update completed - no records to update",
  "status": "success",
  "task_type": "neo4j_npub_update",
  "operation": "update_nostr_users_with_npubs",
  "phases_completed": ["initialization_and_validation", "json_processing_and_counting"],
  "neo4j_import_file": "/var/lib/neo4j/import/npub_updates.json",
  "total_records": 0,
  "updated_records": 0,
  "failed_records": 0,
  "apoc_method": "apoc.periodic.iterate",
  "category": "maintenance",
  "scope": "system",
  "parent_task": "npubManager"
}'
    
    exit 0
fi

# Cypher query using APOC to read JSON and update nodes
CYPHER_QUERY="
CALL apoc.periodic.iterate(
  \"CALL apoc.load.json('file:///npub_updates.json') YIELD value RETURN value\",
  \"MATCH (u:NostrUser {pubkey: value.pubkey}) 
   SET u.npub = value.npub
   RETURN u.pubkey as updated_pubkey\",
  {batchSize: 250, parallel: false}
) YIELD batches, total, timeTaken, committedOperations, failedOperations, failedBatches, retries, errorMessages
RETURN batches, total, timeTaken, committedOperations, failedOperations, failedBatches, retries, errorMessages
"

# Emit structured event for Phase 2 completion and Phase 3 start
emit_task_event "PROGRESS" "updateNpubsInNeo4j" "system" '{
  "message": "Phase 2 completed, starting Phase 3: APOC batch update execution",
  "phase": "apoc_batch_update_execution",
  "step": "phase_3_start",
  "operation": "update_nostr_users_with_npubs",
  "json_processed": true,
  "total_records": '$RECORD_COUNT',
  "batch_size": 250,
  "parallel_processing": false,
  "apoc_method": "apoc.periodic.iterate",
  "scope": "system"
}'

log_message "Executing APOC batch update query"

# Execute the update query
RESULT=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER_QUERY" 2>&1)

# Check if query was successful
if [ $? -ne 0 ]; then
    log_message "ERROR: Failed to execute Neo4j update query"
    log_message "Error details: $RESULT"
    
    # Emit structured event for error
    emit_task_event "TASK_ERROR" "updateNpubsInNeo4j" "system" ' {
  "message": "Neo4j npub update failed - APOC batch update execution error",
  "error": "neo4j_update_query_failed",
  "error_message": "Failed to execute Neo4j update query",
  "operation": "update_nostr_users_with_npubs",
  "total_records": '$RECORD_COUNT',
  "apoc_method": "apoc.periodic.iterate",
  "batch_size": 250,
  "scope": "system"
}'
    
    exit 1
fi

# Emit structured event for Phase 3 completion and Phase 4 start
emit_task_event "PROGRESS" "updateNpubsInNeo4j" "system" ' {
  "message": "Phase 3 completed, starting Phase 4: Verification and completion",
  "phase": "verification_and_completion",
  "step": "phase_4_start",
  "operation": "update_nostr_users_with_npubs",
  "apoc_update_complete": true,
  "total_records": '$RECORD_COUNT',
  "scope": "system"
}'

# Parse and log results
log_message "Neo4j update query completed"

# Try to extract statistics from the result
if echo "$RESULT" | jq empty 2>/dev/null; then
    # Extract statistics from JSON result
    COMMITTED_OPS=$(echo "$RESULT" | jq -r '.results[0].data[0].row[3]' 2>/dev/null || echo "unknown")
    FAILED_OPS=$(echo "$RESULT" | jq -r '.results[0].data[0].row[4]' 2>/dev/null || echo "unknown")
    TIME_TAKEN=$(echo "$RESULT" | jq -r '.results[0].data[0].row[2]' 2>/dev/null || echo "unknown")
    
    log_message "Update statistics:"
    log_message "  - Committed operations: $COMMITTED_OPS"
    log_message "  - Failed operations: $FAILED_OPS"
    log_message "  - Time taken: ${TIME_TAKEN}ms"
    
    # Check for failures
    if [ "$FAILED_OPS" != "0" ] && [ "$FAILED_OPS" != "unknown" ]; then
        log_message "WARNING: Some operations failed during update"
    fi
else
    log_message "Update completed (unable to parse detailed statistics)"
fi

# Verify some updates were made by checking a sample
VERIFICATION_QUERY="
MATCH (u:NostrUser) 
WHERE u.pubkey IS NOT NULL AND u.npub IS NOT NULL
RETURN count(u) as users_with_npub
LIMIT 1
"

VERIFICATION_RESULT=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$VERIFICATION_QUERY" 2>/dev/null | tail -n 1 | tr -d '"' || echo "0")

log_message "Verification: $VERIFICATION_RESULT NostrUsers now have npub property"
log_message "Neo4j npub update process completed successfully"

# Emit structured event for successful completion
emit_task_event "TASK_END" "updateNpubsInNeo4j" "system" ' {
  "message": "Neo4j npub update completed successfully",
  "status": "success",
  "task_type": "neo4j_npub_update",
  "operation": "update_nostr_users_with_npubs",
  "phases_completed": ["initialization_and_validation", "json_processing_and_counting", "apoc_batch_update_execution", "verification_and_completion"],
  "neo4j_import_file": "/var/lib/neo4j/import/npub_updates.json",
  "total_records": '$RECORD_COUNT',
  "committed_operations": "'$COMMITTED_OPS'",
  "failed_operations": "'$FAILED_OPS'",
  "time_taken_ms": "'$TIME_TAKEN'",
  "verification_count": "'$VERIFICATION_RESULT'",
  "apoc_method": "apoc.periodic.iterate",
  "batch_size": 250,
  "parallel_processing": false,
  "category": "maintenance",
  "scope": "system",
  "parent_task": "npubManager"
}'

exit 0

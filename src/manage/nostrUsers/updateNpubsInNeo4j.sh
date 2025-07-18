#!/bin/bash

# updateNpubsInNeo4j.sh - Update Neo4j NostrUser nodes with generated npub values
# This script uses APOC to read the JSON file and update nodes in batches

# Source configuration
source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, BRAINSTORM_LOG_DIR

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

log_message "Starting Neo4j npub updates"

# Check if import file exists
if [ ! -f "$NEO4J_IMPORT_FILE" ]; then
    log_message "ERROR: Import file not found: $NEO4J_IMPORT_FILE"
    exit 1
fi

# Validate JSON file
if ! jq empty "$NEO4J_IMPORT_FILE" 2>/dev/null; then
    log_message "ERROR: Import file contains invalid JSON"
    exit 1
fi

# Count records to update
RECORD_COUNT=$(jq length "$NEO4J_IMPORT_FILE" 2>/dev/null || echo "0")
log_message "Preparing to update $RECORD_COUNT NostrUser nodes with npub values"

if [ "$RECORD_COUNT" -eq 0 ]; then
    log_message "No records to update. Exiting."
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

log_message "Executing APOC batch update query"

# Execute the update query
RESULT=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER_QUERY" 2>&1)

# Check if query was successful
if [ $? -ne 0 ]; then
    log_message "ERROR: Failed to execute Neo4j update query"
    log_message "Error details: $RESULT"
    exit 1
fi

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

exit 0

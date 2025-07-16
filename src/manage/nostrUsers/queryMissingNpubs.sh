#!/bin/bash

# queryMissingNpubs.sh - Query Neo4j for NostrUsers missing npub property
# Usage: ./queryMissingNpubs.sh <output_file>

# Source configuration
source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD

# Check arguments
if [ $# -ne 1 ]; then
    echo "Usage: $0 <output_file>"
    exit 1
fi

OUTPUT_FILE="$1"

# Log file
LOG_FILE="$BRAINSTORM_LOG_DIR/npubManager.log"

# Function to log messages
log_message() {
    local message="$1"
    echo "$(date): $message"
    echo "$(date): $message" >> "$LOG_FILE"
}

log_message "Querying Neo4j for NostrUsers missing npub property"

# Cypher query to find NostrUsers with pubkey but no npub (limit 100)
CYPHER_QUERY="
MATCH (u:NostrUser) 
WHERE u.pubkey IS NOT NULL 
  AND (u.npub IS NULL OR u.npub = '') 
RETURN u.pubkey as pubkey
LIMIT 100
"

# Execute query and save results as JSON
cypher-shell -u "$NEO4J_USERNAME" -p "$NEO4J_PASSWORD" \
    --format json \
    "$CYPHER_QUERY" > "$OUTPUT_FILE" 2>/dev/null

# Check if query was successful
if [ $? -ne 0 ]; then
    log_message "ERROR: Failed to execute Neo4j query"
    rm -f "$OUTPUT_FILE"
    exit 1
fi

# Validate output file exists and has content
if [ ! -f "$OUTPUT_FILE" ]; then
    log_message "ERROR: Output file was not created"
    exit 1
fi

# Check if file contains valid JSON
if ! jq empty "$OUTPUT_FILE" 2>/dev/null; then
    log_message "ERROR: Query output is not valid JSON"
    rm -f "$OUTPUT_FILE"
    exit 1
fi

# Extract just the data array from cypher-shell JSON response
# cypher-shell returns format: {"results":[{"columns":["pubkey"],"data":[{"row":["pubkey_value"],"meta":[{}]}]}]}
# We need to transform this to: [{"pubkey":"pubkey_value"},...]
jq '[.results[0].data[] | {pubkey: .row[0]}]' "$OUTPUT_FILE" > "$OUTPUT_FILE.tmp" && mv "$OUTPUT_FILE.tmp" "$OUTPUT_FILE"

if [ $? -ne 0 ]; then
    log_message "ERROR: Failed to process query results"
    rm -f "$OUTPUT_FILE" "$OUTPUT_FILE.tmp"
    exit 1
fi

# Count results
RESULT_COUNT=$(jq length "$OUTPUT_FILE" 2>/dev/null || echo "0")
log_message "Successfully queried $RESULT_COUNT NostrUsers missing npub property"

# If no results, create empty array
if [ "$RESULT_COUNT" -eq 0 ]; then
    echo "[]" > "$OUTPUT_FILE"
fi

exit 0

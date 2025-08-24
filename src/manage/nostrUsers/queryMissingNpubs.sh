#!/bin/bash

# queryMissingNpubs.sh - Query Neo4j for NostrUsers missing npub property
# Usage: ./queryMissingNpubs.sh <output_file>

# Source configuration
source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

# Source structured logging utilities
source "$BRAINSTORM_MODULE_BASE_DIR/src/utils/structuredLogging.sh"

# Check arguments
if [ $# -ne 1 ]; then
    echo "Usage: $0 <output_file>"
    exit 1
fi

OUTPUT_FILE="$1"

# Log file
LOG_FILE="$BRAINSTORM_LOG_DIR/processNpubsOneBlock.log"

# Emit structured event for task start
emit_task_event "TASK_START" "queryMissingNpubs" "system" '{
    "message": "Starting Neo4j query for missing npubs",
    "task_type": "neo4j_query",
    "operation": "query_missing_npubs",
    "output_file": "'"$OUTPUT_FILE"'",
    "phases": ["initialization_and_validation", "neo4j_query_execution", "json_processing", "validation_and_completion"],
    "query_limit": 1000,
    "database": "neo4j",
    "category": "maintenance",
    "scope": "system",
    "parent_task": "npubManager"
}'

# Function to log messages
log_message() {
    local message="$1"
    echo "$(date): $message"
    echo "$(date): $message" >> "$LOG_FILE"
}

# Emit structured event for Phase 1 start
emit_task_event "PROGRESS" "queryMissingNpubs" "system" '{
    "message": "Starting Phase 1: Initialization and validation",
    "phase": "initialization_and_validation",
    "step": "phase_1_start",
    "operation": "query_missing_npubs",
    "output_file": "'"$OUTPUT_FILE"'",
    "scope": "system"
}'

log_message "Querying Neo4j for NostrUsers missing npub property"

# Cypher query to find NostrUsers with pubkey but no npub (limit 1000)
CYPHER_QUERY="
MATCH (u:NostrUser) 
WHERE u.pubkey IS NOT NULL 
  AND (u.npub IS NULL OR u.npub = '') 
  AND u.hops < 100
RETURN u.pubkey as pubkey
LIMIT 1000
"

# Emit structured event for Phase 1 completion and Phase 2 start
emit_task_event "PROGRESS" "queryMissingNpubs" "system" '{
    "message": "Phase 1 completed, starting Phase 2: Neo4j query execution",
    "phase": "neo4j_query_execution",
    "step": "phase_2_start",
    "operation": "query_missing_npubs",
    "query_prepared": true,
    "query_limit": 1000,
    "database": "neo4j",
    "scope": "system"
}'

# Execute query and save results
cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER_QUERY" 2>&1)

# Check if query was successful
if [ $? -ne 0 ]; then
    log_message "ERROR: Failed to execute Neo4j query"
    log_message "Error details: $cypherResults"
    
    # Emit structured event for query error
    emit_task_event "TASK_ERROR" "queryMissingNpubs" "system" '{
        "message": "Neo4j query execution failed",
        "error": "cypher_query_failure",
        "phase": "neo4j_query_execution",
        "operation": "query_missing_npubs",
        "database": "neo4j",
        "scope": "system"
    }'
    exit 1
fi

# Emit structured event for Phase 2 completion and Phase 3 start
emit_task_event "PROGRESS" "queryMissingNpubs" "system" '{
    "message": "Phase 2 completed, starting Phase 3: JSON processing",
    "phase": "json_processing",
    "step": "phase_3_start",
    "operation": "query_missing_npubs",
    "query_executed": true,
    "raw_results_received": true,
    "scope": "system"
}'

log_message "Raw cypher results received, processing..."

# Emit structured event for JSON processing details
emit_task_event "PROGRESS" "queryMissingNpubs" "system" '{
    "message": "Processing raw results into JSON format",
    "phase": "json_processing",
    "step": "json_conversion",
    "operation": "query_missing_npubs",
    "output_file": "'"$OUTPUT_FILE"'",
    "temp_file_created": true,
    "scope": "system"
}'

# Process the plain text output to extract pubkeys and convert to JSON
# The output format is:
# pubkey
# "pubkey_value1"
# "pubkey_value2"
# ...

# Create temporary file for processing
TEMP_OUTPUT="$OUTPUT_FILE.tmp"
echo "$cypherResults" > "$TEMP_OUTPUT"

# Extract pubkeys (skip header line, remove quotes, filter out empty lines)
echo '[' > "$OUTPUT_FILE"
FIRST_RECORD=true

while IFS= read -r line; do
    # Skip the header line "pubkey"
    if [ "$line" = "pubkey" ]; then
        continue
    fi
    
    # Remove quotes and whitespace
    pubkey=$(echo "$line" | sed 's/^"//; s/"$//; s/^[[:space:]]*//; s/[[:space:]]*$//')
    
    # Skip empty lines
    if [ -z "$pubkey" ]; then
        continue
    fi
    
    # Add comma separator for all records except the first
    if [ "$FIRST_RECORD" = true ]; then
        FIRST_RECORD=false
    else
        echo ',' >> "$OUTPUT_FILE"
    fi
    
    # Add JSON object for this pubkey
    echo "  {\"pubkey\": \"$pubkey\"}" >> "$OUTPUT_FILE"
    
done < "$TEMP_OUTPUT"

echo ']' >> "$OUTPUT_FILE"

# Clean up temporary file
rm -f "$TEMP_OUTPUT"

# Emit structured event for Phase 3 completion and Phase 4 start
emit_task_event "PROGRESS" "queryMissingNpubs" "system" '{
    "message": "Phase 3 completed, starting Phase 4: Validation and completion",
    "phase": "validation_and_completion",
    "step": "phase_4_start",
    "operation": "query_missing_npubs",
    "json_processing_complete": true,
    "temp_file_cleaned": true,
    "scope": "system"
}'

# Validate output file exists and has content
if [ ! -f "$OUTPUT_FILE" ]; then
    log_message "ERROR: Output file was not created"
    
    # Emit structured event for file creation error
    emit_task_event "TASK_ERROR" "queryMissingNpubs" "system" '{
        "message": "Output file was not created",
        "error": "output_file_creation_failure",
        "phase": "validation_and_completion",
        "output_file": "'"$OUTPUT_FILE"'",
        "operation": "query_missing_npubs",
        "scope": "system"
    }'
    exit 1
fi

# Check if file contains valid JSON
if ! jq empty "$OUTPUT_FILE" 2>/dev/null; then
    log_message "ERROR: Generated output is not valid JSON"
    log_message "Output file contents:"
    cat "$OUTPUT_FILE" >> "$LOG_FILE"
    rm -f "$OUTPUT_FILE"
    
    # Emit structured event for JSON validation error
    emit_task_event "TASK_ERROR" "queryMissingNpubs" "system" '{
        "message": "Generated output is not valid JSON",
        "error": "json_validation_failure",
        "phase": "validation_and_completion",
        "output_file": "'"$OUTPUT_FILE"'",
        "operation": "query_missing_npubs",
        "scope": "system"
    }'
    exit 1
fi

# Count results
RESULT_COUNT=$(jq length "$OUTPUT_FILE" 2>/dev/null || echo "0")
log_message "Successfully queried $RESULT_COUNT NostrUsers missing npub property"

# If no results, create empty array
if [ "$RESULT_COUNT" -eq 0 ]; then
    echo "[]" > "$OUTPUT_FILE"
fi

# Emit structured event for successful completion
emit_task_event "TASK_END" "queryMissingNpubs" "system" '{
    "message": "Neo4j query for missing npubs completed successfully",
    "status": "success",
    "task_type": "neo4j_query",
    "operation": "query_missing_npubs",
    "phases_completed": ["initialization_and_validation", "neo4j_query_execution", "json_processing", "validation_and_completion"],
    "output_file": "'"$OUTPUT_FILE"'",
    "result_count": '"$RESULT_COUNT"',
    "query_limit": 1000,
    "json_validated": true,
    "database": "neo4j",
    "category": "maintenance",
    "scope": "system",
    "parent_task": "npubManager"
}'

exit 0

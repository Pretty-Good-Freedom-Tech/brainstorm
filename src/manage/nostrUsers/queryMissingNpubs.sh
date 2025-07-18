#!/bin/bash

# queryMissingNpubs.sh - Query Neo4j for NostrUsers missing npub property
# Usage: ./queryMissingNpubs.sh <output_file>

# Source configuration
source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

# Check arguments
if [ $# -ne 1 ]; then
    echo "Usage: $0 <output_file>"
    exit 1
fi

OUTPUT_FILE="$1"

# Log file
LOG_FILE="$BRAINSTORM_LOG_DIR/processNpubsOneBlock.log"

# Function to log messages
log_message() {
    local message="$1"
    echo "$(date): $message"
    echo "$(date): $message" >> "$LOG_FILE"
}

log_message "Querying Neo4j for NostrUsers missing npub property"

# Cypher query to find NostrUsers with pubkey but no npub (limit 1000)
CYPHER_QUERY="
MATCH (u:NostrUser) 
WHERE u.pubkey IS NOT NULL 
  AND (u.npub IS NULL OR u.npub = '') 
RETURN u.pubkey as pubkey
LIMIT 1000
"

# Execute query and save results
cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER_QUERY" 2>&1)

# Check if query was successful
if [ $? -ne 0 ]; then
    log_message "ERROR: Failed to execute Neo4j query"
    log_message "Error details: $cypherResults"
    exit 1
fi

log_message "Raw cypher results received, processing..."

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

# Validate output file exists and has content
if [ ! -f "$OUTPUT_FILE" ]; then
    log_message "ERROR: Output file was not created"
    exit 1
fi

# Check if file contains valid JSON
if ! jq empty "$OUTPUT_FILE" 2>/dev/null; then
    log_message "ERROR: Generated output is not valid JSON"
    log_message "Output file contents:"
    cat "$OUTPUT_FILE" >> "$LOG_FILE"
    rm -f "$OUTPUT_FILE"
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

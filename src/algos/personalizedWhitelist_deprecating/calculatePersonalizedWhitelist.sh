#!/bin/bash

# Personalized Whitelist Generator for Hasenpfeffr
# This script generates a whitelist of NostrUsers based on parameters in /etc/whitelist.conf

# Load configuration
source /etc/hasenpfeffr.conf
source /etc/whitelist.conf

# Configuration
WHITELIST_OUTPUT_DIR=${STRFRY_PLUGINS_DATA}
WHITELIST_OUTPUT_FILE="$WHITELIST_OUTPUT_DIR/whitelist_pubkeys.json"
NEO4J_USERNAME="$NEO4J_USER"
NEO4J_PASSWORD="$NEO4J_PASSWORD"
NEO4J_URI="$NEO4J_URI"
LOG_FILE="$HASENPFEFFR_LOG_DIR/personalizedWhitelist.log"

# Initialize log file
touch "$LOG_FILE"
sudo chown hasenpfeffr:hasenpfeffr "$LOG_FILE"

# Log function
log() {
    echo "$(date +'%Y-%m-%d %H:%M:%S') - $1" | sudo tee -a "$LOG_FILE"
}

log "Starting personalized whitelist generation"
log "Influence Cutoff: $INFLUENCE_CUTOFF"
log "Hops Cutoff: $HOPS_CUTOFF"
log "Combination Logic: $COMBINATION_LOGIC"
log "Incorporate Blacklist: $INCORPORATE_BLACKLIST"

# Prepare query based on parameters
QUERY="MATCH (n:NostrUser) WHERE "

# Add condition based on combination logic
if [ "$COMBINATION_LOGIC" = "AND" ]; then
    QUERY="${QUERY}n.influence >= $INFLUENCE_CUTOFF AND n.hops <= $HOPS_CUTOFF"
else
    QUERY="${QUERY}n.influence >= $INFLUENCE_CUTOFF OR n.hops <= $HOPS_CUTOFF"
fi

# Add blacklist condition if needed
if [ "$INCORPORATE_BLACKLIST" = "true" ]; then
    QUERY="${QUERY} AND (n.blacklisted IS NULL OR n.blacklisted = 0)"
fi

QUERY="${QUERY} RETURN n.pubkey ORDER BY n.influence DESC;"

log "Executing Neo4j query: $QUERY"

# Run the Cypher query
TEMP_OUTPUT_FILE="$WHITELIST_OUTPUT_DIR/whitelist_pubkeys_temp.txt"
sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USERNAME" -p "$NEO4J_PASSWORD" "$QUERY" | tail -n +2 > "$TEMP_OUTPUT_FILE"

# Check if query succeeded
if [ $? -ne 0 ]; then
    log "Error executing Neo4j query"
    exit 1
fi

# Count results
PUBKEY_COUNT=$(wc -l < "$TEMP_OUTPUT_FILE")
log "Found $PUBKEY_COUNT pubkeys for whitelist"

# Create the JSON file
echo "{" > "$WHITELIST_OUTPUT_FILE"

# Process each pubkey
LINE_NUM=0
while read -r LINE; do
    LINE_NUM=$((LINE_NUM + 1))
    
    # Extract pubkey from the output
    PUBKEY=$(echo "$LINE" | sed 's/^"\(.*\)"$/\1/')
    
    # Add to JSON (with or without trailing comma)
    if [ "$LINE_NUM" -lt "$PUBKEY_COUNT" ]; then
        echo "  \"$PUBKEY\": true," >> "$WHITELIST_OUTPUT_FILE"
    else
        echo "  \"$PUBKEY\": true" >> "$WHITELIST_OUTPUT_FILE"
    fi
done < "$TEMP_OUTPUT_FILE"

# Close the JSON
echo "}" >> "$WHITELIST_OUTPUT_FILE"

# Set permissions
sudo chown hasenpfeffr:hasenpfeffr "$WHITELIST_OUTPUT_FILE"
sudo chmod 644 "$WHITELIST_OUTPUT_FILE"

# Update the timestamp in the whitelist.conf
TIMESTAMP=$(date +%s)
sudo sed -i "/WHEN_LAST_CALCULATED/c\export WHEN_LAST_CALCULATED=$TIMESTAMP" /etc/whitelist.conf

# Clean up
rm "$TEMP_OUTPUT_FILE"

log "Completed personalized whitelist generation. Saved to $WHITELIST_OUTPUT_FILE"
log "Updated WHEN_LAST_CALCULATED to $TIMESTAMP"

exit 0

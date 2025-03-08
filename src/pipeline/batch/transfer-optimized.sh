#!/bin/bash

# Optimized script for loading kind 3 events into Neo4j
# Usage: sudo ./transfer-optimized.sh [--recent SECONDS]
# Example to load events from the last 24 hours: sudo ./transfer-optimized.sh --recent 86400

source /etc/hasenpfeffr.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

echo "Starting optimized data transfer process at $(date)"

# Set working directory
cd "$(dirname "$0")"

# Extract kind 3 events from Strfry
SINCE_TIMESTAMP=0
if [[ "$1" == "--recent" ]]; then
    CURRENT_TIME_UNIX=$(date +"%s")
    HOW_LONG_AGO="$2"
    SINCE_TIMESTAMP=$((CURRENT_TIME_UNIX - HOW_LONG_AGO))
    echo "Loading events since $SINCE_TIMESTAMP ($(date -d @$SINCE_TIMESTAMP))"
else
    echo "Loading all kind 3 events"
fi

filter="{ \"kinds\": [3], \"since\": $SINCE_TIMESTAMP }"

# Count events first
echo "Counting events..."
event_count=$(sudo strfry scan --count "$filter")
echo "Found $event_count events to process"

# Create temporary directory with appropriate permissions
TEMP_DIR=$(mktemp -d)
chmod 777 $TEMP_DIR
echo "Using temporary directory: $TEMP_DIR"

# Extract events in parallel chunks for better performance
echo "Extracting events from Strfry..."
sudo strfry scan "$filter" | pv -l -s $event_count | jq -cr 'del(.content)' > "$TEMP_DIR/allKind3Events.json"

# Process events with optimized Node.js script
echo "Processing events to extract follows relationships..."
node ./optimized-processor.js "$TEMP_DIR/allKind3Events.json" "$TEMP_DIR"

# Load data into Neo4j using optimized Cypher
echo "Loading data into Neo4j..."
sudo cypher-shell -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" -a "$NEO4J_URI" -f ./optimized-cypher-load.cypher \
  --param nodesFile="$TEMP_DIR/nodes.csv" \
  --param relsFile="$TEMP_DIR/relationships.csv" \
  --param eventsFile="$TEMP_DIR/events.csv"

# Clean up
echo "Cleaning up temporary files..."
rm -rf "$TEMP_DIR"

echo "Data transfer completed at $(date)"

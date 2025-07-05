#!/bin/bash

# This script will calculate the number of mutes that need to be added and deleted
# It will create two files: mutesToAddToNeo4j.json and mutesToDeleteFromNeo4j.json
# It will use the files in currentRelationshipsFromStrfry and currentRelationshipsFromNeo4j directories

# Format of mutes files - each line corresponds to a mute to be added (or deleted). For example:
# { "pk_rater": "abcd1234", "pk_ratee": "efgh5678", "timestamp": 123456789 }

source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

# Step 1: Calculate the number of mutes that need to be added
# This will create a file to the json directory called mutesToAddToNeo4j.json
# It will cycle through each file, one at a time, in currentRelationshipsFromStrfry/mutes. Each file corresponds to a rater.
# It will first determine whether a file of the same name exists in currentRelationshipsFromNeo4j/mutes.
# If the file does not exist, every entry in the file will result in a new rating to be added to mutesToAddToNeo4j.json.
# If the file exists, it will cycle through each muted pubkey (ratee), one at a time.
# If the muted pubkey is not in currentRelationshipsFromNeo4j, it will result in a new rating to be added to mutesToAddToNeo4j.json.

# Define directories
BASE_DIR="$(dirname "$0")"
STRFRY_MUTES_DIR="${BASE_DIR}/currentRelationshipsFromStrfry/mutes"
NEO4J_MUTES_DIR="${BASE_DIR}/currentRelationshipsFromNeo4j/mutes"
OUTPUT_DIR="${BASE_DIR}/json"
TIMESTAMP=$(date +%s)

# Create output directory if it doesn't exist
mkdir -p "${OUTPUT_DIR}"

# Create or clear the output file
OUTPUT_FILE="${OUTPUT_DIR}/mutesToAddToNeo4j.json"
> "${OUTPUT_FILE}"

echo "Starting calculation of mutes to add to Neo4j..."

# Count files and initialize counters
TOTAL_FILES=$(find "${STRFRY_MUTES_DIR}" -type f -not -name "_summary.json" | wc -l)
PROCESSED_FILES=0
TOTAL_MUTES_TO_ADD=0

echo "Found ${TOTAL_FILES} rater files to process"

# Process each rater file
for STRFRY_FILE in "${STRFRY_MUTES_DIR}"/*.json; do
  # Skip summary files or non-json files if any
  FILENAME=$(basename "$STRFRY_FILE")
  if [[ "$FILENAME" == "_summary.json" || ! "$FILENAME" =~ \.json$ ]]; then
    continue
  fi

  # Get the rater pubkey from the filename
  RATER_PUBKEY="${FILENAME%.json}"
  NEO4J_FILE="${NEO4J_MUTES_DIR}/${FILENAME}"
  
  # Progress reporting
  PROCESSED_FILES=$((PROCESSED_FILES+1))
  if ((PROCESSED_FILES % 100 == 0)) || ((PROCESSED_FILES == TOTAL_FILES)); then
    PROGRESS=$((PROCESSED_FILES * 100 / TOTAL_FILES))
    echo "Progress: ${PROGRESS}% (${PROCESSED_FILES}/${TOTAL_FILES})"
  fi
  
  # Check if this rater exists in Neo4j mutes
  if [[ ! -f "$NEO4J_FILE" ]]; then
    # This rater doesn't exist in Neo4j, add all mutes from strfry
    # Parse the strfry file to extract all mutes
    MUTES_COUNT=$(jq -r ".[\"${RATER_PUBKEY}\"] | keys | length" "$STRFRY_FILE")
    
    # Add each mute to the output file
    jq -r ".[\"${RATER_PUBKEY}\"] | keys[]" "$STRFRY_FILE" | while read -r RATEE_PUBKEY; do
      echo "{\"pk_rater\": \"${RATER_PUBKEY}\", \"pk_ratee\": \"${RATEE_PUBKEY}\", \"timestamp\": ${TIMESTAMP}}" >> "$OUTPUT_FILE"
      TOTAL_MUTES_TO_ADD=$((TOTAL_MUTES_TO_ADD+1))
    done
    
    echo "Added ${MUTES_COUNT} mutes for new rater ${RATER_PUBKEY}"
  else
    # Rater exists in Neo4j, compare mutes
    # Get all ratees from strfry
    STRFRY_RATEES=$(jq -r ".[\"${RATER_PUBKEY}\"] | keys[]" "$STRFRY_FILE" 2>/dev/null || echo "")
    
    # Get all ratees from Neo4j
    NEO4J_RATEES=$(jq -r ".[\"${RATER_PUBKEY}\"] | keys[]" "$NEO4J_FILE" 2>/dev/null || echo "")
    
    # Create a temporary file with Neo4j ratees for faster lookup
    TMP_NEO4J_RATEES=$(mktemp)
    echo "$NEO4J_RATEES" > "$TMP_NEO4J_RATEES"
    
    # Find mutes in strfry that don't exist in Neo4j
    MUTES_ADDED=0
    echo "$STRFRY_RATEES" | while read -r RATEE_PUBKEY; do
      # Skip empty lines
      if [[ -z "$RATEE_PUBKEY" ]]; then
        continue
      fi
      
      # Check if this ratee exists in Neo4j
      if ! grep -q "^${RATEE_PUBKEY}$" "$TMP_NEO4J_RATEES"; then
        # This mute doesn't exist in Neo4j, add it
        echo "{\"pk_rater\": \"${RATER_PUBKEY}\", \"pk_ratee\": \"${RATEE_PUBKEY}\", \"timestamp\": ${TIMESTAMP}}" >> "$OUTPUT_FILE"
        MUTES_ADDED=$((MUTES_ADDED+1))
        TOTAL_MUTES_TO_ADD=$((TOTAL_MUTES_TO_ADD+1))
      fi
    done
    
    # Clean up
    rm "$TMP_NEO4J_RATEES"
    
    if [[ $MUTES_ADDED -gt 0 ]]; then
      echo "Added ${MUTES_ADDED} new mutes for existing rater ${RATER_PUBKEY}"
    fi
  fi
done

echo "Completed calculation of mutes to add to Neo4j"
echo "Total mutes to add: ${TOTAL_MUTES_TO_ADD}"
echo "Output written to: ${OUTPUT_FILE}"



# Step 2: Calculate the number of mutes that need to be deleted
# This will create a file to the json directory called mutesToDeleteFromNeo4j.json
# It will cycle through each pubkey, one at a time, in currentRelationshipsFromNeo4j.
# For each pubkey, it will cycle through each muted pubkey, one at a time, in currentRelationshipsFromNeo4j.
# If the muted pubkey is not in currentRelationshipsFromStrfry, it will add it to mutesToDeleteFromNeo4j.json.

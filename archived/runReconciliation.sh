#!/bin/bash

# runReconciliation.sh
# This script compares kind 3 events from strfry with Neo4j data and
# generates a queue of pubkeys that need their FOLLOWS relationships updated

# Source configuration
source /etc/hasenpfeffr.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

# Define paths
SCRIPT_DIR="/home/ubuntu/hasenpfeffr/pipeline/reconcile"
QUEUE_DIR="${SCRIPT_DIR}/queue"
TEMP_DIR="${SCRIPT_DIR}/temp"

# Create directories if they don't exist
mkdir -p "${QUEUE_DIR}"
mkdir -p "${TEMP_DIR}"

# Set up temporary files
STRFRY_EVENTS="${TEMP_DIR}/strfry_kind3_events.json"
NEO4J_USERS="${TEMP_DIR}/neo4j_users.json"
PUBKEYS_TO_QUEUE="${TEMP_DIR}/pubkeys_to_queue.txt"

echo "$(date): Starting reconciliation process..."

# Clean up any previous temporary files
rm -f "${TEMP_DIR}"/*

# Step 1: Get all kind 3 events from strfry
echo "$(date): Fetching kind 3 events from strfry..."
sudo strfry scan '{"kinds": [3]}' > "${STRFRY_EVENTS}"

# Count the number of events
EVENT_COUNT=$(wc -l < "${STRFRY_EVENTS}")
echo "$(date): Retrieved ${EVENT_COUNT} kind 3 events from strfry"

# Step 2: Get all NostrUser nodes with their kind3EventId from Neo4j
echo "$(date): Fetching NostrUser data from Neo4j..."
CYPHER_QUERY="MATCH (u:NostrUser) 
RETURN u.pubkey AS pubkey, u.kind3EventId AS eventId"

sudo cypher-shell -a "${NEO4J_URI}" -u "${NEO4J_USER}" -p "${NEO4J_PASSWORD}" "${CYPHER_QUERY}" --format plain > "${NEO4J_USERS}.raw"

# Process Neo4j output to clean it up (remove headers, footers, etc.)
tail -n +2 "${NEO4J_USERS}.raw" | head -n -1 > "${NEO4J_USERS}"
rm "${NEO4J_USERS}.raw"

# Create a lookup map of Neo4j users and their event IDs
echo "$(date): Creating lookup map of Neo4j users..."
declare -A neo4j_map
while IFS=, read -r pubkey eventId; do
    # Clean up the values (remove quotes, spaces, etc.)
    pubkey=$(echo "${pubkey}" | tr -d ' "')
    eventId=$(echo "${eventId}" | tr -d ' "')
    
    # Store in associative array
    neo4j_map["${pubkey}"]="${eventId}"
done < "${NEO4J_USERS}"

echo "$(date): Found $(wc -l < "${NEO4J_USERS}") NostrUser nodes in Neo4j"

# Step 3: Compare and identify pubkeys to queue
echo "$(date): Comparing data and identifying pubkeys to queue..."
> "${PUBKEYS_TO_QUEUE}"

# Process each strfry event
event_counter=0
while IFS= read -r event_json; do
    ((event_counter++))
    
    # Log progress every 1000 events
    if (( event_counter % 1000 == 0 )); then
        echo "$(date): Processed ${event_counter}/${EVENT_COUNT} events..."
    fi
    
    # Extract pubkey and id from the event
    pubkey=$(echo "${event_json}" | jq -r '.pubkey')
    event_id=$(echo "${event_json}" | jq -r '.id')
    
    # Check if pubkey exists in Neo4j and if event_id matches
    neo4j_event_id="${neo4j_map["${pubkey}"]}"
    
    # Add to queue if:
    # 1. Pubkey doesn't exist in Neo4j, OR
    # 2. Event ID in Neo4j is empty/null/undefined, OR
    # 3. Event ID in Neo4j doesn't match strfry event ID
    if [[ -z "${neo4j_event_id}" || "${neo4j_event_id}" == "null" || "${neo4j_event_id}" != "${event_id}" ]]; then
        echo "${pubkey}:${event_id}" >> "${PUBKEYS_TO_QUEUE}"
    fi
done < "${STRFRY_EVENTS}"

# Step 4: Create queue files for each pubkey
echo "$(date): Creating queue files for identified pubkeys..."
while IFS=: read -r pubkey event_id; do
    echo "${event_id}" > "${QUEUE_DIR}/${pubkey}"
done < "${PUBKEYS_TO_QUEUE}"

# Count the number of pubkeys queued
QUEUED_COUNT=$(wc -l < "${PUBKEYS_TO_QUEUE}")
echo "$(date): Queued ${QUEUED_COUNT} pubkeys for FOLLOWS update"

# Clean up temporary files
rm -f "${TEMP_DIR}"/*

echo "$(date): Reconciliation process completed successfully"

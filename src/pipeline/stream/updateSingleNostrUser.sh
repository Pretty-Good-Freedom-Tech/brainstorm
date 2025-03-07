#!/bin/bash

# Optimized script to update FOLLOWS relationships for a NostrUser
# Uses differential updates to minimize Neo4j operations
# Only adds new follows and removes obsolete ones

source /etc/hasenpfeffr.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

path_to_queue="/usr/local/lib/node_modules/hasenpfeffr/src/pipeline/stream/queue/"
tmp_dir="/usr/local/lib/node_modules/hasenpfeffr/src/pipeline/stream/queue_tmp"
mkdir -p "$tmp_dir"

# Get the next pubkey from the queue
pk_next_full_path=$(find "$path_to_queue" -type f -print0 | xargs -0 stat -c "%Y %n" | sort -n | head -n 1 | cut -d " " -f 2-)

# Extract pubkey from the full path
num_chars_in_path_to_queue=$(echo -n "$path_to_queue" | wc -c)
pk_follower="${pk_next_full_path:$num_chars_in_path_to_queue}"
echo "Processing pubkey: $pk_follower"

# Temporary files
current_follows_file="$tmp_dir/current_follows_$pk_follower.json"
new_follows_file="$tmp_dir/new_follows_$pk_follower.json"
follows_to_add_file="$tmp_dir/follows_to_add_$pk_follower.json"
follows_to_delete_file="$tmp_dir/follows_to_delete_$pk_follower.json"
kind3_events_file="$tmp_dir/kind3_events_$pk_follower.json"

# Step 1: Get current FOLLOWS relationships from Neo4j
echo "Fetching current FOLLOWS relationships from Neo4j..."
CYPHER_GET_CURRENT="
MATCH (u:NostrUser {pubkey:'$pk_follower'})-[r:FOLLOWS]->(followed:NostrUser)
RETURN u.pubkey AS pk_follower, followed.pubkey AS pk_followee
"
sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER_GET_CURRENT" --format plain > "$current_follows_file"

# Process the output to create a clean JSON array
if [ -s "$current_follows_file" ]; then
    # Create a temporary file for the JSON array
    echo "[" > "$tmp_dir/current_follows_clean.json"
    
    # Skip header and footer lines, convert to JSON format
    sed '1d;$d' "$current_follows_file" | while IFS= read -r line; do
        # Extract follower and followee from the line
        follower=$(echo "$line" | cut -d',' -f1 | tr -d ' "')
        followee=$(echo "$line" | cut -d',' -f2 | tr -d ' "')
        echo "  { \"pk_follower\": \"$follower\", \"pk_followee\": \"$followee\" }," >> "$tmp_dir/current_follows_clean.json"
    done
    
    # Remove the trailing comma from the last line if there are any entries
    if [ "$(wc -l < "$tmp_dir/current_follows_clean.json")" -gt 1 ]; then
        sed -i '$ s/,$//' "$tmp_dir/current_follows_clean.json"
    fi
    
    # Close the JSON array
    echo "]" >> "$tmp_dir/current_follows_clean.json"
    mv "$tmp_dir/current_follows_clean.json" "$current_follows_file"
else
    # Create empty JSON array if no current follows
    echo "[]" > "$current_follows_file"
fi

# Step 2: Get latest kind 3 event from strfry
echo "Fetching latest kind 3 event from strfry..."
sudo strfry scan "{ \"kinds\": [3], \"authors\": [\"$pk_follower\"]}" > "$kind3_events_file"

# Read the first event (most recent)
read -r kind3Event < "$kind3_events_file"

if [ -z "$kind3Event" ]; then
    echo "No kind 3 event found for $pk_follower. Removing from queue."
    sudo rm "$pk_next_full_path"
    rm -f "$current_follows_file" "$new_follows_file" "$follows_to_add_file" "$follows_to_delete_file" "$kind3_events_file"
    exit 0
fi

# Extract event details
EVENT_ID=$(echo $kind3Event | jq -r '.id')
PUBKEY=$(echo $kind3Event | jq -r '.pubkey')
CREATED_AT=$(echo $kind3Event | jq -r '.created_at')
TAGS=$(echo $kind3Event | jq -r '.tags')

# Step 3: Extract follows from kind 3 event
echo "Extracting follows from kind 3 event..."
# Create a JSON array for the new follows
echo "[" > "$new_follows_file"
follow_count=0

echo "$TAGS" | jq -c '.[]' | while read -r item; do
    tag=$(echo "$item" | jq -r '.[0]')
    if [ "$tag" == "p" ]; then
        pk_followee=$(echo "$item" | jq -r '.[1]')
        if [ $follow_count -gt 0 ]; then
            echo "," >> "$new_follows_file"
        fi
        echo "  { \"pk_follower\": \"$pk_follower\", \"pk_followee\": \"$pk_followee\" }" >> "$new_follows_file"
        follow_count=$((follow_count + 1))
    fi
done

# Close the JSON array
echo "]" >> "$new_follows_file"

# Step 4: Determine which follows to add and which to delete
echo "Calculating differential updates..."

# Use jq to calculate the differences
jq -s '.[0] - .[1]' "$new_follows_file" "$current_follows_file" > "$follows_to_add_file"
jq -s '.[1] - .[0]' "$new_follows_file" "$current_follows_file" > "$follows_to_delete_file"

# Count the operations
add_count=$(jq 'length' "$follows_to_add_file")
delete_count=$(jq 'length' "$follows_to_delete_file")
echo "Changes to make: $add_count additions, $delete_count deletions"

# Step 5: Apply the changes to Neo4j
if [ "$delete_count" -gt 0 ]; then
    echo "Deleting obsolete FOLLOWS relationships..."
    # Move the file to Neo4j import directory
    sudo cp "$follows_to_delete_file" /var/lib/neo4j/import/follows_to_delete.json
    sudo chown neo4j:neo4j /var/lib/neo4j/import/follows_to_delete.json
    
    # Delete obsolete follows
    CYPHER_DELETE="
    CALL apoc.periodic.iterate(
        \"CALL apoc.load.json('file:///follows_to_delete.json') YIELD value AS line\",
        \"
        MATCH (u1:NostrUser {pubkey:line.pk_follower})
        MATCH (u2:NostrUser {pubkey:line.pk_followee})
        MATCH (u1)-[r:FOLLOWS]->(u2)
        DELETE r
        \",
        {batchSize:100, parallel:false, retries:2}
    )
    "
    sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER_DELETE"
    sudo rm /var/lib/neo4j/import/follows_to_delete.json
fi

if [ "$add_count" -gt 0 ]; then
    echo "Adding new FOLLOWS relationships..."
    # Move the file to Neo4j import directory
    sudo cp "$follows_to_add_file" /var/lib/neo4j/import/follows_to_add.json
    sudo chown neo4j:neo4j /var/lib/neo4j/import/follows_to_add.json
    
    # Create nodes for new pubkeys first
    CYPHER_CREATE_NODES="
    // Create all nodes first
    CALL apoc.periodic.iterate(
        \"CALL apoc.load.json('file:///follows_to_add.json') YIELD value AS line RETURN DISTINCT line.pk_follower AS pubkey\",
        \"MERGE (u:NostrUser {pubkey: pubkey})\",
        {batchSize:100, parallel:false, retries:2}
    );

    CALL apoc.periodic.iterate(
        \"CALL apoc.load.json('file:///follows_to_add.json') YIELD value AS line RETURN DISTINCT line.pk_followee AS pubkey\",
        \"MERGE (u:NostrUser {pubkey: pubkey})\",
        {batchSize:100, parallel:false, retries:2}
    );
    "
    sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER_CREATE_NODES"
    
    # Create new follows
    CYPHER_ADD="
    CALL apoc.periodic.iterate(
        \"CALL apoc.load.json('file:///follows_to_add.json') YIELD value AS line\",
        \"
        MATCH (u1:NostrUser {pubkey:line.pk_follower})
        MATCH (u2:NostrUser {pubkey:line.pk_followee})
        MERGE (u1)-[:FOLLOWS]->(u2)
        \",
        {batchSize:100, parallel:false, retries:2}
    )
    "
    sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER_ADD"
    sudo rm /var/lib/neo4j/import/follows_to_add.json
fi

# Step 6: Update the metadata for the user node
echo "Updating user metadata..."
CYPHER_UPDATE_META="
MATCH (u:NostrUser {pubkey:'$pk_follower'}) 
SET u.kind3EventId='$EVENT_ID', u.kind3CreatedAt=$CREATED_AT
"
sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER_UPDATE_META"

# Step 7: Clean up
echo "Cleaning up..."
sudo rm "$pk_next_full_path"
rm -f "$current_follows_file" "$new_follows_file" "$follows_to_add_file" "$follows_to_delete_file" "$kind3_events_file"

echo "Successfully processed pubkey: $pk_follower"
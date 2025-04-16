#!/bin/bash

# Script to update FOLLOWS, MUTES, and REPORTS relationships for a NostrUser
# Uses differential updates to minimize Neo4j operations
# Only adds new relationships and removes obsolete ones

source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

path_to_queue="/var/lib/brainstorm/pipeline/stream/queue/"
tmp_dir="/var/lib/brainstorm/pipeline/stream/queue_tmp"
mkdir -p "$tmp_dir"

# Get the next pubkey and event kind from the queue
queue_file=$(find "$path_to_queue" -type f -print0 | xargs -0 stat -c "%Y %n" | sort -n | head -n 1 | cut -d " " -f 2-)

# Extract pubkey and kind from the queue file
num_chars_in_path_to_queue=$(echo -n "$path_to_queue" | wc -c)
queue_file_name="${queue_file:$num_chars_in_path_to_queue}"
IFS='_' read -r pk_author event_kind <<< "$queue_file_name"
echo "Processing pubkey: $pk_author for event kind: $event_kind"

# Determine relationship type based on event kind
if [ "$event_kind" == "3" ]; then
    relationship_type="FOLLOWS"
    tag_type="p"
elif [ "$event_kind" == "10000" ]; then
    relationship_type="MUTES"
    tag_type="p"
elif [ "$event_kind" == "1984" ]; then
    relationship_type="REPORTS"
    tag_type="p"
else
    echo "Unsupported event kind: $event_kind. Removing from queue."
    sudo rm "$queue_file"
    exit 0
fi

# Temporary files
current_relationships_file="$tmp_dir/current_${relationship_type}_$pk_author.json"
new_relationships_file="$tmp_dir/new_${relationship_type}_$pk_author.json"
relationships_to_add_file="$tmp_dir/to_add_${relationship_type}_$pk_author.json"
relationships_to_delete_file="$tmp_dir/to_delete_${relationship_type}_$pk_author.json"
events_file="$tmp_dir/events_${event_kind}_$pk_author.json"

# Step 1: Get current relationships from Neo4j
echo "Fetching current $relationship_type relationships from Neo4j..."
CYPHER_GET_CURRENT="
MATCH (u:NostrUser {pubkey:'$pk_author'})-[r:$relationship_type]->(target:NostrUser)
RETURN u.pubkey AS pk_author, target.pubkey AS pk_target
"
sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER_GET_CURRENT" --format plain > "$current_relationships_file"

# Process the output to create a clean JSON array
if [ -s "$current_relationships_file" ]; then
    # Create a temporary file for the JSON array
    echo "[" > "$tmp_dir/current_clean.json"
    
    # Skip header and footer lines, convert to JSON format
    sed '1d;$d' "$current_relationships_file" | while IFS= read -r line; do
        # Extract author and target from the line
        author=$(echo "$line" | cut -d',' -f1 | tr -d ' "')
        target=$(echo "$line" | cut -d',' -f2 | tr -d ' "')
        echo "  { \"pk_author\": \"$author\", \"pk_target\": \"$target\" }," >> "$tmp_dir/current_clean.json"
    done
    
    # Remove the trailing comma from the last line if there are any entries
    if [ "$(wc -l < "$tmp_dir/current_clean.json")" -gt 1 ]; then
        sed -i '$ s/,$//' "$tmp_dir/current_clean.json"
    fi
    
    # Close the JSON array
    echo "]" >> "$tmp_dir/current_clean.json"
    mv "$tmp_dir/current_clean.json" "$current_relationships_file"
else
    # Create empty JSON array if no current relationships
    echo "[]" > "$current_relationships_file"
fi

# Step 2: Get latest event from strfry
echo "Fetching latest kind $event_kind event from strfry..."
sudo strfry scan "{ \"kinds\": [$event_kind], \"authors\": [\"$pk_author\"]}" > "$events_file"

# Read the first event (most recent)
read -r event < "$events_file"

if [ -z "$event" ]; then
    echo "No kind $event_kind event found for $pk_author. Removing from queue."
    sudo rm "$queue_file"
    rm -f "$current_relationships_file" "$new_relationships_file" "$relationships_to_add_file" "$relationships_to_delete_file" "$events_file"
    exit 0
fi

# Extract event details
EVENT_ID=$(echo $event | jq -r '.id')
PUBKEY=$(echo $event | jq -r '.pubkey')
CREATED_AT=$(echo $event | jq -r '.created_at')
TAGS=$(echo $event | jq -r '.tags')

# Step 3: Extract targets from event
echo "Extracting $tag_type tags from kind $event_kind event..."
# Create a JSON array for the new relationships
echo "[" > "$new_relationships_file"
target_count=0

echo "$TAGS" | jq -c '.[]' | while read -r item; do
    tag=$(echo "$item" | jq -r '.[0]')
    if [ "$tag" == "$tag_type" ]; then
        pk_target=$(echo "$item" | jq -r '.[1]')
        if [ $target_count -gt 0 ]; then
            echo "," >> "$new_relationships_file"
        fi
        echo "  { \"pk_author\": \"$pk_author\", \"pk_target\": \"$pk_target\" }" >> "$new_relationships_file"
        target_count=$((target_count + 1))
    fi
done

# Close the JSON array
echo "]" >> "$new_relationships_file"

# Step 4: Determine which relationships to add and which to delete
echo "Calculating differential updates..."

# Use jq to calculate the differences
jq -s '.[0] - .[1]' "$new_relationships_file" "$current_relationships_file" > "$relationships_to_add_file"
jq -s '.[1] - .[0]' "$new_relationships_file" "$current_relationships_file" > "$relationships_to_delete_file"

# Count the operations
add_count=$(jq 'length' "$relationships_to_add_file")
delete_count=$(jq 'length' "$relationships_to_delete_file")
echo "Changes to make: $add_count additions, $delete_count deletions"

# Step 5: Apply the changes to Neo4j
if [ "$delete_count" -gt 0 ]; then
    echo "Deleting obsolete $relationship_type relationships..."
    # Move the file to Neo4j import directory
    sudo cp "$relationships_to_delete_file" /var/lib/neo4j/import/relationships_to_delete.json
    sudo chown neo4j:neo4j /var/lib/neo4j/import/relationships_to_delete.json
    
    # Delete obsolete relationships
    CYPHER_DELETE="
    CALL apoc.periodic.iterate(
        \"CALL apoc.load.json('file:///relationships_to_delete.json') YIELD value AS line\",
        \"
        MATCH (u1:NostrUser {pubkey:line.pk_author})
        MATCH (u2:NostrUser {pubkey:line.pk_target})
        MATCH (u1)-[r:$relationship_type]->(u2)
        DELETE r
        \",
        {batchSize:100, parallel:false, retries:2}
    )
    "
    sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER_DELETE"
    sudo rm /var/lib/neo4j/import/relationships_to_delete.json
fi

if [ "$add_count" -gt 0 ]; then
    echo "Adding new $relationship_type relationships..."
    # Move the file to Neo4j import directory
    sudo cp "$relationships_to_add_file" /var/lib/neo4j/import/relationships_to_add.json
    sudo chown neo4j:neo4j /var/lib/neo4j/import/relationships_to_add.json
    
    # Create nodes for new pubkeys first
    CYPHER_CREATE_NODES="
    // Create all nodes first
    CALL apoc.periodic.iterate(
        \"CALL apoc.load.json('file:///relationships_to_add.json') YIELD value AS line RETURN DISTINCT line.pk_author AS pubkey\",
        \"MERGE (u:NostrUser {pubkey: pubkey})\",
        {batchSize:100, parallel:false, retries:2}
    );

    CALL apoc.periodic.iterate(
        \"CALL apoc.load.json('file:///relationships_to_add.json') YIELD value AS line RETURN DISTINCT line.pk_target AS pubkey\",
        \"MERGE (u:NostrUser {pubkey: pubkey})\",
        {batchSize:100, parallel:false, retries:2}
    );
    "
    sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER_CREATE_NODES"
    
    # Create new relationships with timestamp property
    CYPHER_ADD="
    CALL apoc.periodic.iterate(
        \"CALL apoc.load.json('file:///relationships_to_add.json') YIELD value AS line\",
        \"
        MATCH (u1:NostrUser {pubkey:line.pk_author})
        MATCH (u2:NostrUser {pubkey:line.pk_target})
        MERGE (u1)-[r:$relationship_type]->(u2)
        SET r.timestamp = $CREATED_AT
        \",
        {batchSize:100, parallel:false, retries:2}
    )
    "
    sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER_ADD"
    sudo rm /var/lib/neo4j/import/relationships_to_add.json
fi

# Step 6: Update the metadata for the user node
echo "Updating user metadata..."
CYPHER_UPDATE_META="
MATCH (u:NostrUser {pubkey:'$pk_author'}) 
SET u.kind${event_kind}EventId='$EVENT_ID', u.kind${event_kind}CreatedAt=$CREATED_AT
"
sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER_UPDATE_META"

# Step 7: Clean up
echo "Cleaning up..."
sudo rm "$queue_file"
rm -f "$current_relationships_file" "$new_relationships_file" "$relationships_to_add_file" "$relationships_to_delete_file" "$events_file"

echo "Successfully processed pubkey: $pk_author for event kind: $event_kind"

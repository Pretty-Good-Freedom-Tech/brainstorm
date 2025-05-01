#!/bin/bash

# Update Neo4j database with new content
# Process one content event at a time
# Extract the author pubkey and the created_at from the event

# Do not create a node for the author if it doesn't exist
# Do not create a node for the event if it doesn't exist
# Do not create a relationship between the author and the event

source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

path_to_queue="/var/lib/brainstorm/pipeline/stream/content/queue/"
tmp_dir="/var/lib/brainstorm/pipeline/stream/content/queue_tmp"
mkdir -p "$tmp_dir"

# Get the next pubkey, event kind, and created_at from the queue
queue_file=$(find "$path_to_queue" -type f -print0 | xargs -0 stat -c "%Y %n" | sort -n | head -n 1 | cut -d " " -f 2-)

# Extract pubkey, kind, and created_at from the queue file
num_chars_in_path_to_queue=$(echo -n "$path_to_queue" | wc -c)
queue_file_name="${queue_file:$num_chars_in_path_to_queue}"
IFS='_' read -r pk_author event_kind <<< "$queue_file_name"
CREATED_AT=$(echo -n "$queue_file_name" | cut -d'_' -f3)
echo "Processing pubkey: $pk_author for event kind: $event_kind and created_at: $CREATED_AT"

# Update the metadata for the author node
# MATCH (u:NostrUser {pubkey:'$pk_author'})
# SET u.latestContentEventCreatedAt=$CREATED_AT

CYPHER_UPDATE_META="
MATCH (u:NostrUser {pubkey:'$pk_author'})
SET u.latestContentEventCreatedAt=$CREATED_AT
"
sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER_UPDATE_META"

# Step 7: Clean up
echo "Cleaning up..."
sudo rm "$queue_file"

echo "Successfully processed pubkey: $pk_author for event kind: $event_kind and created_at: $CREATED_AT"
exit 0

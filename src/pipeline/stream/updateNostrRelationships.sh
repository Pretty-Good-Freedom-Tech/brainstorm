#!/bin/bash

# Script to update FOLLOWS, MUTES, and REPORTS relationships for a NostrUser
# Uses differential updates to minimize Neo4j operations
# Only adds new relationships and removes obsolete ones

source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

path_to_queue="/var/lib/brainstorm/pipeline/stream/queue/"
tmp_dir="/var/lib/brainstorm/pipeline/stream/queue_tmp"
mkdir -p "$tmp_dir"

cypher_script="$tmp_dir/batch_update_$$.cypher"
> "$cypher_script"

# Loop over all provided queue files
for queue_file in "$@"; do
    # Extract pubkey and kind from the queue file
    queue_file_name=$(basename "$queue_file")
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
        continue
    fi

    # Temporary files
    current_relationships_file="$tmp_dir/current_${relationship_type}_$pk_author.json"
    new_relationships_file="$tmp_dir/new_${relationship_type}_$pk_author.json"
    relationships_to_add_file="$tmp_dir/to_add_${relationship_type}_$pk_author.json"
    relationships_to_delete_file="$tmp_dir/to_delete_${relationship_type}_$pk_author.json"
    events_file="$tmp_dir/events_${event_kind}_$pk_author.json"

    # Step 1: Get current relationships from Neo4j
    CYPHER_GET_CURRENT="
    MATCH (u:NostrUser {pubkey:'$pk_author'})-[r:$relationship_type]->(target:NostrUser)
    RETURN u.pubkey AS pk_author, target.pubkey AS pk_target
    "
    sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER_GET_CURRENT" --format plain > "$current_relationships_file"

    # Process the output to create a clean JSON array
    if [ -s "$current_relationships_file" ]; then
        echo "[" > "$tmp_dir/current_clean.json"
        sed '1d;$d' "$current_relationships_file" | while IFS= read -r line; do
            author=$(echo "$line" | cut -d',' -f1 | tr -d ' "')
            target=$(echo "$line" | cut -d',' -f2 | tr -d ' "')
            echo "  { \"pk_author\": \"$author\", \"pk_target\": \"$target\" }," >> "$tmp_dir/current_clean.json"
        done
        if [ "$(wc -l < "$tmp_dir/current_clean.json")" -gt 1 ]; then
            sed -i '$ s/,$//' "$tmp_dir/current_clean.json"
        fi
        echo "]" >> "$tmp_dir/current_clean.json"
        mv "$tmp_dir/current_clean.json" "$current_relationships_file"
    else
        echo "[]" > "$current_relationships_file"
    fi

    # Step 2: Get latest event from strfry
    sudo strfry scan "{ \"kinds\": [$event_kind], \"authors\": [\"$pk_author\"]}" > "$events_file"

    # Read the first event (most recent)
    read -r event < "$events_file"

    if [ -z "$event" ]; then
        echo "No kind $event_kind event found for $pk_author. Removing from queue."
        sudo rm "$queue_file"
        rm -f "$current_relationships_file" "$new_relationships_file" "$relationships_to_add_file" "$relationships_to_delete_file" "$events_file"
        continue
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

    # Step 5: Build Cypher for adds and deletes
    # Add deletes
    if [ -s "$relationships_to_delete_file" ]; then
        jq -c '.[]' "$relationships_to_delete_file" | while read -r rel; do
            pk_target=$(echo "$rel" | jq -r '.pk_target')
            echo "MATCH (a:NostrUser {pubkey: '$pk_author'})-[r:$relationship_type]->(b:NostrUser {pubkey: '$pk_target'}) DELETE r;" >> "$cypher_script"
        done
    fi
    # Add creates
    if [ -s "$relationships_to_add_file" ]; then
        jq -c '.[]' "$relationships_to_add_file" | while read -r rel; do
            pk_target=$(echo "$rel" | jq -r '.pk_target')
            echo "MATCH (a:NostrUser {pubkey: '$pk_author'}), (b:NostrUser {pubkey: '$pk_target'}) MERGE (a)-[:$relationship_type]->(b);" >> "$cypher_script"
        done
    fi

    # Step 6: Update the metadata for the user node
    echo "Updating user metadata..."
    CYPHER_UPDATE_META="
    MATCH (u:NostrUser {pubkey:'$pk_author'}) 
    SET u.kind${event_kind}EventId='$EVENT_ID', u.kind${event_kind}CreatedAt=$CREATED_AT
    "
    echo "$CYPHER_UPDATE_META" >> "$cypher_script"

done

# Run the batch Cypher script in a single transaction
if [ -s "$cypher_script" ]; then
    sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" < "$cypher_script"
    status=$?
    echo "Cypher transaction completed with status $status"
    if [ $status -eq 0 ]; then
        # Remove all processed queue files
        for queue_file in "$@"; do
            sudo rm "$queue_file"
            echo "Removed $queue_file"
        done
        # Remove temporary files
        rm -f "$tmp_dir"/*
    else
        echo "Cypher transaction failed, not removing queue files."
    fi
else
    echo "No valid events to process."
fi

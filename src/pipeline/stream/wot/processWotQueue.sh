#!/bin/bash

# Updated to process in batches rather than one at a time

# Source configuration
source /etc/brainstorm.conf

# Path to queue directory
QUEUE_DIR="/var/lib/brainstorm/pipeline/stream/queue/"
LOCK_FILE="/var/lock/processQueue.lock"
BATCH_SIZE=20

# Ensure only one instance runs at a time
exec {LOCK_FD}>${LOCK_FILE}
if ! flock -n ${LOCK_FD}; then
    echo "Another instance of processQueue.sh is already running. Exiting."
    exit 1
fi

# Main processing loop
while true; do
    # List up to BATCH_SIZE files from the queue, oldest first
    queue_files=($(ls -1tr ${QUEUE_DIR} 2>/dev/null | head -n $BATCH_SIZE))
    NUM_FILES=${#queue_files[@]}

    if [[ "$NUM_FILES" -gt 0 ]]; then
        echo "$(date): Processing $NUM_FILES events from the queue"
        queue_file_paths=()
        for file in "${queue_files[@]}"; do
            queue_file_paths+=("${QUEUE_DIR}${file}")
        done
        /usr/local/lib/node_modules/brainstorm/src/pipeline/stream/wot/updateNostrRelationships.sh "${queue_file_paths[@]}"
        # (Assume updateNostrRelationships.sh removes the files on success)
        # Optionally: short pause to avoid overloading
        # sleep 1
    else
        echo "$(date): No events in queue; sleeping 60 seconds and checking again"
        sleep 60
    fi
done

# Release lock (this should never be reached due to the infinite loop)
flock -u ${LOCK_FD}
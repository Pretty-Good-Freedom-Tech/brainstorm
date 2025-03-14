#!/bin/bash

# Source configuration
source /etc/hasenpfeffr.conf

# Path to queue directory
QUEUE_DIR="/var/lib/hasenpfeffr/pipeline/stream/queue/"
LOCK_FILE="/var/lock/processQueue.lock"

# Ensure only one instance runs at a time
exec {LOCK_FD}>${LOCK_FILE}
if ! flock -n ${LOCK_FD}; then
    echo "Another instance of processQueue.sh is already running. Exiting."
    exit 1
fi

# Main processing loop
while true; do
    # Count files in queue
    NUM_FILES=$(ls -1 ${QUEUE_DIR} 2>/dev/null | wc -l)

    if [[ "$NUM_FILES" -gt 0 ]]; then
        echo "$(date): There are $NUM_FILES events in the queue waiting to be processed"

        # Process one event
        /usr/local/lib/node_modules/hasenpfeffr/src/pipeline/stream/updateNostrRelationships.sh

        # Short pause between processing to avoid overloading the system
        # sleep 1
    else
        echo "$(date): No events in queue; sleeping 60 seconds and checking again"
        sleep 60
    fi
done

# Release lock (this should never be reached due to the infinite loop)
flock -u ${LOCK_FD}
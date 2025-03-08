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
    # Count pubkeys in queue
    NUM_PUBKEYS=$(ls -1 ${QUEUE_DIR} 2>/dev/null | wc -l)

    if [[ "$NUM_PUBKEYS" -gt 0 ]]; then
        echo "$(date): There are $NUM_PUBKEYS pubkeys in the queue waiting for their follows to be updated"

        # Process one pubkey
        /usr/local/lib/node_modules/hasenpfeffr/src/pipeline/stream/updateSingleNostrUser.sh

        # Short pause between processing to avoid overloading the system
        # sleep 1
    else
        echo "$(date): No pubkeys in queue; sleeping 60 seconds and checking again"
        sleep 60
    fi
done

# Release lock (this should never be reached due to the infinite loop)
flock -u ${LOCK_FD}
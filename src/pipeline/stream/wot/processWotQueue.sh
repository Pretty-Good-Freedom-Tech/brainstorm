#!/bin/bash

# Updated to process in batches rather than one at a time

# Source configuration
source /etc/brainstorm.conf

# Path to queue directory
QUEUE_DIR="/var/lib/brainstorm/pipeline/stream/queue/"
LOCK_FILE="/var/lock/processQueue.lock"
BATCH_SIZE=20
LOG_FILE="/var/log/brainstorm/calculatePersonalizedGrapeRank.log"

# Ensure only one instance runs at a time
exec {LOCK_FD}>${LOCK_FILE}
if ! flock -n ${LOCK_FD}; then
    echo "Another instance of processQueue.sh is already running. Exiting."
    exit 1
fi

check_graperank_status() {
    # Get last start and finish timestamps (in seconds since epoch)
    last_start=$(grep "Starting calculatePersonalizedGrapeRank" "$LOG_FILE" | tail -1 | awk '{print $1" "$2}')
    last_finish=$(grep "Finished calculatePersonalizedGrapeRank" "$LOG_FILE" | tail -1 | awk '{print $1" "$2}')

    last_start_epoch=0
    last_finish_epoch=0

    if [ -n "$last_start" ]; then
        last_start_epoch=$(date -d "$last_start" +%s)
    fi
    if [ -n "$last_finish" ]; then
        last_finish_epoch=$(date -d "$last_finish" +%s)
    fi

    now_epoch=$(date +%s)

    if [ "$last_start_epoch" -gt "$last_finish_epoch" ]; then
        # GrapeRank is running
        age=$((now_epoch - last_start_epoch))
        if [ "$age" -gt 900 ]; then
            echo "$(date): WARNING: calculatePersonalizedGrapeRank appears to be stalled (started $age seconds ago)."
            # Optionally: take action if stalled
            return 0
        else
            echo "$(date): calculatePersonalizedGrapeRank is running, sleeping 2 minutes and will check again."
            sleep 120
            return 1
        fi
    fi
    # Not running or just finished
    return 0
}

# Main processing loop
while true; do
    # Check if GrapeRank is running or stalled
    check_graperank_status
    [ $? -ne 0 ] && continue

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
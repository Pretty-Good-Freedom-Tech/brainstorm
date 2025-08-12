#!/bin/bash
# Outline of method to detect if a process is running and take action if it is not
# We could package this into a function and call it from multiple places

brainstormTaskMonitor() {
    TASK_NAME="$1"
    while true; do
        if ! pgrep -x "$TASK_NAME" > /dev/null; then
            echo "Error: Process '$TASK_NAME' is not running!" >&2
            # Add actions here, e.g., restart the process, send an alert
            exit 1
        fi
        sleep 5 # Check every 5 seconds
    done
}

export -f brainstormTaskMonitor
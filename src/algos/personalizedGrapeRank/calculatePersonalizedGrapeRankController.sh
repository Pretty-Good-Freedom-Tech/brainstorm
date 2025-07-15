#!/bin/bash

# This script controls the execution of calculatePersonalizedGrapeRank.sh with timeout and retry logic
# It ensures the GrapeRank calculation completes within a reasonable time frame

# Source configuration
source /etc/brainstorm.conf # BRAINSTORM_MODULE_ALGOS_DIR, BRAINSTORM_LOG_DIR

# Set the timeout in seconds (20 minutes = 1200 seconds)
TIMEOUT=1200
# Maximum number of retry attempts
MAX_RETRIES=3
# Current retry count
RETRY_COUNT=0

# Log file for controller operations
LOG_FILE="$BRAINSTORM_LOG_DIR/calculatePersonalizedGrapeRankController.log"

# Create log directory if it doesn't exist
mkdir -p "$(dirname "$LOG_FILE")"
touch "$LOG_FILE"
sudo chown brainstorm:brainstorm "$LOG_FILE"

# Log start time
echo "$(date): Starting calculatePersonalizedGrapeRankController"
echo "$(date): Starting calculatePersonalizedGrapeRankController" >> "$LOG_FILE"

# Function to run the script with a timeout
run_with_timeout() {
    # Create a unique marker file to detect completion
    COMPLETION_MARKER="/tmp/graperank_completed_$(date +%s)"
    
    # Run the script in background
    {
        sudo $BRAINSTORM_MODULE_ALGOS_DIR/personalizedGrapeRank/calculatePersonalizedGrapeRank.sh
        # Create marker file upon successful completion
        touch "$COMPLETION_MARKER"
    } &
    
    # Get the background process ID
    BG_PID=$!
    
    # Wait for either completion or timeout
    ELAPSED=0
    SLEEP_INTERVAL=10
    
    while [ $ELAPSED -lt $TIMEOUT ]; do
        # Check if the process is still running
        if ! ps -p $BG_PID > /dev/null; then
            # Process has finished, check if it completed successfully
            if [ -f "$COMPLETION_MARKER" ]; then
                echo "$(date): calculatePersonalizedGrapeRank.sh completed successfully after $ELAPSED seconds"
                echo "$(date): calculatePersonalizedGrapeRank.sh completed successfully after $ELAPSED seconds" >> "$LOG_FILE"
                rm -f "$COMPLETION_MARKER"
                return 0
            else
                echo "$(date): calculatePersonalizedGrapeRank.sh exited prematurely without completion marker"
                echo "$(date): calculatePersonalizedGrapeRank.sh exited prematurely without completion marker" >> "$LOG_FILE"
                return 1
            fi
        fi
        
        # Sleep for interval and update elapsed time
        sleep $SLEEP_INTERVAL
        ELAPSED=$((ELAPSED + SLEEP_INTERVAL))
        
        # Optional: log progress every 2 minutes
        if [ $((ELAPSED % 120)) -eq 0 ]; then
            echo "$(date): calculatePersonalizedGrapeRank.sh still running after $ELAPSED seconds"
            echo "$(date): calculatePersonalizedGrapeRank.sh still running after $ELAPSED seconds" >> "$LOG_FILE"
        fi
    done
    
    # If we get here, we've timed out
    echo "$(date): calculatePersonalizedGrapeRank.sh timed out after $TIMEOUT seconds"
    echo "$(date): calculatePersonalizedGrapeRank.sh timed out after $TIMEOUT seconds" >> "$LOG_FILE"
    
    # Kill the background process and its children
    sudo pkill -P $BG_PID 2>/dev/null
    sudo kill -9 $BG_PID 2>/dev/null
    
    # Clean up marker file if it exists
    rm -f "$COMPLETION_MARKER"
    
    return 1
}

# Run with retries
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    echo "$(date): Attempt $(($RETRY_COUNT + 1)) of $MAX_RETRIES to run calculatePersonalizedGrapeRank.sh"
    echo "$(date): Attempt $(($RETRY_COUNT + 1)) of $MAX_RETRIES to run calculatePersonalizedGrapeRank.sh" >> "$LOG_FILE"
    
    # Run the script with timeout
    run_with_timeout
    
    # Check if it was successful
    if [ $? -eq 0 ]; then
        echo "$(date): calculatePersonalizedGrapeRank.sh completed successfully"
        echo "$(date): calculatePersonalizedGrapeRank.sh completed successfully" >> "$LOG_FILE"
        break
    fi
    
    # Increment retry count
    RETRY_COUNT=$((RETRY_COUNT + 1))
    
    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
        echo "$(date): Retrying calculatePersonalizedGrapeRank.sh in 30 seconds..."
        echo "$(date): Retrying calculatePersonalizedGrapeRank.sh in 30 seconds..." >> "$LOG_FILE"
        sleep 30
    else
        echo "$(date): Maximum retry attempts ($MAX_RETRIES) reached. Giving up."
        echo "$(date): Maximum retry attempts ($MAX_RETRIES) reached. Giving up." >> "$LOG_FILE"
        exit 1
    fi
done

# Log end time
echo "$(date): Finished calculatePersonalizedGrapeRankController"
echo "$(date): Finished calculatePersonalizedGrapeRankController" >> "$LOG_FILE"

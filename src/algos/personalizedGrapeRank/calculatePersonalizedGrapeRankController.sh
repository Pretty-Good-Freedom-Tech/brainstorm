#!/bin/bash
set -e          # Exit immediately on command failure
set -o pipefail # Fail if any pipeline command fails

# This script controls the execution of calculatePersonalizedGrapeRank.sh with timeout and retry logic
# It ensures the GrapeRank calculation completes within a reasonable time frame

# Source configuration
source /etc/brainstorm.conf # BRAINSTORM_MODULE_ALGOS_DIR, BRAINSTORM_LOG_DIR

# Source structured logging utilities
source "$BRAINSTORM_MODULE_BASE_DIR/src/utils/structuredLogging.sh"

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

# Emit structured event for task start
emit_task_event "TASK_START" "calculateOwnerGrapeRank" "$BRAINSTORM_OWNER_PUBKEY" '{
    "message": "Starting owner-level GrapeRank calculation with timeout and retry control",
    "task_type": "algorithm_controller",
    "algorithm": "personalized_graperank",
    "scope": "owner",
    "timeout_seconds": '$TIMEOUT',
    "max_retries": '$MAX_RETRIES',
    "child_script": "calculatePersonalizedGrapeRank.sh",
    "category": "algorithms",
    "parent_task": "processAllTasks"
}'

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
                
                # Emit structured success event
                emit_task_event "PROGRESS" "calculateOwnerGrapeRank" "$BRAINSTORM_OWNER_PUBKEY" '{
                    "message": "GrapeRank algorithm completed successfully",
                    "phase": "algorithm_execution",
                    "step": "child_script_success",
                    "elapsed_seconds": '$ELAPSED',
                    "status": "success",
                    "child_script": "calculatePersonalizedGrapeRank.sh",
                    "algorithm": "personalized_graperank"
                }'
                
                rm -f "$COMPLETION_MARKER"
                return 0
            else
                echo "$(date): calculatePersonalizedGrapeRank.sh exited prematurely without completion marker"
                echo "$(date): calculatePersonalizedGrapeRank.sh exited prematurely without completion marker" >> "$LOG_FILE"
                
                # Emit structured premature exit event
                emit_task_event "PROGRESS" "calculateOwnerGrapeRank" "$BRAINSTORM_OWNER_PUBKEY" '{
                    "message": "GrapeRank algorithm exited prematurely",
                    "phase": "algorithm_execution",
                    "step": "child_script_premature_exit",
                    "elapsed_seconds": '$ELAPSED',
                    "status": "failed",
                    "error_reason": "premature_exit_no_completion_marker",
                    "child_script": "calculatePersonalizedGrapeRank.sh",
                    "algorithm": "personalized_graperank"
                }'
                
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
            
            # Emit structured progress event
            emit_task_event "PROGRESS" "calculateOwnerGrapeRank" "$BRAINSTORM_OWNER_PUBKEY" '{
                "message": "GrapeRank algorithm still executing",
                "phase": "algorithm_execution",
                "step": "progress_check",
                "elapsed_seconds": '$ELAPSED',
                "timeout_seconds": '$TIMEOUT',
                "progress_percentage": '$((ELAPSED * 100 / TIMEOUT))',
                "child_script": "calculatePersonalizedGrapeRank.sh",
                "algorithm": "personalized_graperank"
            }'
        fi
    done
    
    # If we get here, we've timed out
    echo "$(date): calculatePersonalizedGrapeRank.sh timed out after $TIMEOUT seconds"
    echo "$(date): calculatePersonalizedGrapeRank.sh timed out after $TIMEOUT seconds" >> "$LOG_FILE"
    
    # Emit structured timeout event
    emit_task_event "PROGRESS" "calculateOwnerGrapeRank" "$BRAINSTORM_OWNER_PUBKEY" '{
        "message": "GrapeRank algorithm timed out",
        "phase": "algorithm_execution",
        "step": "child_script_timeout",
        "elapsed_seconds": '$ELAPSED',
        "timeout_seconds": '$TIMEOUT',
        "status": "timeout",
        "error_reason": "execution_timeout",
        "child_script": "calculatePersonalizedGrapeRank.sh",
        "algorithm": "personalized_graperank"
    }'
    
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
    
    # Emit structured retry attempt event
    emit_task_event "PROGRESS" "calculateOwnerGrapeRank" "$BRAINSTORM_OWNER_PUBKEY" '{
        "message": "Starting GrapeRank algorithm attempt",
        "phase": "retry_management",
        "step": "attempt_start",
        "attempt_number": '$((RETRY_COUNT + 1))',
        "max_retries": '$MAX_RETRIES',
        "child_script": "calculatePersonalizedGrapeRank.sh",
        "algorithm": "personalized_graperank"
    }'
    
    # Run the script with timeout
    run_with_timeout
    
    # Check if it was successful
    if [ $? -eq 0 ]; then
        echo "$(date): calculatePersonalizedGrapeRank.sh completed successfully"
        echo "$(date): calculatePersonalizedGrapeRank.sh completed successfully" >> "$LOG_FILE"
        
        # Emit structured success event
        emit_task_event "PROGRESS" "calculateOwnerGrapeRank" "$BRAINSTORM_OWNER_PUBKEY" '{
            "message": "GrapeRank algorithm attempt succeeded",
            "phase": "retry_management",
            "step": "attempt_success",
            "attempt_number": '$((RETRY_COUNT + 1))',
            "max_retries": '$MAX_RETRIES',
            "status": "success",
            "child_script": "calculatePersonalizedGrapeRank.sh",
            "algorithm": "personalized_graperank"
        }'
        
        break
    fi
    
    # Increment retry count
    RETRY_COUNT=$((RETRY_COUNT + 1))
    
    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
        echo "$(date): Retrying calculatePersonalizedGrapeRank.sh in 30 seconds..."
        echo "$(date): Retrying calculatePersonalizedGrapeRank.sh in 30 seconds..." >> "$LOG_FILE"
        
        # Emit structured retry backoff event
        emit_task_event "PROGRESS" "calculateOwnerGrapeRank" "$BRAINSTORM_OWNER_PUBKEY" '{
            "message": "GrapeRank algorithm attempt failed, retrying",
            "phase": "retry_management",
            "step": "retry_backoff",
            "attempt_number": '$((RETRY_COUNT + 1))',
            "max_retries": '$MAX_RETRIES',
            "backoff_seconds": 30,
            "status": "retrying",
            "child_script": "calculatePersonalizedGrapeRank.sh",
            "algorithm": "personalized_graperank"
        }'
        
        sleep 30
    else
        echo "$(date): Maximum retry attempts ($MAX_RETRIES) reached. Giving up."
        echo "$(date): Maximum retry attempts ($MAX_RETRIES) reached. Giving up." >> "$LOG_FILE"
        
        # Emit structured max retries failure event
        emit_task_event "TASK_ERROR" "calculateOwnerGrapeRank" "$BRAINSTORM_OWNER_PUBKEY" '{
            "message": "GrapeRank algorithm failed after maximum retry attempts",
            "status": "failed",
            "task_type": "algorithm_controller",
            "algorithm": "personalized_graperank",
            "max_retries": '$MAX_RETRIES',
            "error_reason": "max_retries_exceeded",
            "child_script": "calculatePersonalizedGrapeRank.sh",
            "category": "algorithms",
            "scope": "owner",
            "parent_task": "processAllTasks"
        }'
        
        exit 1
    fi
done

# Emit structured completion event
emit_task_event "TASK_END" "calculateOwnerGrapeRank" "$BRAINSTORM_OWNER_PUBKEY" '{
    "message": "Owner-level GrapeRank calculation completed successfully",
    "status": "success",
    "task_type": "algorithm_controller",
    "algorithm": "personalized_graperank",
    "attempts_used": '$((RETRY_COUNT + 1))',
    "max_retries": '$MAX_RETRIES',
    "timeout_seconds": '$TIMEOUT',
    "child_script": "calculatePersonalizedGrapeRank.sh",
    "category": "algorithms",
    "scope": "owner",
    "parent_task": "processAllTasks"
}'

# Log end time
echo "$(date): Finished calculatePersonalizedGrapeRankController"
echo "$(date): Finished calculatePersonalizedGrapeRankController" >> "$LOG_FILE"

exit 0  # Explicit success exit code for parent script orchestration
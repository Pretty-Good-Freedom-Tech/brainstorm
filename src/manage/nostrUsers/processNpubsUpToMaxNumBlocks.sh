#!/bin/bash
set -e          # Exit immediately on command failure
set -o pipefail # Fail if any pipeline command fails

# processNpubsUpToMaxNumBlocks.sh - Repeatedly run processNpubsOneBlock.sh until all NostrUser nodes have npub property
# This script ensures complete coverage by running processNpubsOneBlock in a loop until no more npubs need to be generated

# Source configuration
source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR, NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

# Source structured logging utilities
source "$BRAINSTORM_MODULE_BASE_DIR/src/utils/structuredLogging.sh"

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Log file for complete npubs operations
LOG_FILE="$BRAINSTORM_LOG_DIR/processNpubsUpToMaxNumBlocks.log"
touch "$LOG_FILE"
sudo chown brainstorm:brainstorm $LOG_FILE

echo "$(date): Starting processNpubsUpToMaxNumBlocks"
echo "$(date): Starting processNpubsUpToMaxNumBlocks" >> ${LOG_FILE}

# Function to log messages
log_message() {
    local message="$1"
    echo "$(date): $message"
    echo "$(date): $message" >> "$LOG_FILE"
}

# Default MAX_ITERATIONS
MAX_ITERATIONS=50

# allow MAX_ITERATIONS as an optional parameter
if [ "$1" ]; then
    MAX_ITERATIONS=$1
fi

# Function to count NostrUsers missing npub property
count_missing_npubs() {
    local count_query="
    MATCH (u:NostrUser) 
    WHERE u.pubkey IS NOT NULL 
      AND (u.npub IS NULL OR u.npub = '') 
      AND u.hops < 100
    RETURN count(u) as missing_count
    "
    
    local result=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" \
        "$count_query" 2>/dev/null | tail -n 1 | tr -d '"' || echo "0")
    
    echo "$result"
}

# Function to count total NostrUsers with pubkey
count_total_users() {
    local count_query="
    MATCH (u:NostrUser) 
    WHERE u.pubkey IS NOT NULL 
      AND u.hops < 100
    RETURN count(u) as total_count
    "
    
    local result=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" \
        "$count_query" 2>/dev/null | tail -n 1 | tr -d '"' || echo "0")
    
    echo "$result"
}

# Start processing
log_message "Starting processNpubsUpToMaxNumBlocks workflow"

# Emit structured event for task start
emit_task_event "TASK_START" "processNpubsUpToMaxNumBlocks" "system" '{
    "message": "Starting npub generation workflow",
    "task_type": "npub_generation",
    "operation": "batch_npub_processing",
    "max_iterations": '$MAX_ITERATIONS',
    "category": "maintenance",
    "scope": "system",
    "parent_task": "processAllTasks"
}'

# Get initial counts
TOTAL_USERS=$(count_total_users)
MISSING_NPUBS=$(count_missing_npubs)

# Emit structured event for initial status
emit_task_event "PROGRESS" "processNpubsUpToMaxNumBlocks" "system" '{
    "message": "Initial npub status assessment",
    "phase": "initialization",
    "step": "status_check",
    "total_users": '$TOTAL_USERS',
    "missing_npubs": '$MISSING_NPUBS',
    "completion_percentage": '$(echo "scale=2; ($TOTAL_USERS - $MISSING_NPUBS) * 100 / $TOTAL_USERS" | bc -l 2>/dev/null || echo "0")'
}'

log_message "Initial status: $MISSING_NPUBS of $TOTAL_USERS NostrUsers missing npub property"

if [ "$MISSING_NPUBS" -eq 0 ]; then
    # Emit structured event for early completion
    emit_task_event "TASK_END" "processNpubsUpToMaxNumBlocks" "system" '{
        "message": "All NostrUsers already have npub property - no processing needed",
        "status": "success",
        "task_type": "npub_generation",
        "total_users": '$TOTAL_USERS',
        "missing_npubs": 0,
        "completion_percentage": 100,
        "iterations_completed": 0,
        "early_exit": true,
        "category": "maintenance",
        "scope": "system",
        "parent_task": "processAllTasks"
    }'
    
    log_message "All NostrUsers already have npub property. Nothing to do."
    exit 0
fi

# Initialize iteration counter
ITERATION=1

# Main processing loop
while [ "$MISSING_NPUBS" -gt 0 ] && [ "$ITERATION" -le "$MAX_ITERATIONS" ]; do
    # Emit structured event for iteration start
    emit_task_event "PROGRESS" "processNpubsUpToMaxNumBlocks" "system" '{
        "message": "Starting npub processing iteration",
        "phase": "processing",
        "step": "iteration_start",
        "iteration": '$ITERATION',
        "max_iterations": '$MAX_ITERATIONS',
        "remaining_npubs": '$MISSING_NPUBS',
        "total_users": '$TOTAL_USERS'
    }'
    
    log_message "=== Iteration $ITERATION of $MAX_ITERATIONS ==="
    log_message "Processing $MISSING_NPUBS remaining NostrUsers missing npub property"
    
    # Run processNpubsOneBlock.sh
    log_message "Running processNpubsOneBlock.sh (iteration $ITERATION)"
    
    if "$SCRIPT_DIR/processNpubsOneBlock.sh"; then
        log_message "processNpubsOneBlock.sh completed successfully (iteration $ITERATION)"
    else
        # Emit structured event for child script failure
        emit_task_event "TASK_ERROR" "processNpubsUpToMaxNumBlocks" "system" '{
            "message": "Child script processNpubsOneBlock.sh failed",
            "status": "failed",
            "task_type": "npub_generation",
            "iteration": '$ITERATION',
            "error_reason": "child_script_failure",
            "child_script": "processNpubsOneBlock.sh",
            "category": "maintenance",
            "scope": "system",
            "parent_task": "processAllTasks"
        }'
        
        log_message "ERROR: processNpubsOneBlock.sh failed on iteration $ITERATION"
        exit 1
    fi
    
    # Wait a moment for Neo4j to process updates
    sleep 2
    
    # Check how many are still missing
    PREVIOUS_MISSING=$MISSING_NPUBS
    MISSING_NPUBS=$(count_missing_npubs)
    PROCESSED_THIS_ITERATION=$((PREVIOUS_MISSING - MISSING_NPUBS))
    
    # Emit structured event for iteration results
    emit_task_event "PROGRESS" "processNpubsUpToMaxNumBlocks" "system" '{
        "message": "Iteration processing results",
        "phase": "processing",
        "step": "iteration_results",
        "iteration": '$ITERATION',
        "processed_this_iteration": '$PROCESSED_THIS_ITERATION',
        "remaining_npubs": '$MISSING_NPUBS',
        "total_users": '$TOTAL_USERS',
        "completion_percentage": '$(echo "scale=2; ($TOTAL_USERS - $MISSING_NPUBS) * 100 / $TOTAL_USERS" | bc -l 2>/dev/null || echo "0")'
    }'
    
    log_message "Iteration $ITERATION results: processed $PROCESSED_THIS_ITERATION npubs, $MISSING_NPUBS remaining"
    
    # Check for progress
    if [ "$PROCESSED_THIS_ITERATION" -eq 0 ]; then
        # Emit structured event for no progress warning
        emit_task_event "PROGRESS" "processNpubsUpToMaxNumBlocks" "system" '{
            "message": "No progress made in iteration - potential issue detected",
            "phase": "processing",
            "step": "progress_check",
            "iteration": '$ITERATION',
            "processed_this_iteration": 0,
            "warning": "no_progress_detected",
            "remaining_npubs": '$MISSING_NPUBS'
        }'
        
        log_message "WARNING: No progress made in iteration $ITERATION. This may indicate an issue."
        
        # If no progress for 2 consecutive iterations, exit to prevent infinite loop
        if [ "$ITERATION" -gt 1 ]; then
            # Emit structured event for infinite loop prevention exit
            emit_task_event "TASK_ERROR" "processNpubsUpToMaxNumBlocks" "system" '{
                "message": "No progress made - exiting to prevent infinite loop",
                "status": "failed",
                "task_type": "npub_generation",
                "iteration": '$ITERATION',
                "error_reason": "no_progress_infinite_loop_prevention",
                "remaining_npubs": '$MISSING_NPUBS',
                "category": "maintenance",
                "scope": "system",
                "parent_task": "processAllTasks"
            }'
            
            log_message "ERROR: No progress made. Exiting to prevent infinite loop."
            exit 1
        fi
    fi
    
    # Increment iteration counter
    ITERATION=$((ITERATION + 1))
    
    # Brief pause between iterations
    if [ "$MISSING_NPUBS" -gt 0 ]; then
        sleep 1
    fi
done

# Final status check
FINAL_MISSING=$(count_missing_npubs)
FINAL_TOTAL=$(count_total_users)
COMPLETED_NPUBS=$((TOTAL_USERS - FINAL_MISSING))

log_message "=== Final Results ==="
log_message "Total iterations completed: $((ITERATION - 1))"
log_message "Total NostrUsers with pubkey: $FINAL_TOTAL"
log_message "NostrUsers with npub property: $COMPLETED_NPUBS"
log_message "NostrUsers still missing npub: $FINAL_MISSING"

if [ "$FINAL_MISSING" -eq 0 ]; then
    # Emit structured event for successful completion
    emit_task_event "TASK_END" "processNpubsUpToMaxNumBlocks" "system" '{
        "message": "All NostrUsers now have npub property - workflow completed successfully",
        "status": "success",
        "task_type": "npub_generation",
        "iterations_completed": '$((ITERATION - 1))',
        "total_users": '$FINAL_TOTAL',
        "completed_npubs": '$COMPLETED_NPUBS',
        "missing_npubs": 0,
        "completion_percentage": 100,
        "max_iterations": '$MAX_ITERATIONS',
        "category": "maintenance",
        "scope": "system",
        "parent_task": "processAllTasks"
    }'
    
    log_message "SUCCESS: All NostrUsers now have npub property!"
    COMPLETION_PERCENTAGE="100"
    exit 0
else
    COMPLETION_PERCENTAGE=$(echo "scale=2; $COMPLETED_NPUBS * 100 / $FINAL_TOTAL" | bc -l 2>/dev/null || echo "N/A")
    
    if [ "$ITERATION" -gt "$MAX_ITERATIONS" ]; then
        # Emit structured event for max iterations reached
        emit_task_event "TASK_END" "processNpubsUpToMaxNumBlocks" "system" '{
            "message": "Reached maximum iterations - workflow completed with remaining npubs",
            "status": "partial_success",
            "task_type": "npub_generation",
            "iterations_completed": '$((ITERATION - 1))',
            "max_iterations": '$MAX_ITERATIONS',
            "total_users": '$FINAL_TOTAL',
            "completed_npubs": '$COMPLETED_NPUBS',
            "missing_npubs": '$FINAL_MISSING',
            "completion_percentage": '$COMPLETION_PERCENTAGE',
            "termination_reason": "max_iterations_reached",
            "category": "maintenance",
            "scope": "system",
            "parent_task": "processAllTasks"
        }'
        
        log_message "WARNING: Reached maximum iterations ($MAX_ITERATIONS). $FINAL_MISSING npubs still missing."
        log_message "Completion: $COMPLETION_PERCENTAGE% ($COMPLETED_NPUBS of $FINAL_TOTAL)"
        exit 0
    else
        # Emit structured event for early termination
        emit_task_event "TASK_END" "processNpubsUpToMaxNumBlocks" "system" '{
            "message": "Process stopped early with remaining npubs",
            "status": "partial_success",
            "task_type": "npub_generation",
            "iterations_completed": '$((ITERATION - 1))',
            "max_iterations": '$MAX_ITERATIONS',
            "total_users": '$FINAL_TOTAL',
            "completed_npubs": '$COMPLETED_NPUBS',
            "missing_npubs": '$FINAL_MISSING',
            "completion_percentage": '$COMPLETION_PERCENTAGE',
            "termination_reason": "early_termination",
            "category": "maintenance",
            "scope": "system",
            "parent_task": "processAllTasks"
        }'
        
        log_message "WARNING: Process stopped with $FINAL_MISSING npubs still missing."
        log_message "Completion: $COMPLETION_PERCENTAGE% ($COMPLETED_NPUBS of $FINAL_TOTAL)"
        exit 0
    fi
fi

log_message "processNpubsUpToMaxNumBlocks workflow finished"

echo "$(date): Finished processNpubsUpToMaxNumBlocks"
echo "$(date): Finished processNpubsUpToMaxNumBlocks" >> ${LOG_FILE}

# Exit with appropriate code
if [ "$FINAL_MISSING" -eq 0 ]; then
    exit 0
else
    exit 1
fi

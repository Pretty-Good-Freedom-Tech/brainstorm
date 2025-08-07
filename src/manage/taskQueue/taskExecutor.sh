#!/bin/bash

# Task Executor - Picks highest priority task from queue and executes it
#
# This component:
# 1. Reads the priority queue
# 2. Selects the highest priority task
# 3. Executes the appropriate script for that task
# 4. Updates task status and logs
# 5. Removes completed task from queue

CONFIG_FILE="/etc/brainstorm.conf"
source "$CONFIG_FILE"

# Task queue files
TASK_QUEUE_DIR="${BRAINSTORM_LOG_DIR}/taskQueue"
PRIORITY_QUEUE_FILE="${TASK_QUEUE_DIR}/priorityQueue.json"
EXECUTOR_LOG_FILE="${TASK_QUEUE_DIR}/executor.log"
TASK_STATUS_FILE="${TASK_QUEUE_DIR}/taskStatus.json"

# Ensure directories exist
mkdir -p "$TASK_QUEUE_DIR"
touch "$EXECUTOR_LOG_FILE"

log_message() {
    local message="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [TaskExecutor] $message" | tee -a "$EXECUTOR_LOG_FILE"
}

get_next_task() {
    # Check if queue file exists and has content
    if [[ ! -f "$PRIORITY_QUEUE_FILE" ]]; then
        echo "null"
        return
    fi
    
    # Use jq to get the first (highest priority) task
    local next_task=$(jq -r '.[0] // null' "$PRIORITY_QUEUE_FILE" 2>/dev/null)
    echo "$next_task"
}

remove_task_from_queue() {
    local task_id="$1"
    
    if [[ -f "$PRIORITY_QUEUE_FILE" ]]; then
        # Remove the first task (the one we just executed)
        jq '.[1:]' "$PRIORITY_QUEUE_FILE" > "${PRIORITY_QUEUE_FILE}.tmp" && \
        mv "${PRIORITY_QUEUE_FILE}.tmp" "$PRIORITY_QUEUE_FILE"
    fi
}

update_task_status() {
    local task_type="$1"
    local task_target="$2"
    local status="$3"
    local start_time="$4"
    local end_time="$5"
    local exit_code="$6"
    
    # Create or update task status file
    local status_entry=$(cat <<EOF
{
    "taskType": "$task_type",
    "target": "$task_target",
    "status": "$status",
    "startTime": "$start_time",
    "endTime": "$end_time",
    "exitCode": $exit_code,
    "timestamp": "$(date -Iseconds)"
}
EOF
)
    
    # TODO: Implement proper JSON array management for task status history
    echo "$status_entry" >> "$TASK_STATUS_FILE"
}

execute_task() {
    local task_json="$1"
    
    # Parse task details
    local task_type=$(echo "$task_json" | jq -r '.type')
    local task_target=$(echo "$task_json" | jq -r '.target // "global"')
    local task_priority=$(echo "$task_json" | jq -r '.priority')
    local task_script=$(echo "$task_json" | jq -r '.script')
    local task_args=$(echo "$task_json" | jq -r '.args // ""')
    
    log_message "Executing task: $task_type (target: $task_target, priority: $task_priority)"
    
    local start_time=$(date -Iseconds)
    local exit_code=0
    
    # Execute the task based on type
    case "$task_type" in
        "processCustomer")
            log_message "Running processCustomer for $task_target"
            # TODO: Call actual processCustomer script
            # "$BRAINSTORM_MODULE_MANAGE_DIR/customers/processCustomer.sh" "$task_target"
            echo "TODO: Execute processCustomer for $task_target"
            ;;
            
        "syncWoT")
            log_message "Running WoT synchronization"
            # TODO: Call actual syncWoT script
            # "$BRAINSTORM_MODULE_MANAGE_DIR/negentropySync/syncWoT.sh"
            echo "TODO: Execute syncWoT"
            ;;
            
        "calculatePersonalizedGrapeRank")
            log_message "Running personalized GrapeRank calculation for $task_target"
            # TODO: Call actual GrapeRank script
            # "$BRAINSTORM_MODULE_ALGOS_DIR/personalizedGrapeRank/calculatePersonalizedGrapeRankController.sh" "$task_target"
            echo "TODO: Execute calculatePersonalizedGrapeRank for $task_target"
            ;;
            
        "calculatePersonalizedPageRank")
            log_message "Running personalized PageRank calculation for $task_target"
            # TODO: Call actual PageRank script
            echo "TODO: Execute calculatePersonalizedPageRank for $task_target"
            ;;
            
        "systemMaintenance")
            log_message "Running system maintenance"
            # TODO: Call system maintenance tasks
            # "$BRAINSTORM_MODULE_BASE_DIR/setup/neo4jConstraintsAndIndexes.sh"
            echo "TODO: Execute system maintenance"
            ;;
            
        *)
            log_message "Unknown task type: $task_type"
            exit_code=1
            ;;
    esac
    
    local end_time=$(date -Iseconds)
    local status="completed"
    
    if [[ $exit_code -ne 0 ]]; then
        status="failed"
        log_message "Task failed with exit code: $exit_code"
    else
        log_message "Task completed successfully"
    fi
    
    # Update task status
    update_task_status "$task_type" "$task_target" "$status" "$start_time" "$end_time" "$exit_code"
    
    return $exit_code
}

main() {
    log_message "Starting task executor..."
    
    # Get next task from queue
    local next_task=$(get_next_task)
    
    if [[ "$next_task" == "null" || -z "$next_task" ]]; then
        log_message "No tasks in queue"
        return 0
    fi
    
    log_message "Found task in queue"
    
    # Execute the task
    if execute_task "$next_task"; then
        # Remove completed task from queue
        remove_task_from_queue
        log_message "Task completed and removed from queue"
    else
        log_message "Task failed, keeping in queue for retry"
        # TODO: Implement retry logic or move to failed tasks
    fi
    
    log_message "Task executor finished"
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi

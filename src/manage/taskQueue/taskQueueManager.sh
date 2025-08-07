#!/bin/bash

# Task Queue Manager - Main orchestrator for the priority-based task system
#
# This script is designed to be called frequently by systemd (e.g., every 5-15 minutes)
# It coordinates the task scheduler and task executor components
#
# Flow:
# 1. Run task scheduler to evaluate system state and update priority queue
# 2. Run task executor to process the highest priority task
# 3. Log results and exit

CONFIG_FILE="/etc/brainstorm.conf"
source "$CONFIG_FILE"

# Task queue components
TASK_QUEUE_DIR="${BRAINSTORM_MODULE_MANAGE_DIR}/taskQueue"
TASK_SCHEDULER="${TASK_QUEUE_DIR}/taskScheduler.js"
TASK_EXECUTOR="${TASK_QUEUE_DIR}/taskExecutor.sh"
SYSTEM_STATE_GATHERER="${TASK_QUEUE_DIR}/systemStateGatherer.js"

# Logging
MANAGER_LOG_FILE="${BRAINSTORM_LOG_DIR}/taskQueue/manager.log"
mkdir -p "$(dirname "$MANAGER_LOG_FILE")"
touch "$MANAGER_LOG_FILE"

log_message() {
    local message="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [TaskQueueManager] $message" | tee -a "$MANAGER_LOG_FILE"
}

check_dependencies() {
    log_message "Checking dependencies..."
    
    # Check if required components exist
    if [[ ! -f "$TASK_SCHEDULER" ]]; then
        log_message "ERROR: Task scheduler not found: $TASK_SCHEDULER"
        return 1
    fi
    
    if [[ ! -f "$TASK_EXECUTOR" ]]; then
        log_message "ERROR: Task executor not found: $TASK_EXECUTOR"
        return 1
    fi
    
    if [[ ! -f "$SYSTEM_STATE_GATHERER" ]]; then
        log_message "ERROR: System state gatherer not found: $SYSTEM_STATE_GATHERER"
        return 1
    fi
    
    # Check if jq is available (needed for JSON processing)
    if ! command -v jq &> /dev/null; then
        log_message "ERROR: jq is required but not installed"
        return 1
    fi
    
    log_message "All dependencies found"
    return 0
}

run_task_scheduler() {
    log_message "Running task scheduler..."
    
    if node "$TASK_SCHEDULER"; then
        log_message "Task scheduler completed successfully"
        return 0
    else
        log_message "Task scheduler failed with exit code: $?"
        return 1
    fi
}

run_task_executor() {
    log_message "Running task executor..."
    
    if bash "$TASK_EXECUTOR"; then
        log_message "Task executor completed successfully"
        return 0
    else
        local exit_code=$?
        log_message "Task executor failed with exit code: $exit_code"
        return $exit_code
    fi
}

update_system_state() {
    log_message "Updating system state..."
    
    if node "$SYSTEM_STATE_GATHERER" > /dev/null; then
        log_message "System state updated successfully"
        return 0
    else
        log_message "System state update failed with exit code: $?"
        return 1
    fi
}

main() {
    log_message "Starting task queue manager..."
    
    # Check that all required components are available
    if ! check_dependencies; then
        log_message "Dependency check failed, exiting"
        exit 1
    fi
    
    # Step 1: Run task scheduler to evaluate system state and update priority queue
    if ! run_task_scheduler; then
        log_message "Task scheduler failed, but continuing..."
    fi
    
    # Step 2: Run task executor to process highest priority task
    if ! run_task_executor; then
        log_message "Task executor failed, but continuing..."
    fi
    
    # Step 3: Update comprehensive system state for dashboard
    if ! update_system_state; then
        log_message "System state update failed, but continuing..."
    fi
    
    log_message "Task queue manager cycle completed"
}

# Handle script arguments
case "${1:-}" in
    "scheduler-only")
        log_message "Running scheduler only..."
        check_dependencies && run_task_scheduler
        ;;
    "executor-only")
        log_message "Running executor only..."
        check_dependencies && run_task_executor
        ;;
    "state-only")
        log_message "Running state gatherer only..."
        check_dependencies && update_system_state
        ;;
    *)
        main
        ;;
esac

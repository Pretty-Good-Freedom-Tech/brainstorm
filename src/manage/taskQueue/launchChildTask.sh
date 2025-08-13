#!/bin/bash

# This script exports a function to launch a child task
# It takes as input a config file which specifies what to do in various scenarios
# Caught errors: child task emits a Structured Log entry
# Uncaught errors: child task exits without emitting a Structured Log entry
# ERROR TYPES:
# - timeout (process is still running past timeout duration)
# - uncaught (process is not running; there is a corresponding Structured Log error entry)
# - caught (process is not running; there is not a corresponding Structured Log error entry)
# RESPONSES

# Source configuration and structured logging
CONFIG_FILE="/etc/brainstorm.conf"
source "$CONFIG_FILE"
source "${BRAINSTORM_MODULE_SRC_DIR}/utils/structuredLogging.sh"

LOG_FILE="$BRAINSTORM_LOG_DIR/launchChildTask.log"
touch ${LOG_FILE}
sudo chown brainstorm:brainstorm ${LOG_FILE}

launchChildTask() {
    local task_name="$1"         # Required: name of this task
    local parent_task_name="$2"  # Required: name of parent task
    local config_json="$3"       # Optional: per-invocation config (JSON string)
    local child_args="$4"        # Optional: arguments to pass to child task
    
    echo "$(date): Starting launchChildTask"
    echo "$(date): Starting launchChildTask" >> ${LOG_FILE}

    # Validate required arguments
    if [[ -z "$task_name" || -z "$parent_task_name" ]]; then
        echo "ERROR: launchChildTask requires task_name and parent_task_name" >&2
        echo "ERROR: launchChildTask requires task_name and parent_task_name" >> ${LOG_FILE}
        return 1
    fi
    
    echo "$(date): Continuing launchChildTask; task_name: $task_name, parent_task_name: $parent_task_name"
    echo "$(date): Continuing launchChildTask; task_name: $task_name, parent_task_name: $parent_task_name" >> ${LOG_FILE}
    
    # Task registry file
    local task_registry="${BRAINSTORM_MODULE_MANAGE_DIR}/taskQueue/taskRegistry.json"
    
    # Validate task registry exists
    if [[ ! -f "$task_registry" ]]; then
        echo "ERROR: Task registry not found: $task_registry" >&2
        echo "ERROR: Task registry not found: $task_registry" >> ${LOG_FILE}
        return 1
    fi
    
    echo "$(date): Continuing launchChildTask; task_name: $task_name, parent_task_name: $parent_task_name"
    echo "$(date): Continuing launchChildTask; task_name: $task_name, parent_task_name: $parent_task_name" >> ${LOG_FILE}
    
    # Extract task information from registry
    local task_data=$(jq -r ".tasks.\"$task_name\"" "$task_registry" 2>/dev/null)
    if [[ "$task_data" == "null" || -z "$task_data" ]]; then
        echo "ERROR: Task '$task_name' not found in registry" >&2
        echo "ERROR: Task '$task_name' not found in registry" >> ${LOG_FILE}
        return 1
    fi
    
    # Get child script path from registry
    local child_script=$(echo "$task_data" | jq -r '.script // empty')
    if [[ -z "$child_script" ]]; then
        echo "ERROR: No script defined for task '$task_name'" >&2
        echo "ERROR: No script defined for task '$task_name'" >> ${LOG_FILE}
        return 1
    fi

    # Expand environment variables in script path
    # First, ensure all required environment variables are available
    if [[ -z "$BRAINSTORM_MODULE_SRC_DIR" ]]; then
        echo "ERROR: BRAINSTORM_MODULE_SRC_DIR not set - config may not be properly sourced" >&2
        echo "ERROR: BRAINSTORM_MODULE_SRC_DIR not set - config may not be properly sourced" >> ${LOG_FILE}
        return 1
    fi
    
    # Expand the $BRAINSTORM_MODULE_SRC_DIR variable in the script path
    child_script=$(eval echo "$child_script")
    
    echo "$(date): Expanded child_script path: $child_script"
    echo "$(date): Expanded child_script path: $child_script" >> ${LOG_FILE}
    
    # Validate child script exists
    if [[ ! -f "$child_script" ]]; then
        echo "ERROR: Child script not found: $child_script" >&2
        echo "ERROR: Child script not found: $child_script" >> ${LOG_FILE}
        echo "Available environment variables:" >> ${LOG_FILE}
        echo "BRAINSTORM_MODULE_SRC_DIR=$BRAINSTORM_MODULE_SRC_DIR" >> ${LOG_FILE}
        echo "BRAINSTORM_MODULE_MANAGE_DIR=$BRAINSTORM_MODULE_MANAGE_DIR" >> ${LOG_FILE}
        echo "BRAINSTORM_MODULE_BASE_DIR=$BRAINSTORM_MODULE_BASE_DIR" >> ${LOG_FILE}
        return 1
    fi
       
    # Resolve hierarchical configuration (invocation → task → global defaults)
    local resolved_config="{}"
    
    # Start with global defaults from registry
    local global_defaults=$(jq -r '.completion_default // {}' "$task_registry" 2>/dev/null)
    if [[ "$global_defaults" != "{}" && "$global_defaults" != "null" ]]; then
        resolved_config="$global_defaults"
    fi
    
    # Merge with task-specific config from registry (task.completion)
    local task_config=$(echo "$task_data" | jq -r '.completion // {}')
    if [[ "$task_config" != "{}" && "$task_config" != "null" ]]; then
        resolved_config=$(echo "$resolved_config $task_config" | jq -s '.[0] * .[1]' 2>/dev/null || echo "$resolved_config")
    fi
    
    # Merge with per-invocation config (highest priority)
    if [[ -n "$config_json" && "$config_json" != "{}" && "$config_json" != "null" ]]; then
        resolved_config=$(echo "$resolved_config $config_json" | jq -s '.[0] * .[1]' 2>/dev/null || echo "$resolved_config")
    fi

    echo "$(date): Continuing launchChildTask; resolved_config: $resolved_config"
    echo "$(date): Continuing launchChildTask; resolved_config: $resolved_config" >> ${LOG_FILE}
    
    # Generate unique child task ID for tracking
    local child_task_id="${task_name}_$(date +%s)_$$"
    local start_time=$(date -Iseconds)
    local child_pid=""
    local exit_code=0
    local completion_status="unknown"
    local error_type=""
    
    # Emit CHILD_TASK_START event
    local eventMetadata=$(cat <<EOF
{
    "child_task": "$task_name",
    "child_task_id": "$child_task_id",
    "child_script": "$child_script",
    "child_args": "$child_args",
    "parent_task": "$parent_task_name",
    "start_time": "$start_time"
}
EOF
)
    emit_task_event "CHILD_TASK_START" "$parent_task_name" "$child_task_id" "$eventMetadata"
    
    echo "$(date): Continuing launchChildTask; task_name: $task_name, parent_task_name: $parent_task_name"
    echo "$(date): Continuing launchChildTask; task_name: $task_name, parent_task_name: $parent_task_name" >> ${LOG_FILE}
    
    # Launch child task with monitoring
    local temp_log="/tmp/${child_task_id}.log"
    
    # Execute child script in background
    if [[ -n "$child_args" ]]; then
        bash "$child_script" $child_args > "$temp_log" 2>&1 &
    else
        bash "$child_script" > "$temp_log" 2>&1 &
    fi
    
    child_pid=$!
    
    echo "$(date): Continuing launchChildTask; task_name: $task_name, child_pid: $child_pid"
    echo "$(date): Continuing launchChildTask; task_name: $task_name, child_pid: $child_pid" >> ${LOG_FILE}
    
    # Get timeout from config (default 30 minutes)
    local timeout_duration=$(echo "$resolved_config" | jq -r '.completionScenarios.failure.timeout.duration // 1800')
    local timeout_seconds=$((timeout_duration / 1000))
    
    echo "$(date): Continuing launchChildTask; task_name: $task_name, timeout_duration: $timeout_duration, timeout_seconds: $timeout_seconds"
    echo "$(date): Continuing launchChildTask; task_name: $task_name, timeout_duration: $timeout_duration, timeout_seconds: $timeout_seconds" >> ${LOG_FILE}
    
    # Monitor child process
    local elapsed=0
    local check_interval=5
    local timed_out=false
    
    while kill -0 "$child_pid" 2>/dev/null; do
        sleep $check_interval
        elapsed=$((elapsed + check_interval))
        
        if [[ $elapsed -ge $timeout_seconds ]]; then
            timed_out=true
            break
        fi
    done
    
    local end_time=$(date -Iseconds)
    
    echo "$(date): Continuing launchChildTask; task_name: $task_name, end_time: $end_time"
    echo "$(date): Continuing launchChildTask; task_name: $task_name, end_time: $end_time" >> ${LOG_FILE}
    
    # Handle completion scenarios
    if [[ "$timed_out" == "true" ]]; then
        # Timeout scenario
        completion_status="timeout"
        error_type="timeout"
        
        # Check if we should force kill
        local force_kill=$(echo "$resolved_config" | jq -r '.completionScenarios.failure.timeout.forceKill // false')
        if [[ "$force_kill" == "true" ]]; then
            kill -9 "$child_pid" 2>/dev/null
        fi
        
        exit_code=124  # Standard timeout exit code
        
        local eventMetadata=$(cat <<EOF
{
    "child_task": "$task_name",
    "child_task_id": "$child_task_id",
    "parent_task": "$parent_task_name",
    "error_type": "timeout",
    "timeout_duration": $timeout_duration,
    "elapsed_time": $((elapsed * 1000)),
    "child_pid": $child_pid,
    "end_time": "$end_time"
}
EOF
)
        emit_task_event "CHILD_TASK_ERROR" "$parent_task_name" "$child_task_id" "$eventMetadata"
    else
        # Process completed normally
        wait "$child_pid"
        exit_code=$?
        
        if [[ $exit_code -eq 0 ]]; then
            completion_status="success"
            
            local eventMetadata=$(cat <<EOF
{
    "child_task": "$task_name",
    "child_task_id": "$child_task_id",
    "parent_task": "$parent_task_name",
    "exit_code": $exit_code,
    "completion_status": "success",
    "end_time": "$end_time"
}
EOF
)
            emit_task_event "CHILD_TASK_END" "$parent_task_name" "$child_task_id" "$eventMetadata"
        else
            # Check if this was a caught or uncaught error
            # Look for TASK_ERROR events in structured logs for this task
            local error_events=$(grep -c "\"eventType\":\"TASK_ERROR\".*\"taskName\":\"$task_name\"" "${BRAINSTORM_LOG_DIR}/events.jsonl" 2>/dev/null || echo "0")
            
            if [[ $error_events -gt 0 ]]; then
                error_type="caught"
                completion_status="caught_failure"
            else
                error_type="uncaught" 
                completion_status="uncaught_failure"
            fi
            
            local eventMetadata=$(cat <<EOF
{
    "child_task": "$task_name",
    "child_task_id": "$child_task_id",
    "parent_task": "$parent_task_name",
    "error_type": "$error_type",
    "exit_code": $exit_code,
    "completion_status": "$completion_status",
    "end_time": "$end_time"
}
EOF
)
            emit_task_event "CHILD_TASK_ERROR" "$parent_task_name" "$child_task_id" "$eventMetadata"
        fi
    fi
    
    echo "$(date): Continuing launchChildTask; task_name: $task_name, completion_status: $completion_status, exit_code: $exit_code"
    echo "$(date): Continuing launchChildTask; task_name: $task_name, completion_status: $completion_status, exit_code: $exit_code" >> ${LOG_FILE}
    
    # Clean up temp log
    [[ -f "$temp_log" ]] && rm -f "$temp_log"
    
    # Determine parent next step based on completion scenario and config
    local parent_next_step="continue"  # Default behavior
    
    case "$completion_status" in
        "success")
            parent_next_step=$(echo "$resolved_config" | jq -r '.completionScenarios.success.withoutError.parentNextStep // "continue"')
            ;;
        "timeout")
            parent_next_step=$(echo "$resolved_config" | jq -r '.completionScenarios.failure.timeout.parentNextStep // "continue"')
            ;;
        "caught_failure")
            parent_next_step=$(echo "$resolved_config" | jq -r '.completionScenarios.failure.caught.parentNextStep // "continue"')
            ;;
        "uncaught_failure")
            parent_next_step=$(echo "$resolved_config" | jq -r '.completionScenarios.failure.uncaught.parentNextStep // "continue"')
            ;;
    esac
    
    # Return appropriate exit code for parent decision making
    case "$parent_next_step" in
        "exit")
            return $exit_code
            ;;
        "nextTaskInQueue"|"continue")
            return 0  # Allow parent to continue
            ;;
        *)
            return $exit_code  # Default to child's exit code
            ;;
    esac
}

export -f launchChildTask
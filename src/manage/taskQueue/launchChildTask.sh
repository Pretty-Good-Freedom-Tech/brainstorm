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

# Check if a task is already running by name
# Returns PID if running, empty string if not
check_task_already_running() {
    local task_name="$1"
    
    echo "$(date): Checking if task $task_name is already running" >> ${LOG_FILE}
    
    # Get task script path from registry for precise matching
    local task_registry="${BRAINSTORM_MODULE_MANAGE_DIR}/taskQueue/taskRegistry.json"
    local script_relative_path=$(jq -r ".tasks.\"$task_name\".script_relative_path // empty" "$task_registry" 2>/dev/null)
    
    if [[ -z "$script_relative_path" ]]; then
        echo "$(date): No script_relative_path found for $task_name, falling back to task name matching" >> ${LOG_FILE}
        local search_pattern="$task_name"
    else
        echo "$(date): Using script_relative_path for $task_name: $script_relative_path" >> ${LOG_FILE}
        local search_pattern="$script_relative_path"
    fi
    
    # Search for bash processes running scripts containing the pattern
    local pids=$(pgrep -f "$search_pattern" 2>/dev/null || echo "")
    
    echo "$(date): Found pids for pattern '$search_pattern': $pids" >> ${LOG_FILE}
    
    # Filter out our own process and parent processes
    local filtered_pids=""
    for pid in $pids; do
        if [[ "$pid" != "$$" && "$pid" != "$PPID" ]]; then
            # Verify the process is still running and is actually our task
            if ps -p "$pid" >/dev/null 2>&1; then
                local cmd=$(ps -p "$pid" -o cmd= 2>/dev/null || echo "")
                
                # Check if command contains the script pattern and is not launchChildTask itself
                if [[ "$cmd" == *"$search_pattern"* && "$cmd" != *"launchChildTask.sh"* ]]; then
                    echo "$(date): Found matching PID: $pid; cmd: $cmd" >> ${LOG_FILE}
                    filtered_pids="$pid"
                    break  # Return first matching PID
                fi
            fi
        fi
    done
    
    echo "$(date): Final filtered PID: $filtered_pids" >> ${LOG_FILE}
    echo "$filtered_pids"
}

# Placeholder function to detect if a running process has error state
# Currently returns "withoutError" for all processes
# TODO: Implement sophisticated error detection logic in future phases
detect_process_error_state() {
    local task_name="$1"
    local pid="$2"
    
    # Phase 1: Simple placeholder - always return no error
    # Future phases will implement:
    # - Timeout detection (process running longer than expected)
    # - Activity detection (no structured log events in X minutes)
    # - Resource monitoring (high CPU/memory with no progress)
    # - Task-specific health checks
    
    echo "withoutError"
}

# Resolve launch options using hierarchical approach
# Priority: invocation options > task-specific options > global options_default > fallback
resolve_launch_options() {
    local task_data="$1"
    local registry_data="$2" 
    local error_state="$3"  # "withError" or "withoutError"
    local options_json="$4"  # Per-invocation options
    
    # Start with global defaults
    local options="{}"
    local global_default=$(echo "$registry_data" | jq -r ".options_default.launch.processAlreadyRunning.$error_state // {}")
    if [[ "$global_default" != "{}" && "$global_default" != "null" ]]; then
        options="$global_default"
    fi
    
    # Override with task-specific options if present
    local task_options=$(echo "$task_data" | jq -r ".options.launch.processAlreadyRunning.$error_state // {}")
    if [[ "$task_options" != "{}" && "$task_options" != "null" ]]; then
        options=$(echo "$options $task_options" | jq -s '.[0] * .[1]' 2>/dev/null || echo "$options")
    fi
    
    # Override with per-invocation options if present (highest priority)
    local invocation_options=$(echo "$options_json" | jq -r ".launch.processAlreadyRunning.$error_state // {}" 2>/dev/null || echo '{}')
    if [[ "$invocation_options" != "{}" && "$invocation_options" != "null" ]]; then
        options=$(echo "$options $invocation_options" | jq -s '.[0] * .[1]' 2>/dev/null || echo "$options")
    fi
    
    # Provide fallback defaults if options is still empty
    if [[ "$options" == "{}" || "$options" == "null" ]]; then
        options='{"killPreexisting": true, "launchNew": true}'
    fi
    
    echo "$options"
}

launchChildTask() {
    local task_name="$1"         # Required: name of this task
    local parent_task_name="$2"  # Required: name of parent task
    local options_json="$3"      # Optional: per-invocation options config (JSON string)
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
       
    # Resolve completion options using hierarchical approach
    local resolved_options="{}"
    
    # Start with global defaults from registry
    local registry_data=$(cat "$task_registry")
    local global_defaults=$(echo "$registry_data" | jq -r '.options_default.completion // {}')
    if [[ "$global_defaults" != "{}" && "$global_defaults" != "null" ]]; then
        resolved_options="$global_defaults"
    fi
    
    # Merge with task-specific options from registry (task.options.completion)
    local task_options=$(echo "$task_data" | jq -r '.options.completion // {}')
    if [[ "$task_options" != "{}" && "$task_options" != "null" ]]; then
        resolved_options=$(echo "$resolved_options $task_options" | jq -s '.[0] * .[1]' 2>/dev/null || echo "$resolved_options")
    fi
    
    # Merge with per-invocation completion options (highest priority)
    local invocation_completion=$(echo "$options_json" | jq -r '.completion // {}' 2>/dev/null || echo '{}')
    if [[ "$invocation_completion" != "{}" && "$invocation_completion" != "null" ]]; then
        resolved_options=$(echo "$resolved_options $invocation_completion" | jq -s '.[0] * .[1]' 2>/dev/null || echo "$resolved_options")
    fi

    echo "$(date): Continuing launchChildTask; resolved_options: $resolved_options"
    echo "$(date): Continuing launchChildTask; resolved_options: $resolved_options" >> ${LOG_FILE}
    
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
    
    # Check if task is already running and handle according to launch policy
    local existing_pid=$(check_task_already_running "$task_name")
    if [[ -n "$existing_pid" ]]; then
        echo "$(date): Task $task_name is already running (PID: $existing_pid)"
        echo "$(date): Task $task_name is already running (PID: $existing_pid)" >> ${LOG_FILE}
        
        # Detect if existing process has error state
        local error_state=$(detect_process_error_state "$task_name" "$existing_pid")
        echo "$(date): Process error state: $error_state" >> ${LOG_FILE}
        
        # Resolve launch options for this scenario
        local launch_options=""
        if [[ "$error_state" == "withError" ]]; then
            launch_options=$(resolve_launch_options "$task_data" "$registry_data" "withError" "$options_json")
        else
            launch_options=$(resolve_launch_options "$task_data" "$registry_data" "withoutError" "$options_json")
        fi
        
        local kill_preexisting=$(echo "$launch_options" | jq -r '.killPreexisting // false')
        local launch_new=$(echo "$launch_options" | jq -r '.launchNew // false')
        
        echo "$(date): Launch policy - killPreexisting: $kill_preexisting, launchNew: $launch_new" >> ${LOG_FILE}
        
        # Apply launch policy
        if [[ "$kill_preexisting" == "true" ]]; then
            echo "$(date): Killing existing process $existing_pid" >> ${LOG_FILE}
            if ! kill -9 "$existing_pid" 2>/dev/null; then
                sudo kill -9 "$existing_pid" 2>/dev/null || true
                echo "$(date): Required sudo to kill PID $existing_pid" >> ${LOG_FILE}
            fi
            
            # Emit event for process replacement
            local replaceEventMetadata=$(cat <<EOF
{
    "child_task": "$task_name",
    "child_task_id": "$child_task_id",
    "action": "process_replaced",
    "old_pid": $existing_pid,
    "error_state": "$error_state",
    "kill_preexisting": true,
    "launch_new": $launch_new
}
EOF
)
            emit_task_event "TASK_LAUNCH_REPLACED" "$parent_task_name" "$child_task_id" "$replaceEventMetadata"
        fi
        
        if [[ "$launch_new" == "false" ]]; then
            echo "$(date): Launch policy prevents new instance of $task_name, returning existing PID $existing_pid" >> ${LOG_FILE}
            
            # Emit event for launch prevention
            local preventEventMetadata=$(cat <<EOF
{
    "child_task": "$task_name",
    "child_task_id": "$child_task_id",
    "action": "launch_prevented",
    "existing_pid": $existing_pid,
    "error_state": "$error_state",
    "kill_preexisting": $kill_preexisting,
    "launch_new": false
}
EOF
)
            emit_task_event "TASK_LAUNCH_PREVENTED" "$parent_task_name" "$child_task_id" "$preventEventMetadata"
            return 0  # Exit successfully, task is already running
        fi
    fi
    
    # Launch child task with monitoring
    local temp_log="/tmp/${child_task_id}.log"
    
    # Execute child script in background
    echo "$(date): Launching child task: $child_script" >> ${LOG_FILE}
    if [[ -n "$child_args" ]]; then
        bash "$child_script" $child_args > "$temp_log" 2>&1 &
    else
        bash "$child_script" > "$temp_log" 2>&1 &
    fi
    
    child_pid=$!
    
    # Get timeout from options (default 60 seconds)
    local timeout_duration=$(echo "$resolved_options" | jq -r '.failure.timeout.duration // 60000')
    local timeout_seconds=$((timeout_duration / 1000))
       
    # Monitor child process
    local elapsed=0
    local check_interval=5
    local timed_out=false
    
    while ps -p "$child_pid" >/dev/null 2>&1; do
        sleep $check_interval
        elapsed=$((elapsed + check_interval))
        
        if [[ $elapsed -ge $timeout_seconds ]]; then
            timed_out=true
            break
        fi
    done
    
    local end_time=$(date -Iseconds)
    
    # Handle completion scenarios
    if [[ "$timed_out" == "true" ]]; then
        # Timeout scenario
        completion_status="timeout"
        error_type="timeout"
        
        # Check if we should force kill
        local force_kill=$(echo "$resolved_options" | jq -r '.failure.timeout.forceKill // false')
        if [[ "$force_kill" == "true" ]]; then
            # Try to force kill the process with cross-user compatibility
            if ! kill -9 "$child_pid" 2>/dev/null; then
                # If direct kill fails (e.g., cross-user), try with sudo
                sudo kill -9 "$child_pid" 2>/dev/null || true
                echo "$(date): Force kill required sudo for PID $child_pid" >> ${LOG_FILE}
            fi
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
    
    # Clean up temp log
    [[ -f "$temp_log" ]] && rm -f "$temp_log"
    
    # Determine parent next step based on completion scenario and config
    local parent_next_step="continue"  # Default behavior
    
    case "$completion_status" in
        "success")
            parent_next_step=$(echo "$resolved_options" | jq -r '.success.withoutError.parentNextStep // "continue"')
            ;;
        "timeout")
            parent_next_step=$(echo "$resolved_options" | jq -r '.failure.timeout.parentNextStep // "continue"')
            ;;
        "caught_failure")
            parent_next_step=$(echo "$resolved_options" | jq -r '.failure.caught.parentNextStep // "continue"')
            ;;
        "uncaught_failure")
            parent_next_step=$(echo "$resolved_options" | jq -r '.failure.uncaught.parentNextStep // "continue"')
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

# Main execution block - call launchChildTask function when script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    # Script is being executed directly, not sourced
    echo "$(date): launchChildTask.sh executed directly with args: $@"
    
    # Validate we have the required arguments
    if [[ $# -lt 2 ]]; then
        echo "ERROR: launchChildTask.sh requires at least 2 arguments: task_name parent_task_name [options_json] [child_args]" >&2
        exit 1
    fi
    
    # Call the launchChildTask function with all provided arguments
    launchChildTask "$@"
    exit $?
fi
#!/bin/bash
set -e          # Exit immediately on command failure
set -o pipefail # Fail if any pipeline command fails

source /etc/brainstorm.conf

# Source structured logging utilities
source "${BRAINSTORM_MODULE_BASE_DIR}/src/utils/structuredLogging.sh"

touch ${BRAINSTORM_LOG_DIR}/syncWoT.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/syncWoT.log

# Emit structured event for task start
emit_task_event "TASK_START" "syncWoT" "system" '{
    "description": "Web of Trust data synchronization from relays",
    "target_relays": ["wot.brainstorm.social", "profiles.nostr1.com", "relay.hasenpfeffr.com"],
    "filter_kinds": [3, 1984, 10000, 30000, 38000, 38172, 38173],
    "sync_direction": "down"
}'

echo "$(date): Starting syncWoT"
echo "$(date): Starting syncWoT" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log

# Emit progress event for sync initialization
emit_task_event "PROGRESS" "syncWoT" "system" '{
    "phase": "initialization",
    "step": "setup_complete",
    "message": "Logging initialized, starting relay synchronization"
}'

# Emit progress event for relay sync start
emit_task_event "PROGRESS" "syncWoT" "system" '{
    "phase": "relay_sync",
    "step": "sync_wot",
    "relays": ["wot.brainstorm.social", "profiles.nostr1.com", "relay.hasenpfeffr.com"],
    "message": "Starting synchronization with all indicated relays"
}'

# Launch relay sync in background with monitoring
launch_relay_sync() {
    local relay=$1
    local log_file="/tmp/syncWoT_${relay//\./_}.log"
    
    echo "$(date): Starting background syncWoT with $relay"
    echo "$(date): Starting background syncWoT with $relay" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log
    
    # Launch strfry sync in background, capturing output with timestamps
    (
        while IFS= read -r line; do
            echo "$(date): [$relay] $line"
            echo "$(date): [$relay] $line" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log
            echo "$(date): $line" >> "$log_file"
        done < <(sudo strfry sync wss://$relay --filter '{"kinds":[0, 3, 1984, 10000, 30000, 38000, 38172, 38173]}' --dir down 2>&1)
        
        echo "$(date): Completed syncWoT with $relay"
        echo "$(date): Completed syncWoT with $relay" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log
        echo "SYNC_COMPLETE" >> "$log_file"
    ) &
    
    local pid=$!
    echo "$(date): Launched $relay with PID $pid"
    echo "$(date): Launched $relay with PID $pid" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log
    echo $pid  # Return the PID of the background process
}

# Monitor relay sync processes for activity
monitor_relay_activity() {
    local pids=("$@")
    local timeout_seconds=10800  # 3 hours
    local silence_threshold=30   # 30 seconds
    local start_time=$(date +%s)
    local last_activity_time=$(date +%s)
    
    echo "$(date): Monitoring ${#pids[@]} relay sync processes (PIDs: ${pids[*]})"
    echo "$(date): Monitoring ${#pids[@]} relay sync processes (PIDs: ${pids[*]})" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log
    
    while true; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))
        local silence_duration=$((current_time - last_activity_time))
        
        # Check for 3-hour timeout
        if [ $elapsed -ge $timeout_seconds ]; then
            echo "$(date): 3-hour timeout reached, terminating remaining processes"
            echo "$(date): 3-hour timeout reached, terminating remaining processes" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log
            for pid in "${pids[@]}"; do
                if kill -0 "$pid" 2>/dev/null; then
                    kill -TERM "$pid" 2>/dev/null || true
                    sleep 2
                    kill -KILL "$pid" 2>/dev/null || true
                fi
            done
            break
        fi
        
        # Check if any processes are still running
        local running_count=0
        local active_pids=()
        for pid in "${pids[@]}"; do
            if kill -0 "$pid" 2>/dev/null; then
                running_count=$((running_count + 1))
                active_pids+=("$pid")
            fi
        done
        
        # If no processes running, we're done
        if [ $running_count -eq 0 ]; then
            echo "$(date): All relay sync processes completed"
            echo "$(date): All relay sync processes completed" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log
            break
        fi
        
        # Check for recent activity in log files
        local activity_detected=false
        for relay in "wot.brainstorm.social" "profiles.nostr1.com" "relay.hasenpfeffr.com"; do
            local log_file="/tmp/syncWoT_${relay//\./_}.log"
            if [ -f "$log_file" ]; then
                local last_modified=$(stat -c %Y "$log_file" 2>/dev/null || stat -f %m "$log_file" 2>/dev/null || echo 0)
                if [ $last_modified -gt $last_activity_time ]; then
                    last_activity_time=$last_modified
                    activity_detected=true
                fi
            fi
        done
        
        # Check for silence threshold
        if [ $silence_duration -ge $silence_threshold ] && [ $running_count -gt 0 ]; then
            echo "$(date): No activity for ${silence_duration}s, but processes still running. Continuing to monitor..."
            echo "$(date): No activity for ${silence_duration}s, but processes still running. Continuing to monitor..." >> ${BRAINSTORM_LOG_DIR}/syncWoT.log
        fi
        
        # Wait before next check
        sleep 5
    done
    
    # Clean up temporary log files
    for relay in "wot.brainstorm.social" "profiles.nostr1.com" "relay.hasenpfeffr.com"; do
        local log_file="/tmp/syncWoT_${relay//\./_}.log"
        [ -f "$log_file" ] && rm -f "$log_file"
    done
}

# Launch all relay syncs in parallel
echo "$(date): Launching parallel relay synchronization"
echo "$(date): Launching parallel relay synchronization" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log

pids=()
echo "$(date): About to launch wot.brainstorm.social"
echo "$(date): About to launch wot.brainstorm.social" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log
pid1=$(launch_relay_sync "wot.brainstorm.social")
pids+=($pid1)

echo "$(date): About to launch profiles.nostr1.com"
echo "$(date): About to launch profiles.nostr1.com" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log
pid2=$(launch_relay_sync "profiles.nostr1.com")
pids+=($pid2)

echo "$(date): About to launch relay.hasenpfeffr.com"
echo "$(date): About to launch relay.hasenpfeffr.com" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log
pid3=$(launch_relay_sync "relay.hasenpfeffr.com")
pids+=($pid3)

echo "$(date): All relays launched with PIDs: ${pids[*]}"
echo "$(date): All relays launched with PIDs: ${pids[*]}" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log

# Monitor all processes
monitor_relay_activity "${pids[@]}"

echo "$(date): Completed syncWoT with all indicated relays"
echo "$(date): Completed syncWoT with all indicated relays" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log

# Emit progress event for relay sync completion
emit_task_event "PROGRESS" "syncWoT" "system" '{
    "phase": "relay_sync",
    "step": "sync_wot_complete",
    "relays": ["wot.brainstorm.social", "profiles.nostr1.com", "relay.hasenpfeffr.com"],
    "message": "Completed synchronization with all indicated relays"
}'

# for some reason, it hangs when I try to sync with wot.brainstorm.social
# sudo strfry sync wss://wot.brainstorm.social --filter '{"kinds":[3, 1984, 10000, 30000, 38000, 38172, 38173]}' --dir down

# echo "$(date): Completed syncWoT with wot.brainstorm.social"
# echo "$(date): Completed syncWoT with wot.brainstorm.social" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log

echo "$(date): Finished syncWoT"
echo "$(date): Finished syncWoT" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log

# Emit structured event for task completion
emit_task_event "TASK_END" "syncWoT" "system" '{
    "phases_completed": 2,
    "relays_synced": ["wot.brainstorm.social", "profiles.nostr1.com", "relay.hasenpfeffr.com"],
    "sync_direction": "down",
    "filter_kinds": [3, 1984, 10000, 30000, 38000, 38172, 38173],
    "status": "success",
    "message": "Web of Trust synchronization completed successfully"
}'
exit 0  # Explicit success exit code for parent script orchestration

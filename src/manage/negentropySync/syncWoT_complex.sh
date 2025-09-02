#!/bin/bash
set -e          # Exit immediately on command failure
set -o pipefail # Fail if any pipeline command fails

source /etc/brainstorm.conf

# Source structured logging utilities
source "${BRAINSTORM_MODULE_BASE_DIR}/src/utils/structuredLogging.sh"

touch ${BRAINSTORM_LOG_DIR}/syncWoT.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/syncWoT.log

# make array of relays
# TODO: fetch these relays from brainstorm.conf
# relays=("wot.grapevine.network" "relay.hasenpfeffr.com" "wot.brainstorm.social" "profiles.nostr1.com")
# relays=("wot.brainstorm.social")
relays=("wot.grapevine.network")
stringified_relays="${relays[*]}"
# relays=("relay.hasenpfeffr.com")
# make array of filter kinds
# filter_kinds=(0 3 1984 10000 30000 38000 38172 38173)
filter_kinds="[0,3,1984,10000,30000,38000,38172,38173]"
filter="{\"kinds\": $filter_kinds}"
# TODO: use relays and filter_kinds throughout this script

# Emit structured event for task start
oMetadata=$(jq -n \
    --arg description "Web of Trust data synchronization from relays" \
    --arg target_relays "$stringified_relays" \
    --arg target_filter_kinds "$filter_kinds" \
    --arg sync_direction "down" \
    '{
        "description": $description,
        "target_relays": $target_relays,
        "target_filter_kinds": $target_filter_kinds,
        "sync_direction": $sync_direction
    }')
emit_task_event "TASK_START" "syncWoT" "system" "$oMetadata"

echo "$(date): Starting syncWoT"
echo "$(date): Starting syncWoT" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log

# create empty array of sync_pid
sync_pid=()
# cycle through relays
for relay in "${relays[@]}"; do
    echo "$(date): Syncing with $relay"
    echo "$(date): Syncing with $relay" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log
    # launch strfry sync in background and get pid
    # sudo strfry sync wss://$relay --filter '{"kinds": [0, 3, 1984, 10000, 30000, 38000, 38172, 38173]}' --dir down &
    sudo strfry sync wss://$relay --filter "$filter" --dir down &
    pid=$!
    oMetadata=$(jq -n \
    --arg description "Web of Trust data synchronization from relay" \
    --arg target_relay "$relay" \
    --arg target_filter_kinds "$filter_kinds" \
    --argjson pid "$pid" \
    --arg sync_direction "down" \
    '{
        "description": $description,
        "target_relay": $target_relay,
        "target_filter_kinds": $target_filter_kinds,
        "pid": $pid,
        "sync_direction": $sync_direction
    }')
    emit_task_event "PROGRESS" "syncWoT" "system" "$oMetadata"
    echo "$(date): Launched $relay with PID $pid"
    echo "$(date): Launched $relay with PID $pid" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log
    sync_pid+=($pid)
done

# every time_increment seconds, check how many events are in the local strfry relay
# calculate the increase since last check
# If increase is less than 50, then kill all syncWoT processes and complete syncWoT
# set num_events to 0
num_events_start=0
num_events_last=0
# define start date
start_time=$(date +%s)
num_events_increment=100
time_increment=20
# initialize syncWoT_active_time to 0
syncWoT_active_time=0
hardcoded_timeout=180 # don't break for at least this amount of time
keepRunning=true
while $keepRunning; do
    echo "*****************************************************"
    num_events_now=$(sudo strfry scan --count '{}')
    num_new_events=$(($num_events_now - $num_events_last))
    syncWoT_active_time=$(($(date +%s) - $start_time))
    echo "num_events_now: $num_events_now"
    echo "num_events_last: $num_events_last"
    echo "num_new_events: $num_new_events"
    echo "syncWoT_active_time: $syncWoT_active_time"
    num_events_last=$num_events_now
    if [ $num_new_events -lt $num_events_increment ]; then
        # calculate amount of time syncWoT has been active as now minus start time
        echo "$(date): Less than $num_events_increment events in $time_increment seconds"
        echo "$(date): Less than $num_events_increment events in $time_increment seconds" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log
        # kill all sync_pid processes
        # kill ${sync_pid[@]}
        if [ $syncWoT_active_time -gt $hardcoded_timeout ]; then
            echo "$(date): syncWoT_active_time $syncWoT_active_time has been running for more than hardcoded_timeout $hardcoded_timeout seconds, exiting syncWoT"
            echo "$(date): syncWoT_active_time $syncWoT_active_time has been running for more than hardcoded_timeout $hardcoded_timeout seconds, exiting syncWoT" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log
            keepRunning=false
        fi
    fi
    # If now is more than start_time plus 3 hours, then kill all syncWoT processes and complete syncWoT
    if [ $(date +%s) -gt $(($start_time + 10800)) ]; then
        echo "$(date): SyncWoT has been running for 3 hours, killing syncWoT processes"
        echo "$(date): SyncWoT has been running for 3 hours, killing syncWoT processes" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log
        # kill all sync_pid processes
        # kill ${sync_pid[@]}
        keepRunning=false
    fi
    echo "*****************************************************"
    sleep $time_increment
done

echo "$(date): All syncWoT processes completed; from $num_events_start to $num_events_last events synced in $syncWoT_active_time seconds"
echo "$(date): All syncWoT processes completed; from $num_events_start to $num_events_last events synced in $syncWoT_active_time seconds" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log

# Emit structured event for task completion
oMetadata=$(jq -n \
    --arg sync_direction "down" \
    --argjson num_events_start "$num_events_start" \
    --argjson num_events_end "$num_events_last" \
    --argjson syncWoT_active_time "$syncWoT_active_time" \
    --arg message "Web of Trust synchronization completed successfully" \
    '{
        "sync_direction": $sync_direction,
        "num_events_start": $num_events_start,
        "num_events_end": $num_events_end,
        "syncWoT_active_time": $syncWoT_active_time,
        "message": $message
    }')
emit_task_event "TASK_END" "syncWoT" "system" "$oMetadata"

exit 0  # Explicit success exit code for parent script orchestration

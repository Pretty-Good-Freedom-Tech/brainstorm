#!/bin/bash

# process all webs of trust scores
# calculate all scores:
# - hops
# - personalizedPageRank
# - personalizedGrapeRank

# calculate and export whitelist
# calculate and export blacklist
# NIP-85 Trusted Assertions

# ? turn on Stream Filtered Content if not already active

CONFIG_FILE="/etc/brainstorm.conf"
source "$CONFIG_FILE" # BRAINSTORM_MODULE_MANAGE_DIR, BRAINSTORM_LOG_DIR, BRAINSTORM_MODULE_ALGOS_DIR, BRAINSTORM_MODULE_PIPELINE_DIR

# Source structured logging utilities
source "$BRAINSTORM_MODULE_BASE_DIR/src/utils/structuredLogging.sh"

# Source launchChildTask function
source "$BRAINSTORM_MODULE_MANAGE_DIR/taskQueue/launchChildTask.sh"

touch ${BRAINSTORM_LOG_DIR}/processAllTasks.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/processAllTasks.log

# wrapper function which employs legacy log system; 
# will eventually get rid of this wrapper and just run launchChildTask directly
launch_child_task() {
    local task_name="$1"
    local parent_task_name="$2"
    local options_json="$3"
    local child_args="$4"

    echo "$(date): Continuing $parent_task_name; Starting $task_name using launchChildTask"
    echo "$(date): Continuing $parent_task_name; Starting $task_name using launchChildTask" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

    if launchChildTask "$task_name" "$parent_task_name" "$options_json" "$child_args"; then
        echo "$(date): $task_name completed successfully via launchChildTask"
        echo "$(date): $task_name completed successfully via launchChildTask" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log
    else
        local exit_code=$?
        echo "$(date): $task_name failed via launchChildTask with exit code: $exit_code"
        echo "$(date): $task_name failed via launchChildTask with exit code: $exit_code" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log
        # Note: launchChildTask handles parentNextStep logic, so we continue based on its return code
    fi

    echo "$(date): Continuing $parent_task_name; $task_name completed"
    echo "$(date): Continuing $parent_task_name; $task_name completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log
}

echo "$(date): Starting processAllTasks"
echo "$(date): Starting processAllTasks" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

# Emit structured event for task start
oMetadata=$(jq -n \
    --arg message "Starting complete Brainstorm pipeline execution" \
    --arg pipeline_type "full_system" \
    --arg child_tasks "12" \
    --arg description "Top-level orchestrator for entire Brainstorm system" \
    --arg scope "system_wide" \
    --arg orchestrator_level "primary" \
    '{
        "message": $message,
        "pipeline_type": $pipeline_type,
        "child_tasks": $child_tasks,
        "description": $description,
        "scope": $scope,
        "orchestrator_level": $orchestrator_level
    }')
emit_task_event "TASK_START" "processAllTasks" "" "$oMetadata"

sleep 5

#################### neo4jConstraintsAndIndexes: start  ##############
# Child Task 1: Neo4j Constraints and Indexes
launchChildTask "neo4jConstraintsAndIndexes" "processAllTasks" "" ""
#################### neo4jConstraintsAndIndexes: complete  ##############

sleep 5

#################### syncWoT: start  ##############
# Child Task 2: Negentropy WoT Sync using launchChildTask

# use command: sudo strfry scan --count '{"kinds": [3]}' to determine how many kind 3 events exist in the local strfry database
# if numKind3Events < 100, then set timeout to 3 hours
# otherwise set timeout to 5 minutes
numKind3Events=$(sudo strfry scan --count '{"kinds": [3]}')
if [ "$numKind3Events" -lt 100 ]; then
    timeoutDuration=10800001
else
    timeoutDuration=300001
fi

echo "$(date): Continuing processAllTasks; preparing for syncWoT; numKind3Events: $numKind3Events; timeoutDuration: $timeoutDuration"
echo "$(date): Continuing processAllTasks; preparing for syncWoT; numKind3Events: $numKind3Events; timeoutDuration: $timeoutDuration" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

# override timeout duration
oOptions_syncWoT=$(jq -n \
    --argjson completion "{\"failure\": {\"timeout\": {\"duration\": $timeoutDuration, \"forceKill\": false}}}" \
    '{
        "completion": $completion
    }')
echo "$(date): Continuing processAllTasks; about to launch syncWoT with options: $oOptions_syncWoT"
echo "$(date): Continuing processAllTasks; about to launch syncWoT with options: $oOptions_syncWoT" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log
launch_child_task "syncWoT" "processAllTasks" "$oOptions_syncWoT" ""
#################### syncWoT: complete  ##############

sleep 5

: <<'COMMENT_BLOCK'
# Temporarily using syncWoT to obtain kind 0 events from all basic relays; no need for syncProfiles
#################### syncProfiles: start  ##############
# Child Task 2: Negentropy Profiles Sync using launchChildTask
# override timeout duration to 1 hour if numKind0Events < 100, otherwise set timeout to 5 minutes
numKind0Events=$(sudo strfry scan --count '{"kinds": [0]}')
if [ "$numKind0Events" -lt 100 ]; then
    timeoutDuration=3600001
else
    timeoutDuration=300001
fi

oOptions_syncProfiles=$(jq -n \
    --argjson completion "{\"failure\": {\"timeout\": {\"duration\": $timeoutDuration, \"forceKill\": false}}}" \
    '{
        "completion": $completion
    }')
echo "$(date): Continuing processAllTasks; about to launch syncProfiles with options: $oOptions_syncProfiles"
echo "$(date): Continuing processAllTasks; about to launch syncProfiles with options: $oOptions_syncProfiles" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log
launch_child_task "syncProfiles" "processAllTasks" "$oOptions_syncProfiles" ""
#################### syncProfiles: complete  ##############
COMMENT_BLOCK

sleep 5

#################### callBatchTransferIfNeeded: start  ##############
# Child Task 3: Batch Transfer
launch_child_task "callBatchTransferIfNeeded" "processAllTasks" "" ""
#################### callBatchTransferIfNeeded: complete  ##############

sleep 5

#################### reconciliation: start  ##############
# Child Task 4: Data Reconciliation
launch_child_task "reconciliation" "processAllTasks" "" ""
#################### reconciliation: complete  ##############

sleep 5

#################### processNpubsUpToMaxNumBlocks: start  ##############
# Child Task 5: Process Npubs
launch_child_task "processNpubsUpToMaxNumBlocks" "processAllTasks" "" ""
#################### processNpubsUpToMaxNumBlocks: complete  ##############

sleep 5

#################### calculateOwnerHops: start  ##############
# Child Task 6: Calculate Owner Hops
launch_child_task "calculateOwnerHops" "processAllTasks" "" ""
#################### calculateOwnerHops: complete  ##############

sleep 5

#################### calculateOwnerPageRank: start  ##############
# Child Task 6: Calculate Owner PageRank
launch_child_task "calculateOwnerPageRank" "processAllTasks" "" ""
#################### calculateOwnerPageRank: complete  ##############

sleep 5

#################### calculateOwnerGrapeRank: start  ##############
# Child Task 6: Calculate Owner PageRank
launch_child_task "calculateOwnerGrapeRank" "processAllTasks" "" ""
#################### calculateOwnerGrapeRank: complete  ##############

sleep 5

#################### processOwnerFollowsMutesReports: start  ##############
# Child Task 6: Process Owner Follows Mutes Reports
launch_child_task "processOwnerFollowsMutesReports" "processAllTasks" "" ""
#################### processOwnerFollowsMutesReports: complete  ##############

sleep 5

#################### calculateReportScores: start  ##############
# Child Task 6: calculate Owner Report Scores
launch_child_task "calculateReportScores" "processAllTasks" "" ""
#################### calculateReportScores: complete  ##############

sleep 5

#################### exportWhitelist: start  ##############
# Child Task 6: Export Owner Whitelist
# TODO: may rewrite this task to integrate with get-whitelist api endpoint
# Should also rename to exportOwnerWhitelist
# launch_child_task "exportWhitelist" "processAllTasks" "" ""
#################### exportWhitelist: complete  ##############

sleep 5

#################### exportOwnerKind30382: start  ##############
# Child Task 6: Export Owner Kind 30382
launch_child_task "exportOwnerKind30382" "processAllTasks" "" ""
#################### exportOwnerKind30382: complete  ##############

sleep 5

#################### processAllActiveCustomers: start  ##############
# Child Task 6: Process All Active Customers
launch_child_task "processAllActiveCustomers" "processAllTasks" "" ""
#################### processAllActiveCustomers: complete  ##############

sleep 5

echo "$(date): Finished processAllTasks"
echo "$(date): Finished processAllTasks" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

# Emit structured event for task completion
emit_task_event "TASK_END" "processAllTasks" "" '{
    "status": "success",
    "pipeline_type": "full_system",
    "child_tasks_completed": 12,
    "message": "Complete Brainstorm pipeline execution finished successfully",
    "description": "Top-level orchestrator for entire Brainstorm system",
    "scope": "system_wide",
    "orchestrator_level": "primary"
}'

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

# Function to check disk space and log it
check_disk_space() {
  local label=$1
  echo "$(date): $label - Checking disk space" | tee -a ${BRAINSTORM_LOG_DIR}/processAllTasks.log
  
  # Overall disk usage
  echo "$(date): $label - Overall disk usage:" | tee -a ${BRAINSTORM_LOG_DIR}/processAllTasks.log
  df -h / | tee -a ${BRAINSTORM_LOG_DIR}/processAllTasks.log
  
  # Neo4j data directory size
  echo "$(date): $label - Neo4j data directory size:" | tee -a ${BRAINSTORM_LOG_DIR}/processAllTasks.log
  du -sh /var/lib/neo4j/data | tee -a ${BRAINSTORM_LOG_DIR}/processAllTasks.log
  
  # Neo4j transaction logs size
  echo "$(date): $label - Neo4j transaction logs size:" | tee -a ${BRAINSTORM_LOG_DIR}/processAllTasks.log
  du -sh /var/lib/neo4j/data/transactions | tee -a ${BRAINSTORM_LOG_DIR}/processAllTasks.log
  
  # List largest transaction log files
  echo "$(date): $label - Largest transaction log files:" | tee -a ${BRAINSTORM_LOG_DIR}/processAllTasks.log
  find /var/lib/neo4j/data/transactions -type f -name "*.db*" -exec ls -lh {} \; | sort -rh -k5 | head -5 | tee -a ${BRAINSTORM_LOG_DIR}/processAllTasks.log
}

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

echo "$(date): Starting processAllTasks" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

# Emit structured event for task start
emit_task_event "TASK_START" "processAllTasks" "" '{
    "message": "Starting complete Brainstorm pipeline execution",
    "pipeline_type": "full_system",
    "child_tasks": 12,
    "description": "Top-level orchestrator for entire Brainstorm system",
    "scope": "system_wide",
    "orchestrator_level": "primary"
}'

sleep 5

#################### neo4jConstraintsAndIndexes: start  ##############
# Child Task 1: Neo4j Constraints and Indexes
launchChildTask "neo4jConstraintsAndIndexes" "processAllTasks" "" ""
#################### neo4jConstraintsAndIndexes: complete  ##############

sleep 5

#################### syncWoT: start  ##############
# Child Task 2: Negentropy WoT Sync using launchChildTask
launchChildTask "syncWoT" "processAllTasks" "" ""
#################### syncWoT: complete  ##############

sleep 5

#################### syncProfiles: start  ##############
# Child Task 2: Negentropy Profiles Sync using launchChildTask
launchChildTask "syncProfiles" "processAllTasks" "" ""
#################### syncProfiles: complete  ##############

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

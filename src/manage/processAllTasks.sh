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

#################### neo4jConstraintsAndIndexes: start  ##############
# Child Task 1: Neo4j Constraints and Indexes
emit_task_event "CHILD_TASK_START" "processAllTasks" "" '{
    "child_task": "neo4jConstraintsAndIndexes",
    "message": "Starting Neo4j constraints and indexes setup",
    "task_order": 1,
    "category": "database_setup",
    "operation": "constraints_and_indexes"
}'

if sudo $BRAINSTORM_MODULE_BASE_DIR/setup/neo4jConstraintsAndIndexes.sh; then
    emit_task_event "CHILD_TASK_END" "processAllTasks" "" '{
        "child_task": "neo4jConstraintsAndIndexes",
        "child_exit_code": '$CHILD_EXIT_CODE',
        "status": "success",
        "message": "Neo4j constraints and indexes setup completed",
        "task_order": 1,
        "category": "database_setup"
    }'
else
    emit_task_event "CHILD_TASK_ERROR" "processAllTasks" "" '{
        "child_task": "neo4jConstraintsAndIndexes",
        "child_exit_code": '$CHILD_EXIT_CODE',
        "status": "error",
        "message": "Neo4j constraints and indexes setup failed",
        "task_order": 1,
        "category": "database_setup"
    }'
fi

echo "$(date): Continuing processAllTasks; neo4jConstraintsAndIndexes.sh completed"
echo "$(date): Continuing processAllTasks; neo4jConstraintsAndIndexes.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log
#################### neo4jConstraintsAndIndexes: complete  ##############

#################### syncWoT: start  ##############
# Child Task 2: Negentropy WoT Sync using launchChildTask
echo "$(date): Continuing processAllTasks; Starting syncWoT using launchChildTask"
echo "$(date): Continuing processAllTasks; Starting syncWoT using launchChildTask" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

if launchChildTask "syncWoT" "processAllTasks"; then
    echo "$(date): syncWoT completed successfully via launchChildTask"
    echo "$(date): syncWoT completed successfully via launchChildTask" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log
else
    local exit_code=$?
    echo "$(date): syncWoT failed via launchChildTask with exit code: $exit_code"
    echo "$(date): syncWoT failed via launchChildTask with exit code: $exit_code" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log
    # Note: launchChildTask handles parentNextStep logic, so we continue based on its return code
fi

echo "$(date): Continuing processAllTasks; syncWoT completed"
echo "$(date): Continuing processAllTasks; syncWoT completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

#################### syncWoT: complete  ##############

sleep 5

# temporarily disable; perform manually for now
# sudo $BRAINSTORM_MODULE_MANAGE_DIR/negentropySync/syncProfiles.sh
# echo "$(date): Continuing processAllTasks; syncProfiles.sh completed"
# echo "$(date): Continuing processAllTasks; syncProfiles.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

# sleep 5

# temporarily disable
# sudo $BRAINSTORM_MODULE_MANAGE_DIR/negentropySync/syncPersonal.sh
# echo "$(date): Continuing processAllTasks; syncPersonal.sh completed"
# echo "$(date): Continuing processAllTasks; syncPersonal.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

# sleep 5

# Child Task 3: Batch Transfer
emit_task_event "CHILD_TASK_START" "processAllTasks" "" '{
    "child_task": "callBatchTransferIfNeeded",
    "message": "Starting batch transfer",
    "task_order": 3,
    "category": "batch_transfer",
    "operation": "batch_transfer"
}'

if sudo $BRAINSTORM_MODULE_MANAGE_DIR/batchTransfer/callBatchTransferIfNeeded.sh; then
    emit_task_event "CHILD_TASK_END" "processAllTasks" "" '{
        "child_task": "callBatchTransferIfNeeded",
        "status": "success",
        "message": "Batch transfer completed",
        "task_order": 3,
        "category": "batch_transfer"
    }'
else
    emit_task_event "CHILD_TASK_ERROR" "processAllTasks" "" '{
        "child_task": "callBatchTransferIfNeeded",
        "status": "error",
        "message": "Batch transfer failed",
        "task_order": 3,
        "category": "batch_transfer"
    }'
fi

echo "$(date): Continuing processAllTasks; callBatchTransferIfNeeded.sh completed"
echo "$(date): Continuing processAllTasks; callBatchTransferIfNeeded.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

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

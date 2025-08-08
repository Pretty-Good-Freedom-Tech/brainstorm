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
emit_task_event "TASK_START" "processAllTasks" \
    "message=Starting complete Brainstorm pipeline execution" \
    "pipeline_type=full_system" \
    "child_tasks=12"

# Child Task 1: Neo4j Constraints and Indexes
emit_task_event "CHILD_TASK_START" "processAllTasks" \
    "child_task=neo4jConstraintsAndIndexes" \
    "message=Starting Neo4j constraints and indexes setup"

if sudo $BRAINSTORM_MODULE_BASE_DIR/setup/neo4jConstraintsAndIndexes.sh; then
    emit_task_event "CHILD_TASK_END" "processAllTasks" \
        "child_task=neo4jConstraintsAndIndexes" \
        "status=success" \
        "message=Neo4j constraints and indexes setup completed"
else
    emit_task_event "CHILD_TASK_ERROR" "processAllTasks" \
        "child_task=neo4jConstraintsAndIndexes" \
        "status=error" \
        "message=Neo4j constraints and indexes setup failed"
fi

echo "$(date): Continuing processAllTasks; neo4jConstraintsAndIndexes.sh completed"
echo "$(date): Continuing processAllTasks; neo4jConstraintsAndIndexes.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

# Child Task 2: Negentropy WoT Sync
emit_task_event "CHILD_TASK_START" "processAllTasks" \
    "child_task=syncWoT" \
    "message=Starting negentropy WoT synchronization"

if sudo $BRAINSTORM_MODULE_MANAGE_DIR/negentropySync/syncWoT.sh; then
    emit_task_event "CHILD_TASK_END" "processAllTasks" \
        "child_task=syncWoT" \
        "status=success" \
        "message=Negentropy WoT synchronization completed"
else
    emit_task_event "CHILD_TASK_ERROR" "processAllTasks" \
        "child_task=syncWoT" \
        "status=error" \
        "message=Negentropy WoT synchronization failed"
fi

echo "$(date): Continuing processAllTasks; syncWoT.sh completed"
echo "$(date): Continuing processAllTasks; syncWoT.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

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

sudo $BRAINSTORM_MODULE_MANAGE_DIR/batchTransfer/callBatchTransferIfNeeded.sh
echo "$(date): Continuing processAllTasks; callBatchTransferIfNeeded.sh completed"
echo "$(date): Continuing processAllTasks; callBatchTransferIfNeeded.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

# DEPRECATED: delete relationships followed by repeat batch transfer

# Check disk space before deleting relationships
# check_disk_space "Before deleting relationships"

# sudo $BRAINSTORM_MODULE_MANAGE_DIR/deleteRels/deleteAllRelationships/deleteAllRelationships.sh
# echo "$(date): Continuing processAllTasks; deleteAllRelationships.sh completed"
# echo "$(date): Continuing processAllTasks; deleteAllRelationships.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

# sleep 5

# Check disk space after deleting relationships
# check_disk_space "After deleting relationships"

# Check disk space after deleting relationships
# check_disk_space "After deleting relationships, before neo4j restart"

# restart neo4j to clear tx logs
# sudo systemctl restart neo4j

# wait 5 minutes to allow neo4j to clear tx logs
# sleep 300

# Check disk space after deleting relationships
# check_disk_space "After deleting relationships, after neo4j restart"

# sudo $BRAINSTORM_MODULE_MANAGE_DIR/batchTransfer/callBatchTransfer.sh
# echo "$(date): Continuing processAllTasks; callBatchTransfer.sh completed"
# echo "$(date): Continuing processAllTasks; callBatchTransfer.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

# Check disk space after batch transfer
# check_disk_space "After batch transfer"

# sleep 5

# restart neo4j to clear tx logs
# sudo systemctl restart neo4j

# wait 5 minutes to allow neo4j to clear tx logs
# sleep 300

# Final disk space check after restart
# check_disk_space "After final Neo4j restart"

# May be removing this step; in its place, using reconcile service to run it more frequently
# UPDATE: as of July 17 2025 this is replaced by reconciliation service
# sudo $BRAINSTORM_MODULE_PIPELINE_DIR/reconcile/runFullReconciliation.sh
# echo "$(date): Continuing processAllTasks; runFullReconciliation.sh completed"
# echo "$(date): Continuing processAllTasks; runFullReconciliation.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

# Child Task 3: Data Reconciliation
emit_task_event "CHILD_TASK_START" "processAllTasks" \
    "child_task=reconciliation" \
    "message=Starting data reconciliation process"

if sudo $BRAINSTORM_MODULE_PIPELINE_DIR/reconciliation/reconciliation.sh; then
    emit_task_event "CHILD_TASK_END" "processAllTasks" \
        "child_task=reconciliation" \
        "status=success" \
        "message=Data reconciliation completed"
else
    emit_task_event "CHILD_TASK_ERROR" "processAllTasks" \
        "child_task=reconciliation" \
        "status=error" \
        "message=Data reconciliation failed"
fi

echo "$(date): Continuing processAllTasks; reconciliation.sh completed"
echo "$(date): Continuing processAllTasks; reconciliation.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sleep 5

# Child Task 4: Process Npubs
emit_task_event "CHILD_TASK_START" "processAllTasks" \
    "child_task=processNpubsUpToMaxNumBlocks" \
    "max_blocks=1000" \
    "message=Starting npub processing with max 1000 blocks"

if sudo $BRAINSTORM_MODULE_MANAGE_DIR/nostrUsers/processNpubsUpToMaxNumBlocks.sh 1000; then
    emit_task_event "CHILD_TASK_END" "processAllTasks" \
        "child_task=processNpubsUpToMaxNumBlocks" \
        "status=success" \
        "max_blocks=1000" \
        "message=Npub processing completed"
else
    emit_task_event "CHILD_TASK_ERROR" "processAllTasks" \
        "child_task=processNpubsUpToMaxNumBlocks" \
        "status=error" \
        "message=Npub processing failed"
fi

echo "$(date): Continuing processAllTasks; processNpubsUpToMaxNumBlocks.sh 1000 completed"
echo "$(date): Continuing processAllTasks; processNpubsUpToMaxNumBlocks.sh 1000 completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sleep 5

# Child Task 5: Calculate Hops (has Phase 2 structured logging)
emit_task_event "CHILD_TASK_START" "processAllTasks" \
    "child_task=calculateHops" \
    "message=Starting hops calculation (Phase 2 structured logging enabled)"

if sudo $BRAINSTORM_MODULE_ALGOS_DIR/calculateHops.sh; then
    emit_task_event "CHILD_TASK_END" "processAllTasks" \
        "child_task=calculateHops" \
        "status=success" \
        "message=Hops calculation completed"
else
    emit_task_event "CHILD_TASK_ERROR" "processAllTasks" \
        "child_task=calculateHops" \
        "status=error" \
        "message=Hops calculation failed"
fi

echo "$(date): Continuing processAllTasks; calculateHops.sh completed"
echo "$(date): Continuing processAllTasks; calculateHops.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sleep 5

# Child Task 6: Calculate Personalized PageRank (has Phase 2 structured logging)
emit_task_event "CHILD_TASK_START" "processAllTasks" \
    "child_task=calculatePersonalizedPageRank" \
    "message=Starting personalized PageRank calculation (Phase 2 structured logging enabled)"

if sudo $BRAINSTORM_MODULE_ALGOS_DIR/calculatePersonalizedPageRank.sh; then
    emit_task_event "CHILD_TASK_END" "processAllTasks" \
        "child_task=calculatePersonalizedPageRank" \
        "status=success" \
        "message=Personalized PageRank calculation completed"
else
    emit_task_event "CHILD_TASK_ERROR" "processAllTasks" \
        "child_task=calculatePersonalizedPageRank" \
        "status=error" \
        "message=Personalized PageRank calculation failed"
fi

echo "$(date): Continuing processAllTasks; calculatePersonalizedPageRank.sh completed"
echo "$(date): Continuing processAllTasks; calculatePersonalizedPageRank.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sleep 5

# Child Task 7: Calculate Personalized GrapeRank (with timeout/retry controller)
emit_task_event "CHILD_TASK_START" "processAllTasks" \
    "child_task=calculatePersonalizedGrapeRankController" \
    "message=Starting personalized GrapeRank calculation with timeout/retry controller"

# The controller script handles the timeout and retry logic
if sudo $BRAINSTORM_MODULE_ALGOS_DIR/personalizedGrapeRank/calculatePersonalizedGrapeRankController.sh; then
    emit_task_event "CHILD_TASK_END" "processAllTasks" \
        "child_task=calculatePersonalizedGrapeRankController" \
        "status=success" \
        "message=Personalized GrapeRank calculation completed"
else
    emit_task_event "CHILD_TASK_ERROR" "processAllTasks" \
        "child_task=calculatePersonalizedGrapeRankController" \
        "status=error" \
        "message=Personalized GrapeRank calculation failed"
fi

echo "$(date): Continuing processAllTasks; calculatePersonalizedGrapeRankController.sh completed"
echo "$(date): Continuing processAllTasks; calculatePersonalizedGrapeRankController.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sleep 5

# Child Task 8: Process Follows, Mutes, and Reports (has Phase 2 structured logging)
emit_task_event "CHILD_TASK_START" "processAllTasks" \
    "child_task=processFollowsMutesReports" \
    "message=Starting follows, mutes, and reports processing (Phase 2 structured logging enabled)"

if sudo $BRAINSTORM_MODULE_ALGOS_DIR/follows-mutes-reports/processFollowsMutesReports.sh; then
    emit_task_event "CHILD_TASK_END" "processAllTasks" \
        "child_task=processFollowsMutesReports" \
        "status=success" \
        "message=Follows, mutes, and reports processing completed"
else
    emit_task_event "CHILD_TASK_ERROR" "processAllTasks" \
        "child_task=processFollowsMutesReports" \
        "status=error" \
        "message=Follows, mutes, and reports processing failed"
fi

echo "$(date): Continuing processAllTasks; processFollowsMutesReports.sh completed"
echo "$(date): Continuing processAllTasks; processFollowsMutesReports.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sleep 5

# Child Task 9: Calculate Report Scores
emit_task_event "CHILD_TASK_START" "processAllTasks" \
    "child_task=calculateReportScores" \
    "message=Starting report scores calculation"

if sudo $BRAINSTORM_MODULE_ALGOS_DIR/reports/calculateReportScores.sh; then
    emit_task_event "CHILD_TASK_END" "processAllTasks" \
        "child_task=calculateReportScores" \
        "status=success" \
        "message=Report scores calculation completed"
else
    emit_task_event "CHILD_TASK_ERROR" "processAllTasks" \
        "child_task=calculateReportScores" \
        "status=error" \
        "message=Report scores calculation failed"
fi

echo "$(date): Continuing processAllTasks; calculateReportScores.sh completed"
echo "$(date): Continuing processAllTasks; calculateReportScores.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sleep 5

# temporarily disabled while we move calculation of follows, mutes, and reports inputs to a separate script
# sudo $BRAINSTORM_MODULE_ALGOS_DIR/personalizedBlacklist/calculatePersonalizedBlacklist.sh
# echo "$(date): Continuing processAllTasks; calculatePersonalizedBlacklist.sh completed"
# echo "$(date): Continuing processAllTasks; calculatePersonalizedBlacklist.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sleep 5

# Child Task 10: Export Whitelist
emit_task_event "CHILD_TASK_START" "processAllTasks" \
    "child_task=exportWhitelist" \
    "message=Starting whitelist export"

if sudo $BRAINSTORM_MODULE_ALGOS_DIR/exportWhitelist.sh; then
    emit_task_event "CHILD_TASK_END" "processAllTasks" \
        "child_task=exportWhitelist" \
        "status=success" \
        "message=Whitelist export completed"
else
    emit_task_event "CHILD_TASK_ERROR" "processAllTasks" \
        "child_task=exportWhitelist" \
        "status=error" \
        "message=Whitelist export failed"
fi

echo "$(date): Continuing processAllTasks; exportWhitelist.sh completed"
echo "$(date): Continuing processAllTasks; exportWhitelist.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sleep 5

# Child Task 11: Publish NIP-85
emit_task_event "CHILD_TASK_START" "processAllTasks" \
    "child_task=publishNip85" \
    "message=Starting NIP-85 trusted assertions publishing"

if sudo $BRAINSTORM_MODULE_ALGOS_DIR/nip85/publishNip85.sh; then
    emit_task_event "CHILD_TASK_END" "processAllTasks" \
        "child_task=publishNip85" \
        "status=success" \
        "message=NIP-85 trusted assertions publishing completed"
else
    emit_task_event "CHILD_TASK_ERROR" "processAllTasks" \
        "child_task=publishNip85" \
        "status=error" \
        "message=NIP-85 trusted assertions publishing failed"
fi

echo "$(date): Continuing processAllTasks; publishNip85.sh completed"
echo "$(date): Continuing processAllTasks; publishNip85.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sleep 5

# Child Task 12: Process All Active Customers
emit_task_event "CHILD_TASK_START" "processAllTasks" \
    "child_task=processAllActiveCustomers" \
    "message=Starting processing of all active customers"

if sudo $BRAINSTORM_MODULE_ALGOS_DIR/customers/processAllActiveCustomers.sh; then
    emit_task_event "CHILD_TASK_END" "processAllTasks" \
        "child_task=processAllActiveCustomers" \
        "status=success" \
        "message=Processing of all active customers completed"
else
    emit_task_event "CHILD_TASK_ERROR" "processAllTasks" \
        "child_task=processAllActiveCustomers" \
        "status=error" \
        "message=Processing of all active customers failed"
fi

echo "$(date): Continuing processAllTasks; processAllActiveCustomers.sh completed"
echo "$(date): Continuing processAllTasks; processAllActiveCustomers.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sleep 5

# restart the reconcile service
# sudo systemctl restart reconcile.service
# echo "$(date): Continuing processAllTasks; reconcile.service restarted"
# echo "$(date): Continuing processAllTasks; reconcile.service restarted" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log
# sleep 5

# ? turn on Stream Filtered Content if not already active

echo "$(date): Finished processAllTasks"
echo "$(date): Finished processAllTasks" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

# Emit structured event for task completion
emit_task_event "TASK_END" "processAllTasks" \
    "status=success" \
    "pipeline_type=full_system" \
    "child_tasks_completed=12" \
    "message=Complete Brainstorm pipeline execution finished successfully"
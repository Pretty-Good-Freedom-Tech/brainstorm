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

check_disk_space "Before batch transfer"

sudo $BRAINSTORM_MODULE_MANAGE_DIR/negentropySync/syncWoT.sh
echo "$(date): Continuing processAllTasks; syncWoT.sh completed"
echo "$(date): Continuing processAllTasks; syncWoT.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sleep 5

sudo $BRAINSTORM_MODULE_MANAGE_DIR/negentropySync/syncProfiles.sh
echo "$(date): Continuing processAllTasks; syncProfiles.sh completed"
echo "$(date): Continuing processAllTasks; syncProfiles.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sleep 5

sudo $BRAINSTORM_MODULE_MANAGE_DIR/negentropySync/syncPersonal.sh
echo "$(date): Continuing processAllTasks; syncPersonal.sh completed"
echo "$(date): Continuing processAllTasks; syncPersonal.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sleep 5

# In place of batch transfer only once at initialization, currently for each iteration:
# 1. delete all relationships from neo4j
# 2. call batch transfer

# sudo $BRAINSTORM_MODULE_MANAGE_DIR/batchTransfer/callBatchTransferIfNeeded.sh
# echo "$(date): Continuing processAllTasks; callBatchTransferIfNeeded.sh completed"
# echo "$(date): Continuing processAllTasks; callBatchTransferIfNeeded.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

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
# sudo $BRAINSTORM_MODULE_PIPELINE_DIR/reconcile/runFullReconciliation.sh
# echo "$(date): Continuing processAllTasks; runFullReconciliation.sh completed"
# echo "$(date): Continuing processAllTasks; runFullReconciliation.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sudo $BRAINSTORM_MODULE_PIPELINE_DIR/reconciliation/reconciliation.sh
echo "$(date): Continuing processAllTasks; reconciliation.sh completed"
echo "$(date): Continuing processAllTasks; reconciliation.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sleep 5

sudo $BRAINSTORM_MODULE_ALGOS_DIR/calculateHops.sh
echo "$(date): Continuing processAllTasks; calculateHops.sh completed"
echo "$(date): Continuing processAllTasks; calculateHops.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sleep 5

sudo $BRAINSTORM_MODULE_ALGOS_DIR/calculatePersonalizedPageRank.sh
echo "$(date): Continuing processAllTasks; calculatePersonalizedPageRank.sh completed"
echo "$(date): Continuing processAllTasks; calculatePersonalizedPageRank.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sleep 5

# The controller script handles the timeout and retry logic
sudo $BRAINSTORM_MODULE_ALGOS_DIR/personalizedGrapeRank/calculatePersonalizedGrapeRankController.sh
echo "$(date): Continuing processAllTasks; calculatePersonalizedGrapeRankController.sh completed"
echo "$(date): Continuing processAllTasks; calculatePersonalizedGrapeRankController.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sleep 5

sudo $BRAINSTORM_MODULE_ALGOS_DIR/follows-mutes-reports/processFollowsMutesReports.sh
echo "$(date): Continuing processAllTasks; processFollowsMutesReports.sh completed"
echo "$(date): Continuing processAllTasks; processFollowsMutesReports.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sleep 5

sudo $BRAINSTORM_MODULE_ALGOS_DIR/reports/calculateReportScores.sh
echo "$(date): Continuing processAllTasks; calculateReportScores.sh completed"
echo "$(date): Continuing processAllTasks; calculateReportScores.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sleep 5

# temporarily disabled while we move calculation of follows, mutes, and reports inputs to a separate script
# sudo $BRAINSTORM_MODULE_ALGOS_DIR/personalizedBlacklist/calculatePersonalizedBlacklist.sh
# echo "$(date): Continuing processAllTasks; calculatePersonalizedBlacklist.sh completed"
# echo "$(date): Continuing processAllTasks; calculatePersonalizedBlacklist.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sleep 5

sudo $BRAINSTORM_MODULE_ALGOS_DIR/exportWhitelist.sh
echo "$(date): Continuing processAllTasks; exportWhitelist.sh completed"
echo "$(date): Continuing processAllTasks; exportWhitelist.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sleep 5

sudo $BRAINSTORM_MODULE_ALGOS_DIR/nip85/publishNip85.sh
echo "$(date): Continuing processAllTasks; publishNip85.sh completed"
echo "$(date): Continuing processAllTasks; publishNip85.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sleep 5

sudo $BRAINSTORM_MODULE_ALGOS_DIR/customers/processAllActiveCustomers.sh
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
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

touch ${BRAINSTORM_LOG_DIR}/processAllTasks.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/processAllTasks.log

echo "$(date): Starting processAllTasks" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

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

sudo $BRAINSTORM_MODULE_MANAGE_DIR/batchTransfer/callBatchTransferIfNeeded.sh
echo "$(date): Continuing processAllTasks; callBatchTransferIfNeeded.sh completed"
echo "$(date): Continuing processAllTasks; callBatchTransferIfNeeded.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sleep 5

# Removing this step; in its place, using reconcile service to run it more frequently
# sudo $BRAINSTORM_MODULE_PIPELINE_DIR/reconcile/runFullReconciliation.sh
# echo "$(date): Continuing processAllTasks; runFullReconciliation.sh completed"
# echo "$(date): Continuing processAllTasks; runFullReconciliation.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

# sleep 5

sudo $BRAINSTORM_MODULE_ALGOS_DIR/calculateHops.sh
echo "$(date): Continuing processAllTasks; calculateHops.sh completed"
echo "$(date): Continuing processAllTasks; calculateHops.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sleep 5

sudo $BRAINSTORM_MODULE_ALGOS_DIR/calculatePersonalizedPageRank.sh
echo "$(date): Continuing processAllTasks; calculatePersonalizedPageRank.sh completed"
echo "$(date): Continuing processAllTasks; calculatePersonalizedPageRank.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sleep 5

sudo $BRAINSTORM_MODULE_ALGOS_DIR/personalizedGrapeRank/calculatePersonalizedGrapeRank.sh
echo "$(date): Continuing processAllTasks; calculatePersonalizedGrapeRank.sh completed"
echo "$(date): Continuing processAllTasks; calculatePersonalizedGrapeRank.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sleep 5

sudo $BRAINSTORM_MODULE_ALGOS_DIR/calculateVerifiedFollowers.sh
echo "$(date): Continuing processAllTasks; calculateVerifiedFollowers.sh completed"
echo "$(date): Continuing processAllTasks; calculateVerifiedFollowers.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sleep 5

sudo $BRAINSTORM_MODULE_ALGOS_DIR/reports/calculateReportScores.sh
echo "$(date): Continuing processAllTasks; calculateReportScores.sh completed"
echo "$(date): Continuing processAllTasks; calculateReportScores.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sleep 5

sudo $BRAINSTORM_MODULE_ALGOS_DIR/personalizedBlacklist/calculatePersonalizedBlacklist.sh
echo "$(date): Continuing processAllTasks; calculatePersonalizedBlacklist.sh completed"
echo "$(date): Continuing processAllTasks; calculatePersonalizedBlacklist.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sleep 5

sudo $BRAINSTORM_MODULE_ALGOS_DIR/exportWhitelist.sh
echo "$(date): Continuing processAllTasks; exportWhitelist.sh completed"
echo "$(date): Continuing processAllTasks; exportWhitelist.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sleep 5

sudo $BRAINSTORM_MODULE_ALGOS_DIR/nip85/publishNip85.sh
echo "$(date): Continuing processAllTasks; publishNip85.sh completed"
echo "$(date): Continuing processAllTasks; publishNip85.sh completed" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sleep 5

# restart the reconcile service
sudo systemctl restart reconcile.service

echo "$(date): Continuing processAllTasks; reconcile.service restarted"
echo "$(date): Continuing processAllTasks; reconcile.service restarted" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log

sleep 5

# ? turn on Stream Filtered Content if not already active

echo "$(date): Finished processAllTasks"
echo "$(date): Finished processAllTasks" >> ${BRAINSTORM_LOG_DIR}/processAllTasks.log
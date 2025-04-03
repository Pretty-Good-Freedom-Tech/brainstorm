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

CONFIG_FILE="/etc/hasenpfeffr.conf"
source "$CONFIG_FILE" # HASENPFEFFR_MODULE_MANAGE_DIR, HASENPFEFFR_LOG_DIR, HASENPFEFFR_MODULE_ALGOS_DIR, HASENPFEFFR_MODULE_PIPELINE_DIR

touch ${HASENPFEFFR_LOG_DIR}/processAllTasks.log
sudo chown hasenpfeffr:hasenpfeffr ${HASENPFEFFR_LOG_DIR}/processAllTasks.log

echo "$(date): Starting processAllTasks" >> ${HASENPFEFFR_LOG_DIR}/processAllTasks.log

sudo $HASENPFEFFR_MODULE_MANAGE_DIR/negentropySync/syncWoT.sh
echo "$(date): Continuing processAllTasks; syncWoT.sh completed"
echo "$(date): Continuing processAllTasks; syncWoT.sh completed" >> ${HASENPFEFFR_LOG_DIR}/processAllTasks.log

sleep 5

sudo $HASENPFEFFR_MODULE_MANAGE_DIR/negentropySync/syncProfiles.sh
echo "$(date): Continuing processAllTasks; syncProfiles.sh completed"
echo "$(date): Continuing processAllTasks; syncProfiles.sh completed" >> ${HASENPFEFFR_LOG_DIR}/processAllTasks.log

sleep 5

sudo $HASENPFEFFR_MODULE_MANAGE_DIR/negentropySync/syncPersonal.sh
echo "$(date): Continuing processAllTasks; syncPersonal.sh completed"
echo "$(date): Continuing processAllTasks; syncPersonal.sh completed" >> ${HASENPFEFFR_LOG_DIR}/processAllTasks.log

sleep 5

sudo $HASENPFEFFR_MODULE_MANAGE_DIR/batchTransfer/callBatchTransferIfNeeded.sh
echo "$(date): Continuing processAllTasks; callBatchTransferIfNeeded.sh completed"
echo "$(date): Continuing processAllTasks; callBatchTransferIfNeeded.sh completed" >> ${HASENPFEFFR_LOG_DIR}/processAllTasks.log

sleep 5

sudo $HASENPFEFFR_MODULE_PIPELINE_DIR/reconcile/runFullReconciliation.sh
echo "$(date): Continuing processAllTasks; runFullReconciliation.sh completed"
echo "$(date): Continuing processAllTasks; runFullReconciliation.sh completed" >> ${HASENPFEFFR_LOG_DIR}/processAllTasks.log

sleep 5

sudo $HASENPFEFFR_MODULE_ALGOS_DIR/calculateHops.sh
echo "$(date): Continuing processAllTasks; calculateHops.sh completed"
echo "$(date): Continuing processAllTasks; calculateHops.sh completed" >> ${HASENPFEFFR_LOG_DIR}/processAllTasks.log

sleep 5

sudo $HASENPFEFFR_MODULE_ALGOS_DIR/calculatePersonalizedPageRank.sh
echo "$(date): Continuing processAllTasks; calculatePersonalizedPageRank.sh completed"
echo "$(date): Continuing processAllTasks; calculatePersonalizedPageRank.sh completed" >> ${HASENPFEFFR_LOG_DIR}/processAllTasks.log

sleep 5

sudo $HASENPFEFFR_MODULE_ALGOS_DIR/personalizedGrapeRank/calculatePersonalizedGrapeRank.sh
echo "$(date): Continuing processAllTasks; calculatePersonalizedGrapeRank.sh completed"
echo "$(date): Continuing processAllTasks; calculatePersonalizedGrapeRank.sh completed" >> ${HASENPFEFFR_LOG_DIR}/processAllTasks.log

sleep 5

sudo $HASENPFEFFR_MODULE_ALGOS_DIR/personalizedBlacklist/calculatePersonalizedBlacklist.sh
echo "$(date): Continuing processAllTasks; calculatePersonalizedBlacklist.sh completed"
echo "$(date): Continuing processAllTasks; calculatePersonalizedBlacklist.sh completed" >> ${HASENPFEFFR_LOG_DIR}/processAllTasks.log

sleep 5

sudo $HASENPFEFFR_MODULE_ALGOS_DIR/exportWhitelist.sh
echo "$(date): Continuing processAllTasks; exportWhitelist.sh completed"
echo "$(date): Continuing processAllTasks; exportWhitelist.sh completed" >> ${HASENPFEFFR_LOG_DIR}/processAllTasks.log

sleep 5

sudo $HASENPFEFFR_MODULE_ALGOS_DIR/nip85/publishNip85_1.sh
echo "$(date): Continuing processAllTasks; publishNip85_1.sh completed"
echo "$(date): Continuing processAllTasks; publishNip85_1.sh completed" >> ${HASENPFEFFR_LOG_DIR}/processAllTasks.log

sleep 5

# ? turn on Stream Filtered Content if not already active

echo "$(date): Finished processAllTasks"
echo "$(date): Finished processAllTasks" >> ${HASENPFEFFR_LOG_DIR}/processAllTasks.log
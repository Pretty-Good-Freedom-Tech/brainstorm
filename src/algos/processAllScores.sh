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
source "$CONFIG_FILE" # HASENPFEFFR_MODULE_ALGOS_DIR

touch ${HASENPFEFFR_LOG_DIR}/processAllScores.log
sudo chown hasenpfeffr:hasenpfeffr ${HASENPFEFFR_LOG_DIR}/processAllScores.log

echo "$(date): Starting processAllScores" >> ${HASENPFEFFR_LOG_DIR}/processAllScores.log

# echo "HASENPFEFFR_MODULE_ALGOS_DIR: $HASENPFEFFR_MODULE_ALGOS_DIR"

# TODO:
# negentropy sync follows, mutes, and reports
# negentropy sync profiles
# negentropy sync personal
# neo4j transfer if needed (do only once? repeat infrequently? probably only once; otherwise do reconciliation)
# neo4j reconciliation

sudo $HASENPFEFFR_MODULE_MANAGE_DIR/negentropySync/syncWoT.sh
echo "$(date): Continuing processAllScores; syncWoT.sh completed" >> ${HASENPFEFFR_LOG_DIR}/processAllScores.log

sleep 5

sudo $HASENPFEFFR_MODULE_MANAGE_DIR/negentropySync/syncProfiles.sh
echo "$(date): Continuing processAllScores; syncProfiles.sh completed" >> ${HASENPFEFFR_LOG_DIR}/processAllScores.log

sleep 5

sudo $HASENPFEFFR_MODULE_MANAGE_DIR/negentropySync/syncPersonal.sh
echo "$(date): Continuing processAllScores; syncPersonal.sh completed" >> ${HASENPFEFFR_LOG_DIR}/processAllScores.log

sleep 5

sudo $HASENPFEFFR_MODULE_PIPELINE_DIR/reconcile/runFullReconciliation.sh
echo "$(date): Continuing processAllScores; runFullReconciliation.sh completed" >> ${HASENPFEFFR_LOG_DIR}/processAllScores.log

sleep 5

sudo $HASENPFEFFR_MODULE_ALGOS_DIR/calculateHops.sh
echo "$(date): Continuing processAllScores; calculateHops.sh completed" >> ${HASENPFEFFR_LOG_DIR}/processAllScores.log

sleep 5

sudo $HASENPFEFFR_MODULE_ALGOS_DIR/calculatePersonalizedPageRank.sh
echo "$(date): Continuing processAllScores; calculatePersonalizedPageRank.sh completed" >> ${HASENPFEFFR_LOG_DIR}/processAllScores.log

sleep 5

sudo $HASENPFEFFR_MODULE_ALGOS_DIR/personalizedGrapeRank/calculatePersonalizedGrapeRank.sh
echo "$(date): Continuing processAllScores; calculatePersonalizedGrapeRank.sh completed" >> ${HASENPFEFFR_LOG_DIR}/processAllScores.log

sleep 5

sudo $HASENPFEFFR_MODULE_ALGOS_DIR/exportWhitelist.sh
echo "$(date): Continuing processAllScores; exportWhitelist.sh completed" >> ${HASENPFEFFR_LOG_DIR}/processAllScores.log

sleep 5

sudo $HASENPFEFFR_MODULE_ALGOS_DIR/personalizedBlacklist/calculatePersonalizedBlacklist.sh
echo "$(date): Continuing processAllScores; calculatePersonalizedBlacklist.sh completed" >> ${HASENPFEFFR_LOG_DIR}/processAllScores.log

sleep 5

sudo $HASENPFEFFR_MODULE_ALGOS_DIR/nip85/publishNip85.sh
echo "$(date): Continuing processAllScores; publishNip85.sh completed" >> ${HASENPFEFFR_LOG_DIR}/processAllScores.log

sleep 5

# ? turn on Stream Filtered Content if not already active

echo "$(date): Finished processAllScores" >> ${HASENPFEFFR_LOG_DIR}/processAllScores.log
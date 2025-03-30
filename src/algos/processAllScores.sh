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

sudo $HASENPFEFFR_MODULE_ALGOS_DIR/publishNip85.sh
echo "$(date): Continuing processAllScores; publishNip85.sh completed" >> ${HASENPFEFFR_LOG_DIR}/processAllScores.log

sleep 5

# ? turn on Stream Filtered Content if not already active

echo "$(date): Finished processAllScores" >> ${HASENPFEFFR_LOG_DIR}/processAllScores.log
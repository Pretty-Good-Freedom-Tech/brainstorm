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
source "$CONFIG_FILE"
HASENPFEFFR_MODULE_ALGOS_DIR=$HASENPFEFFR_MODULE_ALGOS_DIR

echo "HASENPFEFFR_MODULE_ALGOS_DIR: $HASENPFEFFR_MODULE_ALGOS_DIR"

# sudo $HASENPFEFFR_MODULE_ALGOS_DIR/calculateHops.sh

sleep 5

# sudo $HASENPFEFFR_MODULE_ALGOS_DIR/calculatePersonalizedPageRank.sh

sleep 5

# sudo $HASENPFEFFR_MODULE_ALGOS_DIR/personalizedGrapeRank/calculatePersonalizedGrapeRank.sh

sleep 5

# sudo $HASENPFEFFR_MODULE_ALGOS_DIR/exportWhitelist.sh

sleep 5

# sudo $HASENPFEFFR_MODULE_ALGOS_DIR/personalizedBlacklist/calculatePersonalizedBlacklist.sh

sleep 5

# sudo $HASENPFEFFR_MODULE_ALGOS_DIR/publish_nip85.sh

sleep 5

# ? turn on Stream Filtered Content if not already active
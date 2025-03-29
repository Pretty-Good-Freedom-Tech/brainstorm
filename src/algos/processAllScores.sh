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
HASENPFEFFR_FILES_ALGOS=$HASENPFEFFR_FILES_ALGOS

echo "HASENPFEFFR_FILES_ALGOS: $HASENPFEFFR_FILES_ALGOS"

# sudo $HASENPFEFFR_FILES_ALGOS/calculateHops.sh

sleep 5

# sudo $HASENPFEFFR_FILES_ALGOS/calculatePersonalizedPageRank.sh

sleep 5

# sudo $HASENPFEFFR_FILES_ALGOS/personalizedGrapeRank/calculatePersonalizedGrapeRank.sh

sleep 5

# sudo $HASENPFEFFR_FILES_ALGOS/exportWhitelist.sh

sleep 5

# sudo $HASENPFEFFR_FILES_ALGOS/personalizedBlacklist/calculatePersonalizedBlacklist.sh

sleep 5

# sudo $HASENPFEFFR_FILES_ALGOS/publish_nip85.sh

sleep 5

# ? turn on Stream Filtered Content if not already active
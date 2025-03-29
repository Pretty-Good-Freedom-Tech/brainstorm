#!/bin/bash

CONFIG_FILE="/etc/hasenpfeffr.conf"
source "$CONFIG_FILE"
HASENPFEFFR_FILES_SRC=$HASENPFEFFR_FILES_SRC

echo "HASENPFEFFR_FILES_SRC: $HASENPFEFFR_FILES_SRC"

# sudo $HASENPFEFFR_FILES_SRC/algos/calculateHops.sh

sleep 10

# sudo /usr/local/lib/node_modules/hasenpfeffr/src/algos/calculatePersonalizedPageRank.sh

sleep 10

# sudo /usr/local/lib/node_modules/hasenpfeffr/src/algos/personalizedGrapeRank/calculatePersonalizedGrapeRank.sh

sleep 10

# sudo /usr/local/lib/node_modules/hasenpfeffr/src/algos/exportWhitelist.sh

sleep 10

# sudo /usr/local/lib/node_modules/hasenpfeffr/src/algos/publish_nip85.sh
#!/bin/bash

# Perform all of the following steps:

# calculateHops.sh
# calculatePersonalizedPageRank.sh
# calculatePersonalizedGrapeRank.sh (forthcoming)
# exportWhitelist.sh
# exportNip85.sh (forthcoming)

sudo /usr/local/lib/node_modules/hasenpfeffr/src/algos/calculateHops.sh

sudo /usr/local/lib/node_modules/hasenpfeffr/src/algos/calculatePersonalizedPageRank.sh

sudo /usr/local/lib/node_modules/hasenpfeffr/src/algos/personalizedGrapeRank/calculatePersonalizedGrapeRank.sh

sudo /usr/local/lib/node_modules/hasenpfeffr/src/algos/exportWhitelist.sh

# forthcoming:
# sudo /usr/local/lib/node_modules/hasenpfeffr/src/algos/exportNip85.sh
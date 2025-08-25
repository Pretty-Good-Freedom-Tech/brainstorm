#!/bin/bash

# Precompute whitelist for search maps
# This achieves the same result as this api endpoint:
# /api/search/profiles/keyword/precompute-whitelist-maps?force=true
# But we will do it by running the javascript handler directly
# handler: handlePrecomputeWhitelistMaps
# argument: force=true
# which can be found at: 
# BRAINSTORM_MODULE_BASE_DIR/src/api/search/profiles/whitelistPrecompute.js

CONFIG_FILE="/etc/brainstorm.conf"
source "$CONFIG_FILE"

# Source structured logging utilities
source "$BRAINSTORM_MODULE_BASE_DIR/src/utils/structuredLogging.sh"

touch ${BRAINSTORM_LOG_DIR}/precomputeWhitelistMaps.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/precomputeWhitelistMaps.log

echo "$(date): Starting precomputeWhitelistMaps"
echo "$(date): Starting precomputeWhitelistMaps" >> ${BRAINSTORM_LOG_DIR}/precomputeWhitelistMaps.log

# execute handlePrecomputeWhitelistMaps
node ./precomputeWhitelistMaps.js

echo "$(date): Finished precomputeWhitelistMaps"
echo "$(date): Finished precomputeWhitelistMaps" >> ${BRAINSTORM_LOG_DIR}/precomputeWhitelistMaps.log


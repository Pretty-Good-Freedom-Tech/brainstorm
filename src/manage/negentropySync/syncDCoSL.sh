#!/bin/bash

source /etc/brainstorm.conf # BRAINSTORM_OWNER_PUBKEY

# Log start

touch ${BRAINSTORM_LOG_DIR}/syncDCoSL.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/syncDCoSL.log

# Log start

echo "$(date): Starting syncDCoSL for ${BRAINSTORM_OWNER_PUBKEY}" 
echo "$(date): Starting syncDCoSL for ${BRAINSTORM_OWNER_PUBKEY}" >> ${BRAINSTORM_LOG_DIR}/syncDCoSL.log

# Create filter with proper variable substitution
FILTER="{\"authors\": [\"${BRAINSTORM_OWNER_PUBKEY}\"]}"

# Run strfry with the filter
sudo strfry sync wss://dcosl.brainstorm.world --filter "$FILTER" --dir down

# Log end

echo "$(date): Finished syncDCoSL for ${BRAINSTORM_OWNER_PUBKEY}" 
echo "$(date): Finished syncDCoSL for ${BRAINSTORM_OWNER_PUBKEY}" >> ${BRAINSTORM_LOG_DIR}/syncDCoSL.log

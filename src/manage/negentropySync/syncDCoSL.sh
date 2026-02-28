#!/bin/bash

source /etc/brainstorm.conf # BRAINSTORM_OWNER_PUBKEY

# Log start

touch ${BRAINSTORM_LOG_DIR}/syncDCoSL.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/syncDCoSL.log

# Log start

echo "$(date): Starting syncDCoSL for ${BRAINSTORM_OWNER_PUBKEY}" 
echo "$(date): Starting syncDCoSL for ${BRAINSTORM_OWNER_PUBKEY}" >> ${BRAINSTORM_LOG_DIR}/syncDCoSL.log

# Create filter with proper variable substitution
FILTER1="{\"kinds\": [9998, 9999, 39998, 39999, 7]}"
FILTER2="{\"kinds\": [9998, 9999, 39998, 39999]}"

# Run strfry with the filter
sudo strfry sync wss://dcosl.brainstorm.world --filter "$FILTER1" --dir both

sudo strfry sync wss://relay.damus.io --filter "$FILTER2" --dir down

# Log end

echo "$(date): Finished syncDCoSL for ${BRAINSTORM_OWNER_PUBKEY}" 
echo "$(date): Finished syncDCoSL for ${BRAINSTORM_OWNER_PUBKEY}" >> ${BRAINSTORM_LOG_DIR}/syncDCoSL.log

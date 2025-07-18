#!/bin/bash

source /etc/brainstorm.conf # BRAINSTORM_OWNER_PUBKEY

# Log start

touch ${BRAINSTORM_LOG_DIR}/syncPersonal.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/syncPersonal.log

# Log start

echo "$(date): Starting syncPersonal for ${BRAINSTORM_OWNER_PUBKEY}" 
echo "$(date): Starting syncPersonal for ${BRAINSTORM_OWNER_PUBKEY}" >> ${BRAINSTORM_LOG_DIR}/syncPersonal.log

# Create filter with proper variable substitution
FILTER="{\"authors\": [\"${BRAINSTORM_OWNER_PUBKEY}\"]}"

# Run strfry with the filter
sudo strfry sync wss://relay.primal.net --filter "$FILTER" --dir down

# Log end

echo "$(date): Finished syncPersonal for ${BRAINSTORM_OWNER_PUBKEY}" 
echo "$(date): Finished syncPersonal for ${BRAINSTORM_OWNER_PUBKEY}" >> ${BRAINSTORM_LOG_DIR}/syncPersonal.log

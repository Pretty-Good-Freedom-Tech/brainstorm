#!/bin/bash

source /etc/hasenpfeffr.conf

touch ${HASENPFEFFR_LOG_DIR}/syncProfiles.log
sudo chown hasenpfeffr:hasenpfeffr ${HASENPFEFFR_LOG_DIR}/syncProfiles.log

# Log start

echo "$(date): Starting syncProfiles" >> ${HASENPFEFFR_LOG_DIR}/syncProfiles.log

sudo strfry sync wss://profiles.nostr1.com --filter '{"kinds":[0]}' --dir down

# Log end

echo "$(date): Finished syncProfiles" >> ${HASENPFEFFR_LOG_DIR}/syncProfiles.log



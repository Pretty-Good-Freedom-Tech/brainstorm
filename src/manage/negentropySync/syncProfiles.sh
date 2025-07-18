#!/bin/bash

source /etc/brainstorm.conf

touch ${BRAINSTORM_LOG_DIR}/syncProfiles.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/syncProfiles.log

echo "$(date): Starting syncProfiles"
echo "$(date): Starting syncProfiles" >> ${BRAINSTORM_LOG_DIR}/syncProfiles.log

sudo strfry sync wss://profiles.nostr1.com --filter '{"kinds":[0]}' --dir down

echo "$(date): Finished syncProfiles"
echo "$(date): Finished syncProfiles" >> ${BRAINSTORM_LOG_DIR}/syncProfiles.log



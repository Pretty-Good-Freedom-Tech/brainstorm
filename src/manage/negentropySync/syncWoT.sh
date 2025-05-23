#!/bin/bash

source /etc/brainstorm.conf

touch ${BRAINSTORM_LOG_DIR}/syncWoT.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/syncWoT.log

# Log start

echo "$(date): Starting syncWoT" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log

sudo strfry sync wss://relay.hasenpfeffr.com --filter '{"kinds":[3, 1984, 10000, 30000, 38000, 38172, 38173]}' --dir down

# Log end

echo "$(date): Finished syncWoT" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log

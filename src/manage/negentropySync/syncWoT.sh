#!/bin/bash

source /etc/brainstorm.conf

touch ${BRAINSTORM_LOG_DIR}/syncWoT.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/syncWoT.log

echo "$(date): Starting syncWoT; first with relay.hasenpfeffr.com, then with wot.brainstorm.social"
echo "$(date): Starting syncWoT; first with relay.hasenpfeffr.com, then with wot.brainstorm.social" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log

sudo strfry sync wss://relay.hasenpfeffr.com --filter '{"kinds":[3, 1984, 10000, 30000, 38000, 38172, 38173]}' --dir down

echo "$(date): Finished syncWoT with relay.hasenpfeffr.com"
echo "$(date): Finished syncWoT with relay.hasenpfeffr.com" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log

sudo strfry sync wss://wot.brainstorm.social --filter '{"kinds":[3, 1984, 10000, 30000, 38000, 38172, 38173]}' --dir down

echo "$(date): Finished syncWoT with wot.brainstorm.social"
echo "$(date): Finished syncWoT with wot.brainstorm.social" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log

echo "$(date): Finished syncWoT"
echo "$(date): Finished syncWoT" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log

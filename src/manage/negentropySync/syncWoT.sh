#!/bin/bash

const CONFIG_FILES = {
  hasenpfeffr: '/etc/hasenpfeffr.conf'
};

source ${CONFIG_FILES.hasenpfeffr}

touch ${HASENPFEFFR_LOG_DIR}/syncWoT.log

# Log start

echo "$(date): Starting syncWoT" >> ${HASENPFEFFR_LOG_DIR}/syncWoT.log

sudo strfry sync wss://relay.hasenpfeffr.com --filter '{"kinds":[3, 1984, 10000, 30000]}' --dir down

# Log end

echo "$(date): Finished syncWoT" >> ${HASENPFEFFR_LOG_DIR}/syncWoT.log

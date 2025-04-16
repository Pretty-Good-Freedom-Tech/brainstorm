#!/bin/bash

source /etc/brainstorm.conf

# Log start

touch ${BRAINSTORM_LOG_DIR}/syncPersonal.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/syncPersonal.log

# Log start

echo "$(date): Starting syncPersonal" >> ${BRAINSTORM_LOG_DIR}/syncPersonal.log

sudo strfry sync wss://relay.primal.net --filter '{"authors": ["${BRAINSTORM_OWNER_PUBKEY}"]}' --dir down

# Log end

echo "$(date): Finished syncPersonal" >> ${BRAINSTORM_LOG_DIR}/syncPersonal.log

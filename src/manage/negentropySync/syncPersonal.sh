#!/bin/bash

source /etc/hasenpfeffr.conf

# Log start

touch ${HASENPFEFFR_LOG_DIR}/syncPersonal.log

# Log start

echo "$(date): Starting syncPersonal" >> ${HASENPFEFFR_LOG_DIR}/syncPersonal.log

sudo strfry sync wss://relay.primal.net --filter '{"authors": ["${HASENPFEFFR_OWNER_PUBKEY}"]}' --dir down

# Log end

echo "$(date): Finished syncPersonal" >> ${HASENPFEFFR_LOG_DIR}/syncPersonal.log

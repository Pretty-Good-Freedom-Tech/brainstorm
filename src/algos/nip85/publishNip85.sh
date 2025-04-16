#!/bin/bash

# Script to publish Web of Trust scores to the Nostr network as kind 30382 events
# following the Trusted Assertions protocol (NIP-85)

# Source the configuration file
source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR, BRAINSTORM_NIP85_DIR, BRAINSTORM_RELAY_URL, BRAINSTORM_DEFAULT_FRIEND_RELAYS

touch ${BRAINSTORM_LOG_DIR}/publishNip85.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/publishNip85.log

echo "$(date): Starting publishNip85"
echo "$(date): Starting publishNip85" >> ${BRAINSTORM_LOG_DIR}/publishNip85.log

# Check if the NIP85 directory exists
if [ ! -d "${BRAINSTORM_NIP85_DIR}" ]; then
    echo "Error: NIP85 directory not found at ${BRAINSTORM_NIP85_DIR}"
    echo "$(date): Error: NIP85 directory not found at ${BRAINSTORM_NIP85_DIR}" >> ${BRAINSTORM_LOG_DIR}/publishNip85.log
    exit 1
fi

# Make sure the scripts are executable
chmod +x ${BRAINSTORM_NIP85_DIR}/publish_kind30382.js

echo "$(date): Continuing publishNip85 ... calling script to publish kind 30382 events"
echo "$(date): Continuing publishNip85 ... calling script to publish kind 30382 events" >> ${BRAINSTORM_LOG_DIR}/publishNip85.log

# Publish all kind 30382 events to BRAINSTORM_RELAY_URL
# The script will publish events only for NostrUsers whose hops parameter is not null and is less than 20
node ${BRAINSTORM_NIP85_DIR}/publish_kind30382.js
RESULT_30382=$?

if [ $RESULT_30382 -ne 0 ]; then
    echo "Error: Failed to publish kind 30382 events"
    echo "$(date): Error: Failed to publish kind 30382 events" >> ${BRAINSTORM_LOG_DIR}/publishNip85.log
    exit 1
fi

echo "$(date): Finished publishNip85"
echo "$(date): Finished publishNip85" >> ${BRAINSTORM_LOG_DIR}/publishNip85.log

exit 0
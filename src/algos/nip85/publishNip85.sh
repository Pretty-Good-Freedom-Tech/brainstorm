#!/bin/bash

# Script to publish nip85.json data to the Nostr network as kind 30382 events
# following the Trusted Assertions protocol (NIP-85)

# Source the configuration file
source /etc/hasenpfeffr.conf # HASENPFEFFR_LOG_DIR, HASENPFEFFR_NIP85_DIR, HASENPFEFFR_RELAY_URL, HASENPFEFFR_DEFAULT_FRIEND_RELAYS

touch ${HASENPFEFFR_LOG_DIR}/publishNip85.log
sudo chown hasenpfeffr:hasenpfeffr ${HASENPFEFFR_LOG_DIR}/publishNip85.log

echo "$(date): Starting publishNip85"
echo "$(date): Starting publishNip85" >> ${HASENPFEFFR_LOG_DIR}/publishNip85.log

# Check if the NIP85 directory exists
if [ ! -d "${HASENPFEFFR_NIP85_DIR}" ]; then
    echo "Error: NIP85 directory not found at ${HASENPFEFFR_NIP85_DIR}"
    echo "$(date): Error: NIP85 directory not found at ${HASENPFEFFR_NIP85_DIR}" >> ${HASENPFEFFR_LOG_DIR}/publishNip85.log
    exit 1
fi

# Make sure the scripts are executable
chmod +x ${HASENPFEFFR_NIP85_DIR}/publish_kind10040.js
chmod +x ${HASENPFEFFR_NIP85_DIR}/publish_kind30382.js

echo "$(date): Continuing publishNip85 ... calling script to publish kind 10040 events"
echo "$(date): Continuing publishNip85 ... calling script to publish kind 10040 events" >> ${HASENPFEFFR_LOG_DIR}/publishNip85.log

# Publish the kind 10040 event to all friend relays
node ${HASENPFEFFR_NIP85_DIR}/publish_kind10040.js
RESULT_10040=$?

if [ $RESULT_10040 -ne 0 ]; then
    echo "Warning: Failed to publish kind 10040 event. Continuing with kind 30382 events..."
    echo "$(date): Warning: Failed to publish kind 10040 event. Continuing with kind 30382 events..." >> ${HASENPFEFFR_LOG_DIR}/publishNip85.log
fi

echo "$(date): Continuing publishNip85 ... calling script to publish kind 30382 events"
echo "$(date): Continuing publishNip85 ... calling script to publish kind 30382 events" >> ${HASENPFEFFR_LOG_DIR}/publishNip85.log

# Publish all kind 30382 events to HASENPFEFFR_RELAY_URL
# The script will publish events only for NostrUsers whose hops parameter is not null and is less than 20

# temporarily disabled
# node ${HASENPFEFFR_NIP85_DIR}/publish_kind30382.js
# RESULT_30382=$?

if [ $RESULT_30382 -ne 0 ]; then
    echo "Error: Failed to publish kind 30382 events"
    echo "$(date): Error: Failed to publish kind 30382 events" >> ${HASENPFEFFR_LOG_DIR}/publishNip85.log
    exit 1
fi

echo "$(date): Finished publishNip85"
echo "$(date): Finished publishNip85" >> ${HASENPFEFFR_LOG_DIR}/publishNip85.log

exit 0
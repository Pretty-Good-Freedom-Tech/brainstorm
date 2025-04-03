#!/bin/bash

# Script to publish nip85.json data to the Nostr network as kind 30382 events
# following the Trusted Assertions protocol (NIP-85)

# Source the configuration file
source /etc/hasenpfeffr.conf # HASENPFEFFR_LOG_DIR, HASENPFEFFR_MODULE_ALGOS_DIR, HASENPFEFFR_RELAY_URL

touch ${HASENPFEFFR_LOG_DIR}/publishNip85.log
sudo chown hasenpfeffr:hasenpfeffr ${HASENPFEFFR_LOG_DIR}/publishNip85.log

echo "$(date): Starting publishNip85"
echo "$(date): Starting publishNip85" >> ${HASENPFEFFR_LOG_DIR}/publishNip85.log  

set -e  # Exit on error

# Directory setup
cd "$HASENPFEFFR_MODULE_ALGOS_DIR"

# Check if HASENPFEFFR_RELAY_URL is set
if [ -z "$HASENPFEFFR_RELAY_URL" ]; then
    echo "Error: HASENPFEFFR_RELAY_URL is not set in /etc/hasenpfeffr.conf"
    exit 1
fi

echo "Will publish to relay: $HASENPFEFFR_RELAY_URL"

# Install required Node.js dependencies if not already installed
if [ ! -f "package.json" ]; then
    echo "Initializing npm project..."
    echo '{"name":"hasenpfeffr-nip85","version":"1.0.0","private":true}' > package.json
fi

echo "Checking for required dependencies..."
if ! npm list | grep -q "neo4j-driver"; then
    echo "Installing neo4j-driver..."
    npm install --save neo4j-driver
fi

if ! npm list | grep -q "nostr-tools"; then
    echo "Installing nostr-tools..."
    npm install --save nostr-tools@^2.10.4
fi

if ! npm list | grep -q "websocket"; then
    echo "Installing websocket..."
    npm install --save websocket
fi

# Check if nip85.json exists
if [ ! -f "$HASENPFEFFR_MODULE_ALGOS_DIR/nip85.json" ]; then
    echo "Error: nip85.json not found. Please run generateNip85.sh first."
    echo "Error: nip85.json not found. Please run generateNip85.sh first." >> ${HASENPFEFFR_LOG_DIR}/publishNip85.log
    exit 1
fi

# TODO: call script to publish kind 10040 event

# ??? TODO: call script to create nip85.json ??? run generateNip85.sh ???

echo "$(date): Continuing publishNip85 ... calling publish_nip85_30382.js"
echo "$(date): Continuing publishNip85 ... calling publish_nip85_30382.js" >> ${HASENPFEFFR_LOG_DIR}/publishNip85.log

# Run the JavaScript script with Node.js garbage collection enabled for large datasets
node --expose-gc --max-old-space-size=4096 "$HASENPFEFFR_MODULE_ALGOS_DIR/nip85/publish_nip85_30382.js"

echo "$(date): Finished publishNip85"
echo "$(date): Finished publishNip85" >> ${HASENPFEFFR_LOG_DIR}/publishNip85.log
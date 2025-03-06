#!/bin/bash

# Script to publish nip85.json data to the Nostr network as kind 30382 events
# following the Trusted Assertions protocol (NIP-85)

# Source the configuration file
source /etc/hasenpfeffr.conf

# Directory setup
SCRIPT_DIR="/home/ubuntu/hasenpfeffr/algos"
cd "$SCRIPT_DIR"

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
if [ ! -f "$SCRIPT_DIR/nip85.json" ]; then
    echo "Error: nip85.json not found. Please run generateNip85.sh first."
    exit 1
fi

# Run the JavaScript script with Node.js garbage collection enabled for large datasets
echo "Publishing nip85.json data to Nostr network as kind 30382 events..."
node --expose-gc --max-old-space-size=4096 "$SCRIPT_DIR/publish_nip85.js"

echo "nip85.json publishing complete!"

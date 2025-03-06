#!/bin/bash

# Script to publish a "hello world!" kind 1 event using the hasenpfeffr relay identity

# Source the configuration file
source /etc/hasenpfeffr.conf

# Check if keys file exists and load it
KEYS_FILE="/home/ubuntu/hasenpfeffr/nostr/keys/hasenpfeffr_relay_keys"
if [ -f "$KEYS_FILE" ]; then
    # Read the JSON keys file
    if ! command -v jq &> /dev/null; then
        echo "jq is required but not installed. Installing..."
        sudo apt-get update
        sudo apt-get install -y jq
    fi
    
    HASENPFEFFR_RELAY_NSEC=$(jq -r '.nsec' "$KEYS_FILE")
    HASENPFEFFR_RELAY_NSEC_ENCODED=$(jq -r '.nsecEncoded' "$KEYS_FILE")
    HASENPFEFFR_RELAY_PUBKEY=$(jq -r '.pubkey' "$KEYS_FILE")
    HASENPFEFFR_RELAY_NPUB=$(jq -r '.npub' "$KEYS_FILE")
else
    # Try the backward compatibility file
    KEYS_SH_FILE="/home/ubuntu/hasenpfeffr/nostr/keys/hasenpfeffr_relay_keys.sh"
    if [ -f "$KEYS_SH_FILE" ]; then
        source "$KEYS_SH_FILE"
    else
        echo "Error: Nostr identity keys not found. Please run create_nostr_identity.sh first."
        exit 1
    fi
fi

# Check if required variables are set
if [ -z "$HASENPFEFFR_RELAY_NSEC" ] || [ -z "$HASENPFEFFR_RELAY_PUBKEY" ]; then
    echo "Error: Required Nostr identity variables not found."
    exit 1
fi

# Define relays to publish to
# If HASENPFEFFR_PUBLISH_RELAYS is not set in config, create a default list
if [ -z "$HASENPFEFFR_PUBLISH_RELAYS" ]; then
    # Include our local relay if defined
    RELAY_LIST="["
    if [ -n "$HASENPFEFFR_RELAY_URL" ]; then
        RELAY_LIST+="\"$HASENPFEFFR_RELAY_URL\""
    fi
    
    # Add public relays
    PUBLIC_RELAYS=("wss://relay.damus.io" "wss://relay.primal.net" "wss://relay.nostr.band")
    for relay in "${PUBLIC_RELAYS[@]}"; do
        if [ "$RELAY_LIST" != "[" ]; then
            RELAY_LIST+=", "
        fi
        RELAY_LIST+="\"$relay\""
    done
    
    RELAY_LIST+="]"
    HASENPFEFFR_PUBLISH_RELAYS="$RELAY_LIST"
fi

# Path to the Node.js project directory
NOSTR_PROJECT_DIR="/home/ubuntu/hasenpfeffr/nostr/node_project"

# Check if the project directory exists
if [ ! -d "$NOSTR_PROJECT_DIR" ]; then
    echo "Error: Node.js project directory not found. Please run create_nostr_identity.sh first."
    exit 1
fi

# Install required dependencies if not already installed
cd "$NOSTR_PROJECT_DIR"
if ! npm list | grep -q "nostr-tools"; then
    echo "Installing required dependencies..."
    npm install nostr-tools ws
fi

# Create a temporary JavaScript file to publish the event
TMP_JS_FILE="$NOSTR_PROJECT_DIR/publish_event.mjs"

cat > "$TMP_JS_FILE" << 'EOF'
#!/usr/bin/node

import * as NostrTools from "nostr-tools";
import WebSocket from 'ws';

// Define the content for our hello world message
const content = "Hello world from hasenpfeffr relay! This is our first Nostr event published to multiple relays.";

// Parse relay URLs from string to array
const relayUrls = RELAY_URLS_PLACEHOLDER;
console.log('Publishing to relays:', relayUrls);

// Use the HASENPFEFFR relay private key (convert from hex to Uint8Array)
const privKeyHex = 'PRIV_KEY_PLACEHOLDER';
const privKey = new Uint8Array(Buffer.from(privKeyHex, 'hex'));

// Get the public key in hex format
const pubKey = NostrTools.getPublicKey(privKey);

// Verify that the public key matches what we expect
const expectedPubKey = 'PUB_KEY_PLACEHOLDER';
if (pubKey !== expectedPubKey) {
    console.warn('Warning: Generated public key does not match expected public key');
    console.log('Generated:', pubKey);
    console.log('Expected:', expectedPubKey);
}

// Display private and public keys in Bech32 (nsec/npub) format
console.log("Using Nostr identity:");
console.log("Public Key (hex):", pubKey);
console.log("Public Key (npub):", NostrTools.nip19.npubEncode(pubKey));

// Create a new Nostr event
let NostrEvent = {
  kind: 1, // Kind 1 is a text note
  pubkey: pubKey,
  created_at: Math.floor(Date.now() / 1000), // Unix timestamp in seconds
  tags: [], // Empty tags array
  content, // Our hello world message
};

// Sign the event with the private key
NostrEvent.id = NostrTools.getEventHash(NostrEvent);
NostrEvent = await NostrTools.finalizeEvent(NostrEvent, privKey);

// Log the signed event
console.log("Signed event:", NostrEvent);

// Track successful publications
let successCount = 0;
const totalRelays = relayUrls.length;

// Function to close all sockets after a timeout
const sockets = [];
const closeAllSockets = () => {
  console.log("Closing all connections...");
  sockets.forEach(socket => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
  });
  console.log(`Successfully published to ${successCount} out of ${totalRelays} relays.`);
};

// Set a timeout to close all connections after 10 seconds
setTimeout(closeAllSockets, 10000);

// Connect to each relay and publish the event
relayUrls.forEach((url) => {
  try {
    const socket = new WebSocket(url);
    sockets.push(socket);

    socket.onopen = () => {
      console.log(`Connected to ${url}`);

      // Send the signed event to the relay in JSON format
      socket.send(JSON.stringify(["EVENT", NostrEvent]));
    };

    socket.onmessage = (message) => {
      console.log(`Message from ${url}:`, message.data);
      
      // Check if the message indicates successful publication
      if (message.data.includes("OK")) {
        console.log(`✅ Successfully published to ${url}`);
        successCount++;
      }
    };

    socket.onerror = (error) => {
      console.log(`❌ Error with ${url}:`, error.message);
    };

    socket.onclose = () => {
      console.log(`Disconnected from ${url}`);
    };
  } catch (error) {
    console.error(`Failed to connect to ${url}:`, error.message);
  }
});
EOF

# Replace placeholders with actual values
sed -i "s|RELAY_URLS_PLACEHOLDER|$HASENPFEFFR_PUBLISH_RELAYS|g" "$TMP_JS_FILE"
sed -i "s|PRIV_KEY_PLACEHOLDER|$HASENPFEFFR_RELAY_NSEC|g" "$TMP_JS_FILE"
sed -i "s|PUB_KEY_PLACEHOLDER|$HASENPFEFFR_RELAY_PUBKEY|g" "$TMP_JS_FILE"

# Run the JavaScript file with Node.js
echo "Publishing 'Hello world!' event to multiple relays..."
cd "$NOSTR_PROJECT_DIR"
node "$TMP_JS_FILE"

# Clean up (optional - keeping the file might be useful for debugging)
# rm "$TMP_JS_FILE"

echo "Event publishing complete!"

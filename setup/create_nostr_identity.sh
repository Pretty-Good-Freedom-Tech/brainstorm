#!/bin/bash

# Script to create a new Nostr identity for the brainstorm relay
# This script generates NSEC, PUBKEY, and NPUB and stores them securely

# Check if nodejs and npm are installed
if ! command -v node &> /dev/null; then
    echo "Node.js is required but not installed. Installing..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Check if jq is installed (needed for JSON processing)
if ! command -v jq &> /dev/null; then
    echo "jq is required but not installed. Installing..."
    sudo apt-get update
    sudo apt-get install -y jq
fi

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# Create directory for storing keys if it doesn't exist
KEYS_DIR="${SCRIPT_DIR}/nostr/keys"
mkdir -p "$KEYS_DIR"

# Create a project directory for Node.js dependencies
NOSTR_PROJECT_DIR="${SCRIPT_DIR}/nostr/node_project"
mkdir -p "$NOSTR_PROJECT_DIR"

# Initialize npm project and install required packages
cd "$NOSTR_PROJECT_DIR"
if [ ! -f "package.json" ]; then
    echo "Initializing npm project..."
    echo '{"name":"brainstorm-nostr","version":"1.0.0","private":true}' > package.json
fi

echo "Installing nostr-tools locally..."
npm install --save nostr-tools

# Generate Nostr keys using Node.js
echo "Generating new Nostr identity..."
KEYS_JSON=$(node -e "
const nostrTools = require('nostr-tools');
const privateKey = nostrTools.generateSecretKey();
const pubkey = nostrTools.getPublicKey(privateKey);
const npub = nostrTools.nip19.npubEncode(pubkey);
const nsecEncoded = nostrTools.nip19.nsecEncode(privateKey);

// Convert hex to string for storage
const privateKeyHex = Buffer.from(privateKey).toString('hex');

console.log(JSON.stringify({
  privkey: privateKeyHex,
  nsec: nsecEncoded,
  pubkey: pubkey,
  npub: npub
}));
")

# Extract keys from JSON
BRAINSTORM_RELAY_PRIVKEY=$(echo $KEYS_JSON | jq -r '.privkey')
BRAINSTORM_RELAY_NSEC=$(echo $KEYS_JSON | jq -r '.nsec')
BRAINSTORM_RELAY_PUBKEY=$(echo $KEYS_JSON | jq -r '.pubkey')
BRAINSTORM_RELAY_NPUB=$(echo $KEYS_JSON | jq -r '.npub')

# Create a secure file for the keys in JSON format with restricted permissions
echo "Storing keys securely in JSON format..."
KEYS_FILE="$KEYS_DIR/brainstorm_relay_keys"
echo "$KEYS_JSON" > "$KEYS_FILE"

# Set secure permissions (only owner can read/write)
chmod 600 "$KEYS_FILE"

# Also create a shell-compatible file for backward compatibility
KEYS_SH_FILE="$KEYS_DIR/brainstorm_relay_keys.sh"
echo "BRAINSTORM_RELAY_PRIVKEY='$BRAINSTORM_RELAY_PRIVKEY'" > "$KEYS_SH_FILE"
echo "BRAINSTORM_RELAY_NSEC='$BRAINSTORM_RELAY_NSEC'" >> "$KEYS_SH_FILE"
echo "BRAINSTORM_RELAY_PUBKEY='$BRAINSTORM_RELAY_PUBKEY'" >> "$KEYS_SH_FILE"
echo "BRAINSTORM_RELAY_NPUB='$BRAINSTORM_RELAY_NPUB'" >> "$KEYS_SH_FILE"
chmod 600 "$KEYS_SH_FILE"

# Add public keys to the main configuration file
if [ -f "/etc/brainstorm.conf" ]; then
    echo "Adding public keys to /etc/brainstorm.conf..."
    # Check if keys already exist in the config
    if grep -q "BRAINSTORM_RELAY_PUBKEY" /etc/brainstorm.conf; then
        echo "Keys already exist in config. Updating..."
        sudo sed -i "/BRAINSTORM_RELAY_PUBKEY/c\export BRAINSTORM_RELAY_PUBKEY='$BRAINSTORM_RELAY_PUBKEY'" /etc/brainstorm.conf
        sudo sed -i "/BRAINSTORM_RELAY_NPUB/c\export BRAINSTORM_RELAY_NPUB='$BRAINSTORM_RELAY_NPUB'" /etc/brainstorm.conf
        sudo sed -i "/BRAINSTORM_RELAY_PRIVKEY/c\export BRAINSTORM_RELAY_PRIVKEY='$BRAINSTORM_RELAY_PRIVKEY'" /etc/brainstorm.conf
        sudo sed -i "/BRAINSTORM_RELAY_NSEC/c\export BRAINSTORM_RELAY_NSEC='$BRAINSTORM_RELAY_NSEC'" /etc/brainstorm.conf
    else
        echo "Adding new keys to config..."
        echo "export BRAINSTORM_RELAY_PUBKEY='$BRAINSTORM_RELAY_PUBKEY'" | sudo tee -a /etc/brainstorm.conf
        echo "export BRAINSTORM_RELAY_NPUB='$BRAINSTORM_RELAY_NPUB'" | sudo tee -a /etc/brainstorm.conf
        echo "export BRAINSTORM_RELAY_PRIVKEY='$BRAINSTORM_RELAY_PRIVKEY'" | sudo tee -a /etc/brainstorm.conf
        echo "export BRAINSTORM_RELAY_NSEC='$BRAINSTORM_RELAY_NSEC'" | sudo tee -a /etc/brainstorm.conf
        echo "# keys added by create_nostr_identity.sh" | sudo tee -a /etc/brainstorm.conf
    fi
else
    echo "Warning: /etc/brainstorm.conf not found. Only storing keys in $KEYS_FILE."
fi

echo "Nostr identity created successfully!"
echo "PUBKEY: $BRAINSTORM_RELAY_PUBKEY"
echo "NPUB: $BRAINSTORM_RELAY_NPUB"
echo "Keys stored securely in JSON format in $KEYS_FILE"
echo "Shell-compatible keys also stored in $KEYS_SH_FILE for backward compatibility"
echo "Keys have also been added to /etc/brainstorm.conf (if it exists)"

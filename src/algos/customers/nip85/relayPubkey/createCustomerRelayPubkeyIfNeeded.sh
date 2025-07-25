#!/bin/bash

# Script to create a new Nostr identity for an individual customer
# This identity is stored in brainstorm.conf and used to sign kind 30382 events (NIP-85)
# First check to see if one already exists in brainstorm.conf; if so, then do nothing.

# Source the configuration file
source /etc/brainstorm.conf

# Check if customer_pubkey, customer_id, customer_name are provided
if [ -z "$1" ] || [ -z "$2" ] || [ -z "$3" ]; then
    echo "Usage: $0 <customer_pubkey> <customer_id> <customer_name>"
    exit 1
fi

# Get customer_pubkey
CUSTOMER_PUBKEY="$1"

# Get customer_id
CUSTOMER_ID="$2"

# Get customer_name
CUSTOMER_NAME="$3"

# generate names of environment variables
PRIVKEY_VAR_NAME="CUSTOMER_${CUSTOMER_PUBKEY}_RELAY_PRIVKEY"
NSEC_VAR_NAME="CUSTOMER_${CUSTOMER_PUBKEY}_RELAY_NSEC"
PUBKEY_VAR_NAME="CUSTOMER_${CUSTOMER_PUBKEY}_RELAY_PUBKEY"
NPUB_VAR_NAME="CUSTOMER_${CUSTOMER_PUBKEY}_RELAY_NPUB"

# Add public keys to the main configuration file
if [ -f "/etc/brainstorm.conf" ]; then
    echo "Adding public keys to /etc/brainstorm.conf..."
    # Check if keys already exist in the config
    if grep -q "${PUBKEY_VAR_NAME}" /etc/brainstorm.conf; then
        echo "Keys already exist in config."
    else
        echo "Adding new keys to config..."
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
        CUSTOMER_RELAY_PRIVKEY=$(echo $KEYS_JSON | jq -r '.privkey')
        CUSTOMER_RELAY_NSEC=$(echo $KEYS_JSON | jq -r '.nsec')
        CUSTOMER_RELAY_PUBKEY=$(echo $KEYS_JSON | jq -r '.pubkey')
        CUSTOMER_RELAY_NPUB=$(echo $KEYS_JSON | jq -r '.npub')
        echo "" | sudo tee -a /etc/brainstorm.conf
        echo "#################### CUSTOMER id: $CUSTOMER_ID ####################" | sudo tee -a /etc/brainstorm.conf
        echo "# PUBKEY: $CUSTOMER_PUBKEY" | sudo tee -a /etc/brainstorm.conf
        echo "# NAME: $CUSTOMER_NAME" | sudo tee -a /etc/brainstorm.conf
        echo "export ${PUBKEY_VAR_NAME}='$CUSTOMER_RELAY_PUBKEY'" | sudo tee -a /etc/brainstorm.conf
        echo "export ${NPUB_VAR_NAME}='$CUSTOMER_RELAY_NPUB'" | sudo tee -a /etc/brainstorm.conf
        echo "export ${PRIVKEY_VAR_NAME}='$CUSTOMER_RELAY_PRIVKEY'" | sudo tee -a /etc/brainstorm.conf
        echo "export ${NSEC_VAR_NAME}='$CUSTOMER_RELAY_NSEC'" | sudo tee -a /etc/brainstorm.conf
        echo "# keys added by createCustomerRelayPubkeyIfNeeded.sh" | sudo tee -a /etc/brainstorm.conf
        echo "#############################################################" | sudo tee -a /etc/brainstorm.conf
        echo "Nostr identity created successfully!"
        echo "PUBKEY: $CUSTOMER_RELAY_PUBKEY"
        echo "NPUB: $CUSTOMER_RELAY_NPUB"
        echo "Keys have been added to /etc/brainstorm.conf (if it exists)"
    fi
else
    echo "Warning: /etc/brainstorm.conf not found."
fi



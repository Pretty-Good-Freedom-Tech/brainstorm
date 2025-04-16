#!/bin/bash

# Brainstorm Negentropy Sync Script
# This script uses strfry's negentropy implementation to sync FOLLOWS, MUTES and REPORTS data

echo "Starting Negentropy sync with relay.brainstorm.com..."

# Run strfry sync with negentropy
sudo strfry sync wss://relay.hasenpfeffr.com --filter '{"kinds":[3, 1984, 10000, 30000]}' --dir down

echo "Negentropy sync completed!"

#!/bin/bash

# This script acts as a wrapper to execute the personalized whitelist generation
# It's designed to be called from the control panel

# Log file
LOG_FILE="/var/log/hasenpfeffr/personalizedWhitelist.log"

# Ensure log directory exists
if [ ! -d "/var/log/hasenpfeffr" ]; then
    sudo mkdir -p /var/log/hasenpfeffr
    sudo chown hasenpfeffr:hasenpfeffr /var/log/hasenpfeffr
fi

# Initialize log file if it doesn't exist
if [ ! -f "$LOG_FILE" ]; then
    sudo touch "$LOG_FILE"
    sudo chown hasenpfeffr:hasenpfeffr "$LOG_FILE"
fi

# Log function
log() {
    echo "$(date +'%Y-%m-%d %H:%M:%S') - $1" | sudo tee -a "$LOG_FILE"
}

log "Starting whitelist generation process"

# Run the main calculation script
log "Calling calculatePersonalizedWhitelist.sh"
sudo /usr/local/lib/node_modules/hasenpfeffr/src/algos/personalizedWhitelist/calculatePersonalizedWhitelist.sh

# Check if the script executed successfully
if [ $? -eq 0 ]; then
    log "Whitelist generation completed successfully"
    exit 0
else
    log "Error: Whitelist generation failed"
    exit 1
fi

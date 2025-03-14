#!/bin/bash

# calculateGrapeRank.sh
# This script implements the GrapeRank algorithm to calculate personalized scores

# Source configuration
source /etc/hasenpfeffr.conf # HASENPFEFFR_OWNER_PUBKEY
source /etc/graperank.conf   # ATTENUATION_FACTOR, RIGOR

echo "$(date): Starting calculateGrapeRank" >> /var/log/hasenpfeffr/calculatePersonalizedGrapeRank.log

# Create the base directory structure if it doesn't exist
USERNAME="hasenpfeffr"
BASE_DIR="/var/lib/hasenpfeffr"
TEMP_DIR="$BASE_DIR/algos/personalizedGrapeRank/tmp"
mkdir -p $TEMP_DIR

# Set ownership and permissions
chown -R "$USERNAME:$USERNAME" "$TEMP_DIR"
chmod -R 755 "$TEMP_DIR"

# Run the JavaScript script
node /usr/local/lib/node_modules/hasenpfeffr/src/algos/personalizedGrapeRank/calculateGrapeRank.js

echo "$(date): Finished calculateGrapeRank" >> /var/log/hasenpfeffr/calculatePersonalizedGrapeRank.log

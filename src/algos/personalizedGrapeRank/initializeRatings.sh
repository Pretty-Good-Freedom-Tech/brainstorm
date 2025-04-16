#!/bin/bash

# initializeRatings.sh
# This script creates a ratings.json file in the temporary directory

# Source configuration
source /etc/brainstorm.conf # BRAINSTORM_OWNER_PUBKEY
source /etc/graperank.conf   # Rating and confidence values

echo "$(date): Continuing calculatePersonalizedGrapeRank ... starting initializeRatings" >> ${BRAINSTORM_LOG_DIR}/calculatePersonalizedGrapeRank.log

# Create the base directory structure if it doesn't exist
USERNAME="brainstorm"
BASE_DIR="/var/lib/brainstorm"
TEMP_DIR="$BASE_DIR/algos/personalizedGrapeRank/tmp"
mkdir -p $TEMP_DIR

# Set ownership and permissions
chown -R "$USERNAME:$USERNAME" "$TEMP_DIR"
chmod -R 755 "$TEMP_DIR"

# Run the JavaScript script
node /usr/local/lib/node_modules/brainstorm/src/algos/personalizedGrapeRank/initializeRatings.js

echo "$(date): Continuing calculatePersonalizedGrapeRank ... finished initializeRatings" >> ${BRAINSTORM_LOG_DIR}/calculatePersonalizedGrapeRank.log

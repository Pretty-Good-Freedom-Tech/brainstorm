#!/bin/bash

# initializeScorecards.sh
# This script creates a scorecards_init.json file in the temporary directory

# Source configuration
source /etc/hasenpfeffr.conf # HASENPFEFFR_OWNER_PUBKEY

echo "$(date): Continuing calculatePersonalizedGrapeRank ... starting initializeScorecards" >> ${HASENPFEFFR_LOG_DIR}/calculatePersonalizedGrapeRank.log

# Create the base directory structure if it doesn't exist
USERNAME="hasenpfeffr"
BASE_DIR="/var/lib/hasenpfeffr"
TEMP_DIR="$BASE_DIR/algos/personalizedGrapeRank/tmp"
mkdir -p $TEMP_DIR

# Set ownership and permissions
chown -R "$USERNAME:$USERNAME" "$TEMP_DIR"
chmod -R 755 "$TEMP_DIR"

# Run the JavaScript script
node /usr/local/lib/node_modules/hasenpfeffr/src/algos/personalizedGrapeRank/initializeScorecards.js

echo "$(date): Continuing calculatePersonalizedGrapeRank ... finished initializeScorecards" >> ${HASENPFEFFR_LOG_DIR}/calculatePersonalizedGrapeRank.log

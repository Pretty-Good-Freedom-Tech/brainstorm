#!/bin/bash

# calculateGrapeRank.sh
# This script implements the GrapeRank algorithm to calculate personalized scores

# Source configuration
source /etc/hasenpfeffr.conf # HASENPFEFFR_OWNER_PUBKEY
source /etc/graperank.conf   # ATTENUATION_FACTOR, RIGOR
echo "$(date): Continuing calculatePersonalizedGrapeRank ... starting calculateGrapeRank" >> ${HASENPFEFFR_LOG_DIR}/calculatePersonalizedGrapeRank.log

# Create the base directory structure if it doesn't exist
USERNAME="hasenpfeffr"
ALGOS_DIR="${HASENPFEFFR_MODULE_ALGOS_DIR}"
TEMP_DIR="$ALGOS_DIR/personalizedGrapeRank/tmp"
mkdir -p $TEMP_DIR

# Set ownership and permissions
chown -R "$USERNAME:$USERNAME" "$TEMP_DIR"
chmod -R 755 "$TEMP_DIR"

# Run the JavaScript script
node $ALGOS_DIR/personalizedGrapeRank/calculateGrapeRank.js

echo "$(date): Continuing calculatePersonalizedGrapeRank ... finished calculateGrapeRank" >> ${HASENPFEFFR_LOG_DIR}/calculatePersonalizedGrapeRank.log

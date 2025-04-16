#!/bin/bash

# updateNeo4j.sh
# This script updates Neo4j with GrapeRank scores from scorecards.json

# Source configuration
source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR

echo "$(date): Continuing calculatePersonalizedGrapeRank ... starting updateNeo4j" >> ${BRAINSTORM_LOG_DIR}/calculatePersonalizedGrapeRank.log

# Create the base directory structure if it doesn't exist
USERNAME="brainstorm"
BASE_DIR="/var/lib/brainstorm"
TEMP_DIR="$BASE_DIR/algos/personalizedGrapeRank/tmp"
mkdir -p $TEMP_DIR

# Set ownership and permissions
chown -R "$USERNAME:$USERNAME" "$TEMP_DIR"
chmod -R 755 "$TEMP_DIR"

# Check if neo4j-driver is installed
if ! npm list -g neo4j-driver > /dev/null 2>&1; then
  echo "Installing neo4j-driver..."
  npm install -g neo4j-driver
fi

# Run the JavaScript script
node /usr/local/lib/node_modules/brainstorm/src/algos/personalizedGrapeRank/updateNeo4j.js

echo "$(date): Continuing calculatePersonalizedGrapeRank ... finished updateNeo4j" >> ${BRAINSTORM_LOG_DIR}/calculatePersonalizedGrapeRank.log

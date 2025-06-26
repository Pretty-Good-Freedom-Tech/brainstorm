#!/bin/bash

# deleteAllRelationships.sh
# This script runs the deleteAllRelationships.js Node.js script to delete ALL relationships
# from Neo4j in batches, with proper environment setup

CONFIG_FILE="/etc/brainstorm.conf"
if [ -f "$CONFIG_FILE" ]; then
  source "$CONFIG_FILE" # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, BRAINSTORM_LOG_DIR
fi

# Ensure log directory exists
mkdir -p ${BRAINSTORM_LOG_DIR:-/var/log/brainstorm}
LOGFILE="${BRAINSTORM_LOG_DIR:-/var/log/brainstorm}/deleteAllRelationships.log"

# Create log file if it doesn't exist and set permissions
touch $LOGFILE
sudo chown brainstorm:brainstorm $LOGFILE 2>/dev/null || true

echo "$(date): Starting deleteAllRelationships" | tee -a $LOGFILE
echo "$(date): Starting deleteAllRelationships" >> $LOGFILE

# Run the Node.js script
echo "$(date): Running deleteAllRelationships.js" | tee -a $LOGFILE
sudo node "$(dirname "$0")/deleteAllRelationships.js"
RESULT=$?

if [ $RESULT -eq 0 ]; then
  echo "$(date): deleteAllRelationships.js completed successfully" | tee -a $LOGFILE
else
  echo "$(date): deleteAllRelationships.js failed with exit code $RESULT" | tee -a $LOGFILE
fi

echo "$(date): Finished deleteAllRelationships" | tee -a $LOGFILE

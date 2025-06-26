#!/bin/bash

# deleteFollows.sh
# This script runs the deleteFollows.js Node.js script to delete FOLLOWS relationships
# from Neo4j in batches, with proper environment setup

CONFIG_FILE="/etc/brainstorm.conf"
if [ -f "$CONFIG_FILE" ]; then
  source "$CONFIG_FILE" # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, BRAINSTORM_LOG_DIR
fi

# Ensure log directory exists
mkdir -p ${BRAINSTORM_LOG_DIR:-/var/log/brainstorm}
LOGFILE="${BRAINSTORM_LOG_DIR:-/var/log/brainstorm}/deleteFollows.log"

# Create log file if it doesn't exist and set permissions
touch $LOGFILE
sudo chown brainstorm:brainstorm $LOGFILE 2>/dev/null || true

echo "$(date): Starting deleteFollows.sh" | tee -a $LOGFILE
echo "$(date): Starting deleteFollows.sh" >> $LOGFILE

# Run the Node.js script
echo "$(date): Running deleteFollows.js" | tee -a $LOGFILE
sudo node "$(dirname "$0")/deleteFollows.js"
RESULT=$?

if [ $RESULT -eq 0 ]; then
  echo "$(date): deleteFollows.js completed successfully" | tee -a $LOGFILE
else
  echo "$(date): deleteFollows.js failed with exit code $RESULT" | tee -a $LOGFILE
fi

echo "$(date): Finished deleteFollows.sh" | tee -a $LOGFILE

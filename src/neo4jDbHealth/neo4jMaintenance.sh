#!/bin/bash

# neo4jMaintenance.sh
# This script runs the neo4jMaintenance.js Node.js script to perform Neo4j maintenance tasks
# with proper environment setup

CONFIG_FILE="/etc/brainstorm.conf"
if [ -f "$CONFIG_FILE" ]; then
  source "$CONFIG_FILE" # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, BRAINSTORM_LOG_DIR
fi

# Ensure log directory exists
mkdir -p ${BRAINSTORM_LOG_DIR:-/var/log/brainstorm}/neo4jHealth
LOGFILE="${BRAINSTORM_LOG_DIR:-/var/log/brainstorm}/neo4jHealth/maintenance_runner.log"

# Create log file if it doesn't exist and set permissions
touch $LOGFILE
sudo chown brainstorm:brainstorm $LOGFILE 2>/dev/null || true

echo "$(date): Starting Neo4j maintenance tasks" | tee -a $LOGFILE

# Run the Node.js script with any passed arguments
echo "$(date): Running neo4jMaintenance.js $@" | tee -a $LOGFILE
sudo node "$(dirname "$0")/neo4jMaintenance.js" "$@"
RESULT=$?

if [ $RESULT -eq 0 ]; then
  echo "$(date): Neo4j maintenance completed successfully" | tee -a $LOGFILE
else
  echo "$(date): Neo4j maintenance failed with exit code $RESULT" | tee -a $LOGFILE
fi

echo "$(date): Finished Neo4j maintenance tasks" | tee -a $LOGFILE

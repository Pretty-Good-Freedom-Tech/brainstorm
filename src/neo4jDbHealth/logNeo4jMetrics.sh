#!/bin/bash

# logNeo4jMetrics.sh
# This script runs the logNeo4jMetrics.js Node.js script to collect and log Neo4j metrics
# with proper environment setup

CONFIG_FILE="/etc/brainstorm.conf"
if [ -f "$CONFIG_FILE" ]; then
  source "$CONFIG_FILE" # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, BRAINSTORM_LOG_DIR
fi

# Ensure log directory exists
mkdir -p ${BRAINSTORM_LOG_DIR:-/var/log/brainstorm}/neo4jHealth
LOGFILE="${BRAINSTORM_LOG_DIR:-/var/log/brainstorm}/neo4jHealth/metrics_runner.log"

# Create log file if it doesn't exist and set permissions
touch $LOGFILE
sudo chown brainstorm:brainstorm $LOGFILE 2>/dev/null || true

echo "$(date): Starting Neo4j metrics collection" | tee -a $LOGFILE

# Run the Node.js script
echo "$(date): Running logNeo4jMetrics.js" | tee -a $LOGFILE
sudo node "$(dirname "$0")/logNeo4jMetrics.js"
RESULT=$?

if [ $RESULT -eq 0 ]; then
  echo "$(date): Neo4j metrics collection completed successfully" | tee -a $LOGFILE
else
  echo "$(date): Neo4j metrics collection failed with exit code $RESULT" | tee -a $LOGFILE
fi

echo "$(date): Finished Neo4j metrics collection" | tee -a $LOGFILE

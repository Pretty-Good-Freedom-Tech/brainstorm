#!/bin/bash

# neo4jMaintenance.sh
# This script runs the neo4jMaintenance.js Node.js script to perform Neo4j maintenance tasks
# with proper environment setup

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Source config if it exists
CONFIG_FILE="/etc/brainstorm.conf"
if [ -f "$CONFIG_FILE" ]; then
  source "$CONFIG_FILE" # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, BRAINSTORM_LOG_DIR
fi

# Determine log directory - try server location first, fall back to local
if [ -d "/var/log/brainstorm" ] && [ -w "/var/log/brainstorm" ]; then
  # Server environment with proper permissions
  export BRAINSTORM_LOG_DIR="/var/log/brainstorm"
else
  # Local development or server without permissions
  export BRAINSTORM_LOG_DIR=${BRAINSTORM_LOG_DIR:-"$PROJECT_ROOT/logs"}
  # Ensure the local log directory exists
  mkdir -p "$BRAINSTORM_LOG_DIR"
fi

# Ensure neo4jHealth subdirectory exists
mkdir -p "$BRAINSTORM_LOG_DIR/neo4jHealth"
LOGFILE="$BRAINSTORM_LOG_DIR/neo4jHealth/maintenance_runner.log"

# Create log file if it doesn't exist
touch "$LOGFILE" 2>/dev/null || {
  echo "Warning: Cannot write to $LOGFILE. Check permissions."
  # Fall back to local logs if server logs are not writable
  if [[ "$BRAINSTORM_LOG_DIR" == "/var/log/brainstorm" ]]; then
    export BRAINSTORM_LOG_DIR="$PROJECT_ROOT/logs"
    mkdir -p "$BRAINSTORM_LOG_DIR/neo4jHealth"
    LOGFILE="$BRAINSTORM_LOG_DIR/neo4jHealth/maintenance_runner.log"
    touch "$LOGFILE"
    echo "Falling back to local log directory: $BRAINSTORM_LOG_DIR"
  fi
}

echo "$(date): Starting Neo4j maintenance tasks" | tee -a "$LOGFILE" 2>/dev/null

# Run the Node.js script with any passed arguments
echo "$(date): Running neo4jMaintenance.js $@" | tee -a "$LOGFILE" 2>/dev/null
node "$SCRIPT_DIR/neo4jMaintenance.js" "$@"
RESULT=$?

if [ $RESULT -eq 0 ]; then
  echo "$(date): Neo4j maintenance completed successfully" | tee -a "$LOGFILE" 2>/dev/null
else
  echo "$(date): Neo4j maintenance failed with exit code $RESULT" | tee -a "$LOGFILE" 2>/dev/null
fi

echo "$(date): Finished Neo4j maintenance tasks" | tee -a "$LOGFILE" 2>/dev/null

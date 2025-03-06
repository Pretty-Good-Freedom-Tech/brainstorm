#!/bin/bash

# Hasenpfeffr Database Initialization Script
# This script initializes the strfry database with events from relay.primal.net

echo "Initializing Hasenpfeffr database..."

# Stop strfry service if it's running
systemctl stop strfry

# Backup existing database if it exists
if [ -d "/var/lib/strfry/db" ]; then
  echo "Backing up existing database..."
  timestamp=$(date +%Y%m%d%H%M%S)
  mkdir -p /var/lib/strfry/backups
  cp -r /var/lib/strfry/db /var/lib/strfry/backups/db_$timestamp
fi

# Initialize strfry database
echo "Creating new database..."
mkdir -p /var/lib/strfry/db
chown -R strfry:strfry /var/lib/strfry

# Fetch initial events from relay.primal.net
echo "Fetching events from relay.primal.net..."
strfry fetch --relay wss://relay.primal.net --kinds 3,1984,10000 --limit 10000

# Start strfry service
echo "Starting strfry service..."
systemctl start strfry

echo "Database initialization complete!"

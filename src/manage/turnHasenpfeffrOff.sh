#!/bin/bash

# Script to turn off all Brainstorm services

echo "Stopping Brainstorm services..."

# Source configuration
source /etc/brainstorm.conf

# Stop Brainstorm ETL pipeline services
echo "Stopping Brainstorm ETL pipeline services..."

# Stop reconcile timer
# This has been subsumed into the processAllTasks service
# sudo systemctl stop reconcile.timer
# sleep 1

# Stop processQueue service
sudo systemctl stop processQueue
sleep 1

# Stop addToQueue service
sudo systemctl stop addToQueue
sleep 1

# Stop control panel (keep this running so we can turn things back on)
# sudo systemctl stop brainstorm-control-panel
# sleep 1

# Stop strfry-router
echo "Stopping strfry-router..."
sudo systemctl stop strfry-router
sleep 3

# Stop strfry
echo "Stopping strfry..."
sudo systemctl stop strfry
sleep 3

# Stop Neo4j
echo "Stopping Neo4j..."
sudo systemctl stop neo4j
sleep 5

echo "Brainstorm services stopped successfully."

exit 0

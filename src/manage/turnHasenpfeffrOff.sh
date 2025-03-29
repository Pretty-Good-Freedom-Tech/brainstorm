#!/bin/bash

# Script to turn off all Hasenpfeffr services

echo "Stopping Hasenpfeffr services..."

# Source configuration
source /etc/hasenpfeffr.conf

# Stop Hasenpfeffr ETL pipeline services
echo "Stopping Hasenpfeffr ETL pipeline services..."

# Stop reconcile timer
sudo systemctl stop reconcile.timer
sleep 1

# Stop processQueue service
sudo systemctl stop processQueue
sleep 1

# Stop addToQueue service
sudo systemctl stop addToQueue
sleep 1

# Stop control panel (keep this running so we can turn things back on)
# sudo systemctl stop hasenpfeffr-control-panel
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

echo "Hasenpfeffr services stopped successfully."
echo "You can restart services from the control panel at http://localhost:3000"

exit 0

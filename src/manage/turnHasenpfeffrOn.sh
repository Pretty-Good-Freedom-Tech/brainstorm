#!/bin/bash

# Script to turn on all Hasenpfeffr services

echo "Starting Hasenpfeffr services..."

# Source configuration
source /etc/hasenpfeffr.conf

# Start Neo4j
echo "Starting Neo4j..."
sudo systemctl start neo4j
sleep 5

# Start strfry
echo "Starting strfry..."
sudo systemctl start strfry
sleep 3

# Start strfry-router
echo "Starting strfry-router..."
sudo systemctl start strfry-router
sleep 3

# Start Hasenpfeffr ETL pipeline services
echo "Starting Hasenpfeffr ETL pipeline services..."

# Start addToQueue service
sudo systemctl start addToQueue
sleep 1

# Start processQueue service
sudo systemctl start processQueue
sleep 1

# Start reconcile timer
# This has been subsumed into the processAllTasks service
# sudo systemctl start reconcile.timer
# sleep 1

# Start control panel
sudo systemctl start hasenpfeffr-control-panel
sleep 1

# Run initial Negentropy sync for Web of Trust events
echo "Initiating Negentropy sync for Web of Trust events..."
curl -s "http://localhost:3000/api/negentropy-sync?relay=wss://relay.primal.net&kinds=3,1984,10000" > /dev/null

echo "Hasenpfeffr services started successfully."

exit 0

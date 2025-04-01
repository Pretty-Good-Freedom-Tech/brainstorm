#!/bin/bash

# Script to turn on all ETL pipeline streaming services, including the strfry router

echo "Starting streaming services..."

# Start addToQueue service
sudo systemctl start addToQueue
sleep 1

# Start processQueue service
sudo systemctl start processQueue
sleep 1

# Start strfry-router
sudo systemctl start strfry-router
sleep 3

echo "Streaming services started successfully."

exit 0

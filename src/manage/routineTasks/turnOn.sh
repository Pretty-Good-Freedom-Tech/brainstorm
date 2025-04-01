#!/bin/bash

# Script to turn on processAllTasks timer service

echo "Starting processAllTasks timer service..."

# Start processAllTasks timer
sudo systemctl start processAllTasks.timer

echo "processAllTasks timer service started successfully."

exit 0

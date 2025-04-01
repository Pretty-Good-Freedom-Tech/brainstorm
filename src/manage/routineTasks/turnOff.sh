#!/bin/bash

# Script to turn off processAllTasks timer service

echo "Stopping processAllTasks timer service..."

# Stop processAllTasks timer
sudo systemctl stop processAllTasks.timer

echo "processAllTasks timer service stopped successfully."

exit 0
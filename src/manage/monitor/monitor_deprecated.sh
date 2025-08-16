#!/bin/bash

# Script to monitor Brainstorm services

# Source environment configuration
source /etc/brainstorm.conf

# Log findings to monitor.log
LOG_FILE="${LOG_DIR}/monitor.log"
touch $LOG_FILE
sudo chown brainstorm:brainstorm $LOG_FILE

# Check if processAllTasks timer service is running
if ! systemctl is-active --quiet processAllTasks.timer; then
    echo "processAllTasks timer service is not running. Starting it..."
    sudo systemctl start processAllTasks.timer
fi

# Check if reconciliation timer service is running
if ! systemctl is-active --quiet reconcile.timer; then
    echo "reconcile timer service is not running. Starting it..."
    sudo systemctl start reconcile.timer
fi

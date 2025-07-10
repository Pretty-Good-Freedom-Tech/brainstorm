#!/bin/bash

# This script will calculate all scores for a given customer.
# It will pass the customer_id as an argument to calculateAllScores.sh
# Progress will be logged to /var/log/brainstorm/calculateAllScores.log

CONFIG_FILE="/etc/brainstorm.conf"
source "$CONFIG_FILE" # BRAINSTORM_LOG_DIR

# Check if customer_id is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <customer_id>"
    exit 1
fi

# Get customer_id
CUSTOMER_ID="$1"

CUSTOMERS_DIR="/var/lib/brainstorm/customers"
CUSTOMERS_FILE="$CUSTOMERS_DIR/customers.json"

# Get log directory
LOG_DIR="$BRAINSTORM_LOG_DIR"

# Create log directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Log file
LOG_FILE="$LOG_DIR/calculateAllScores.log"

# Log start time
echo "$(date): Starting calculateAllScores for customer $CUSTOMER_ID" >> "$LOG_FILE"

# Run calculateAllScores.sh
sudo bash /usr/local/lib/node_modules/brainstorm/src/algos/customers/calculateAllScores.sh "$CUSTOMER_ID" >> "$LOG_FILE" 2>&1

# Log end time
echo "$(date): Finished calculateAllScores for customer $CUSTOMER_ID" >> "$LOG_FILE"

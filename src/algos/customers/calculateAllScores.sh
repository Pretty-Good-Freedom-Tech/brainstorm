#!/bin/bash

# This script will calculate all scores for a given customer.
# It will pass the customer_id as an argument to calculateAllScores.sh
# Progress will be logged to /var/log/brainstorm/calculateAllScores.log

CONFIG_FILE="/etc/brainstorm.conf"
source "$CONFIG_FILE" # BRAINSTORM_LOG_DIR

# Check if customer_pubkey and customer_id are provided
if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Usage: $0 <customer_pubkey> <customer_id>"
    exit 1
fi

# Get customer_pubkey
CUSTOMER_PUBKEY="$1"

# Get customer_id
CUSTOMER_ID="$2"

# Get log directory
LOG_DIR="$BRAINSTORM_LOG_DIR"

# Create log directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Log file
LOG_FILE="$LOG_DIR/calculateAllScores.log"

# Log start time
echo "$(date): Starting calculateAllScores for customer $CUSTOMER_ID and customer_pubkey $CUSTOMER_PUBKEY"
echo "$(date): Starting calculateAllScores for customer $CUSTOMER_ID and customer_pubkey $CUSTOMER_PUBKEY" >> "$LOG_FILE"

# Run calculateHops.sh
sudo bash $BRAINSTORM_MODULE_ALGOS_DIR/customers/calculateHops.sh "$CUSTOMER_PUBKEY" >> "$LOG_FILE" 2>&1

# Run personalizedPageRank.sh
sudo bash $BRAINSTORM_MODULE_ALGOS_DIR/customers/personalizedPageRank.sh "$CUSTOMER_PUBKEY" >> "$LOG_FILE" 2>&1

# TODO: run calculateGrapeRank.sh
# sudo bash $BRAINSTORM_MODULE_ALGOS_DIR/customers/calculateGrapeRank.sh "$CUSTOMER_PUBKEY" >> "$LOG_FILE" 2>&1

# Log end time
echo "$(date): Finished calculateAllScores for customer $CUSTOMER_ID and customer_pubkey $CUSTOMER_PUBKEY"
echo "$(date): Finished calculateAllScores for customer $CUSTOMER_ID and customer_pubkey $CUSTOMER_PUBKEY" >> "$LOG_FILE"

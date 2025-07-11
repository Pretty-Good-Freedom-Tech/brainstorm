#!/bin/bash

CONFIG_FILE="/etc/brainstorm.conf"
source "$CONFIG_FILE" # BRAINSTORM_MODULE_ALGOS_DIR

SCRIPTS_DIR="$BRAINSTORM_MODULE_ALGOS_DIR/customers/"

CUSTOMERS_DIR="/var/lib/brainstorm/customers"

# Check if customer_id is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <customer_id>"
    exit 1
fi

# Get customer_id
CUSTOMER_ID="$1"

# Get log directory
LOG_DIR="$BRAINSTORM_LOG_DIR"

# Create log directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Log file
LOG_FILE="$LOG_DIR/processCustomer.log"

# Log start time
echo "$(date): Starting processCustomer for customer $CUSTOMER_ID"
echo "$(date): Starting processCustomer for customer $CUSTOMER_ID" >> "$LOG_FILE"

# TODO: run all scripts required for processing
# src/cns/prepareMetricsGraphForCustomer.sh
# src/algos/customers/calculateAllScores.sh

# Log end time
echo "$(date): Finished processCustomer for customer $CUSTOMER_ID"
echo "$(date): Finished processCustomer for customer $CUSTOMER_ID" >> "$LOG_FILE"

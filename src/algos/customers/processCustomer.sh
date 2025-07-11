#!/bin/bash

CONFIG_FILE="/etc/brainstorm.conf"
source "$CONFIG_FILE" # BRAINSTORM_MODULE_ALGOS_DIR

SCRIPTS_DIR="$BRAINSTORM_MODULE_ALGOS_DIR/customers/"

CUSTOMERS_DIR="/var/lib/brainstorm/customers"

# Check if customer_pubkey is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <customer_pubkey> <customer_id>"
    exit 1
fi

# Get customer_pubkey
CUSTOMER_PUBKEY="$1"

# Check if CUSTOMER_ID is provided
if [ -z "$2" ]; then
    echo "Usage: $0 <customer_pubkey> <customer_id>"
    exit 1
fi

# Get customer_id
CUSTOMER_ID="$2"

# Get log directory
LOG_DIR="$BRAINSTORM_LOG_DIR"

# Create log directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Log file
LOG_FILE="$LOG_DIR/processCustomer.log"

# Log start time
echo "$(date): Starting processCustomer for customer_pubkey $CUSTOMER_PUBKEY and customer_id $CUSTOMER_ID"
echo "$(date): Starting processCustomer for customer_pubkey $CUSTOMER_PUBKEY and customer_id $CUSTOMER_ID" >> "$LOG_FILE"

# TODO: run all scripts required for processing
sudo bash $BRAINSTORM_MODULE_BASE_DIR/src/cns/prepareNeo4jForCustomerData.sh $CUSTOMER_PUBKEY $CUSTOMER_ID
# do preliminary steps for GrapeRank that are common to all customers, i.e. generate all ratings
sudo bash $BRAINSTORM_MODULE_ALGOS_DIR/customers/calculateAllScores.sh

# Log end time
echo "$(date): Finished processCustomer for customer_pubkey $CUSTOMER_PUBKEY and customer_id $CUSTOMER_ID"
echo "$(date): Finished processCustomer for customer_pubkey $CUSTOMER_PUBKEY and customer_id $CUSTOMER_ID" >> "$LOG_FILE"

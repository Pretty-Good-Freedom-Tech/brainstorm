#!/bin/bash

CONFIG_FILE="/etc/brainstorm.conf"
source "$CONFIG_FILE" # BRAINSTORM_MODULE_ALGOS_DIR

SCRIPTS_DIR="$BRAINSTORM_MODULE_ALGOS_DIR/customers/"

CUSTOMERS_DIR="/var/lib/brainstorm/customers"

# Check if customer_pubkey is provided
if [ -z "$1" ] || [ -z "$2" ] || [ -z "$3" ]; then
    echo "Usage: $0 <customer_pubkey> <customer_id> <customer_name>"
    exit 1
fi

# Get customer_pubkey
CUSTOMER_PUBKEY="$1"

# Get customer_id
CUSTOMER_ID="$2"

# Get customer_name
CUSTOMER_NAME="$3"  

# Get log directory
LOG_DIR="$BRAINSTORM_LOG_DIR/customers/$CUSTOMER_NAME"

# Create log directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Log file
LOG_FILE="$LOG_DIR/processCustomer.log"

touch ${LOG_FILE}
sudo chown brainstorm:brainstorm ${LOG_FILE}

# Log start time
echo "$(date): Starting processCustomer for customer_name $CUSTOMER_NAME customer_pubkey $CUSTOMER_PUBKEY and customer_id $CUSTOMER_ID"
echo "$(date): Starting processCustomer for customer_name $CUSTOMER_NAME customer_pubkey $CUSTOMER_PUBKEY and customer_id $CUSTOMER_ID" >> "$LOG_FILE"

echo "$(date): Continuing processCustomer; starting prepareNeo4jForCustomerData.sh"
echo "$(date): Continuing processCustomer; starting prepareNeo4jForCustomerData.sh" >> "$LOG_FILE"

sudo bash $BRAINSTORM_MODULE_BASE_DIR/src/cns/prepareNeo4jForCustomerData.sh $CUSTOMER_PUBKEY $CUSTOMER_ID $CUSTOMER_NAME# do preliminary steps for GrapeRank that are common to all customers, i.e. generate all ratings

echo "$(date): Continuing processCustomer; starting updateAllScoresForSingleCustomer.sh"
echo "$(date): Continuing processCustomer; starting updateAllScoresForSingleCustomer.sh" >> "$LOG_FILE"

sudo bash $BRAINSTORM_MODULE_ALGOS_DIR/customers/updateAllScoresForSingleCustomer.sh $CUSTOMER_PUBKEY $CUSTOMER_ID $CUSTOMER_NAME

# Log end time
echo "$(date): Finished processCustomer for customer_name $CUSTOMER_NAME customer_pubkey $CUSTOMER_PUBKEY and customer_id $CUSTOMER_ID"
echo "$(date): Finished processCustomer for customer_name $CUSTOMER_NAME customer_pubkey $CUSTOMER_PUBKEY and customer_id $CUSTOMER_ID" >> "$LOG_FILE"

#!/bin/bash

# This script will calculate all scores for a given customer.
# It will pass the customer_id as an argument to updateAllScoresForSingleCustomer.sh
# Progress will be logged to /var/log/brainstorm/updateAllScoresForSingleCustomer.log

CONFIG_FILE="/etc/brainstorm.conf"
source "$CONFIG_FILE" # BRAINSTORM_LOG_DIR

# Check if customer_pubkey, customer_id, and customer_name are provided
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
LOG_FILE="$LOG_DIR/updateAllScoresForSingleCustomer.log"

# Log start time
echo "$(date): Starting calculateAllScores for customer $CUSTOMER_ID and customer_pubkey $CUSTOMER_PUBKEY and customer_name $CUSTOMER_NAME"
echo "$(date): Starting calculateAllScores for customer $CUSTOMER_ID and customer_pubkey $CUSTOMER_PUBKEY and customer_name $CUSTOMER_NAME" >> "$LOG_FILE"

echo "$(date): Continuing calculateAllScores; starting calculateHops.sh"
echo "$(date): Continuing calculateAllScores; starting calculateHops.sh" >> "$LOG_FILE"

# Run calculateHops.sh
sudo bash $BRAINSTORM_MODULE_ALGOS_DIR/customers/calculateHops.sh "$CUSTOMER_PUBKEY" "$CUSTOMER_ID" "$CUSTOMER_NAME"

echo "$(date): Continuing calculateAllScores; starting personalizedPageRank.sh"
echo "$(date): Continuing calculateAllScores; starting personalizedPageRank.sh" >> "$LOG_FILE"

# Run personalizedPageRank.sh
sudo bash $BRAINSTORM_MODULE_ALGOS_DIR/customers/personalizedPageRank.sh "$CUSTOMER_PUBKEY" "$CUSTOMER_ID" "$CUSTOMER_NAME"

echo "$(date): Continuing calculateAllScores; starting personalizedGrapeRank.sh"
echo "$(date): Continuing calculateAllScores; starting personalizedGrapeRank.sh" >> "$LOG_FILE"

# Run personalizedGrapeRank.sh
sudo bash $BRAINSTORM_MODULE_ALGOS_DIR/customers/personalizedGrapeRank/personalizedGrapeRank.sh "$CUSTOMER_PUBKEY" "$CUSTOMER_ID" "$CUSTOMER_NAME"

echo "$(date): Continuing calculateAllScores; starting processFollowsMutesReports.sh"
echo "$(date): Continuing calculateAllScores; starting processFollowsMutesReports.sh" >> "$LOG_FILE"

# Run processFollowsMutesReports.sh
sudo bash $BRAINSTORM_MODULE_ALGOS_DIR/customers/follows-mutes-reports/processFollowsMutesReports.sh "$CUSTOMER_PUBKEY" "$CUSTOMER_ID" "$CUSTOMER_NAME"

# Log end time
echo "$(date): Finished calculateAllScores for customer $CUSTOMER_ID and customer_pubkey $CUSTOMER_PUBKEY and customer_name $CUSTOMER_NAME"
echo "$(date): Finished calculateAllScores for customer $CUSTOMER_ID and customer_pubkey $CUSTOMER_PUBKEY and customer_name $CUSTOMER_NAME" >> "$LOG_FILE"

#!/bin/bash

# This script calculats verified follower, muter, and reporter counts for a customer
# It also calculates follower, muter, and reporter inputs for a customer
# Results are stored in the relevant NostrUserWotMetricsCard nodes
# Absolute follower, muter, and reporter counts are not calculated here

source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR

# Check if customer_pubkey, customer_id, customer_name are provided
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

# Create log directory if it doesn't exist; chown to brainstorm user
mkdir -p "$LOG_DIR"
sudo chown brainstorm:brainstorm "$LOG_DIR"

# Log file
LOG_FILE="$LOG_DIR/processFollowsMutesReports.log"
touch ${LOG_FILE}
sudo chown brainstorm:brainstorm ${LOG_FILE}

echo "$(date): Starting processFollowsMutesReports"
echo "$(date): Starting processFollowsMutesReports" >> ${LOG_FILE}

sudo $BRAINSTORM_MODULE_ALGOS_DIR/customers/follows-mutes-reports/calculateVerifiedFollowerCounts.sh $CUSTOMER_PUBKEY $CUSTOMER_ID $CUSTOMER_NAME
sudo $BRAINSTORM_MODULE_ALGOS_DIR/customers/follows-mutes-reports/calculateVerifiedMuterCounts.sh $CUSTOMER_PUBKEY $CUSTOMER_ID $CUSTOMER_NAME
sudo $BRAINSTORM_MODULE_ALGOS_DIR/customers/follows-mutes-reports/calculateVerifiedReporterCounts.sh $CUSTOMER_PUBKEY $CUSTOMER_ID $CUSTOMER_NAME

echo "$(date): Continuing processFollowsMutesReports ... finished calculating verified follower, muter, and reporter counts"
echo "$(date): Continuing processFollowsMutesReports ... finished calculating verified follower, muter, and reporter counts" >> ${LOG_FILE}

sudo $BRAINSTORM_MODULE_ALGOS_DIR/customers/follows-mutes-reports/calculateFollowerMuterReporterInputs.sh $CUSTOMER_PUBKEY $CUSTOMER_ID $CUSTOMER_NAME

echo "$(date): Continuing processFollowsMutesReports ... finished calculating follower, muter, and reporter inputs"
echo "$(date): Continuing processFollowsMutesReports ... finished calculating follower, muter, and reporter inputs" >> ${LOG_FILE}

echo "$(date): Finished processFollowsMutesReports"
echo "$(date): Finished processFollowsMutesReports" >> ${LOG_FILE}

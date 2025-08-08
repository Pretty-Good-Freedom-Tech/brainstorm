#!/bin/bash

# This script will calculate all scores for a given customer.
# It will pass the customer_id as an argument to updateAllScoresForSingleCustomer.sh
# Progress will be logged to /var/log/brainstorm/updateAllScoresForSingleCustomer.log

CONFIG_FILE="/etc/brainstorm.conf"
source "$CONFIG_FILE" # BRAINSTORM_LOG_DIR

# Source structured logging utility
source "$BRAINSTORM_MODULE_BASE_DIR/src/utils/structuredLogging.sh"

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

# Create log directory if it doesn't exist; chown to brainstorm:brainstorm
mkdir -p "$LOG_DIR"
sudo chown brainstorm:brainstorm "$LOG_DIR"

# Log file
LOG_FILE="$LOG_DIR/updateAllScoresForSingleCustomer.log"
touch ${LOG_FILE}
sudo chown brainstorm:brainstorm ${LOG_FILE}

# Log start time
echo "$(date): Starting calculateAllScores for customer $CUSTOMER_ID and customer_pubkey $CUSTOMER_PUBKEY and customer_name $CUSTOMER_NAME"
echo "$(date): Starting calculateAllScores for customer $CUSTOMER_ID and customer_pubkey $CUSTOMER_PUBKEY and customer_name $CUSTOMER_NAME" >> "$LOG_FILE"

# Emit structured event for task start
emit_task_event "TASK_START" "updateAllScoresForSingleCustomer" \
    "customer_id=$CUSTOMER_ID" \
    "customer_pubkey=$CUSTOMER_PUBKEY" \
    "customer_name=$CUSTOMER_NAME"

echo "$(date): Continuing calculateAllScores; starting calculateHops.sh"
echo "$(date): Continuing calculateAllScores; starting calculateHops.sh" >> "$LOG_FILE"

# Emit structured event for child task start
emit_task_event "CHILD_TASK_START" "calculateCustomerHops" \
    "customer_id=$CUSTOMER_ID" \
    "customer_name=$CUSTOMER_NAME" \
    "parent_task=updateAllScoresForSingleCustomer"

# Run calculateHops.sh
if sudo bash $BRAINSTORM_MODULE_ALGOS_DIR/customers/calculateHops.sh "$CUSTOMER_PUBKEY" "$CUSTOMER_ID" "$CUSTOMER_NAME"; then
    emit_task_event "CHILD_TASK_END" "calculateCustomerHops" \
        "customer_id=$CUSTOMER_ID" \
        "customer_name=$CUSTOMER_NAME" \
        "status=success" \
        "parent_task=updateAllScoresForSingleCustomer"
else
    emit_task_event "CHILD_TASK_ERROR" "calculateCustomerHops" \
        "customer_id=$CUSTOMER_ID" \
        "customer_name=$CUSTOMER_NAME" \
        "status=failed" \
        "parent_task=updateAllScoresForSingleCustomer"
    echo "$(date): ERROR: calculateHops.sh failed for customer $CUSTOMER_NAME" >> "$LOG_FILE"
fi

echo "$(date): Continuing calculateAllScores; starting personalizedPageRank.sh"
echo "$(date): Continuing calculateAllScores; starting personalizedPageRank.sh" >> "$LOG_FILE"

# Emit structured event for child task start
emit_task_event "CHILD_TASK_START" "calculateCustomerPageRank" \
    "customer_id=$CUSTOMER_ID" \
    "customer_name=$CUSTOMER_NAME" \
    "parent_task=updateAllScoresForSingleCustomer"

# Run personalizedPageRank.sh
if sudo bash $BRAINSTORM_MODULE_ALGOS_DIR/customers/personalizedPageRank.sh "$CUSTOMER_PUBKEY" "$CUSTOMER_ID" "$CUSTOMER_NAME"; then
    emit_task_event "CHILD_TASK_END" "calculateCustomerPageRank" \
        "customer_id=$CUSTOMER_ID" \
        "customer_name=$CUSTOMER_NAME" \
        "status=success" \
        "parent_task=updateAllScoresForSingleCustomer"
else
    emit_task_event "CHILD_TASK_ERROR" "calculateCustomerPageRank" \
        "customer_id=$CUSTOMER_ID" \
        "customer_name=$CUSTOMER_NAME" \
        "status=failed" \
        "parent_task=updateAllScoresForSingleCustomer"
    echo "$(date): ERROR: personalizedPageRank.sh failed for customer $CUSTOMER_NAME" >> "$LOG_FILE"
fi

echo "$(date): Continuing calculateAllScores; starting personalizedGrapeRank.sh"
echo "$(date): Continuing calculateAllScores; starting personalizedGrapeRank.sh" >> "$LOG_FILE"

# Emit structured event for child task start
emit_task_event "CHILD_TASK_START" "calculateCustomerGrapeRank" \
    "customer_id=$CUSTOMER_ID" \
    "customer_name=$CUSTOMER_NAME" \
    "parent_task=updateAllScoresForSingleCustomer"

# Run personalizedGrapeRank.sh
if sudo bash $BRAINSTORM_MODULE_ALGOS_DIR/customers/personalizedGrapeRank/personalizedGrapeRank.sh "$CUSTOMER_PUBKEY" "$CUSTOMER_ID" "$CUSTOMER_NAME"; then
    emit_task_event "CHILD_TASK_END" "calculateCustomerGrapeRank" \
        "customer_id=$CUSTOMER_ID" \
        "customer_name=$CUSTOMER_NAME" \
        "status=success" \
        "parent_task=updateAllScoresForSingleCustomer"
else
    emit_task_event "CHILD_TASK_ERROR" "calculateCustomerGrapeRank" \
        "customer_id=$CUSTOMER_ID" \
        "customer_name=$CUSTOMER_NAME" \
        "status=failed" \
        "parent_task=updateAllScoresForSingleCustomer"
    echo "$(date): ERROR: personalizedGrapeRank.sh failed for customer $CUSTOMER_NAME" >> "$LOG_FILE"
fi

echo "$(date): Continuing calculateAllScores; starting processFollowsMutesReports.sh"
echo "$(date): Continuing calculateAllScores; starting processFollowsMutesReports.sh" >> "$LOG_FILE"

# Emit structured event for child task start
emit_task_event "CHILD_TASK_START" "processCustomerFollowsMutesReports" \
    "customer_id=$CUSTOMER_ID" \
    "customer_name=$CUSTOMER_NAME" \
    "parent_task=updateAllScoresForSingleCustomer"

# Run processFollowsMutesReports.sh
if sudo bash $BRAINSTORM_MODULE_ALGOS_DIR/customers/follows-mutes-reports/processFollowsMutesReports.sh "$CUSTOMER_PUBKEY" "$CUSTOMER_ID" "$CUSTOMER_NAME"; then
    emit_task_event "CHILD_TASK_END" "processCustomerFollowsMutesReports" \
        "customer_id=$CUSTOMER_ID" \
        "customer_name=$CUSTOMER_NAME" \
        "status=success" \
        "parent_task=updateAllScoresForSingleCustomer"
else
    emit_task_event "CHILD_TASK_ERROR" "processCustomerFollowsMutesReports" \
        "customer_id=$CUSTOMER_ID" \
        "customer_name=$CUSTOMER_NAME" \
        "status=failed" \
        "parent_task=updateAllScoresForSingleCustomer"
    echo "$(date): ERROR: processFollowsMutesReports.sh failed for customer $CUSTOMER_NAME" >> "$LOG_FILE"
fi

# TODO:
# process nip-56 reports by reportType
# create blacklist
# create whitelist

# Emit structured event for child task start
emit_task_event "CHILD_TASK_START" "exportCustomerKind30382" \
    "customer_id=$CUSTOMER_ID" \
    "customer_name=$CUSTOMER_NAME" \
    "parent_task=updateAllScoresForSingleCustomer"

# generate nip-85 exports
if sudo bash $BRAINSTORM_MODULE_ALGOS_DIR/customers/nip85/publishNip85.sh "$CUSTOMER_PUBKEY" "$CUSTOMER_ID" "$CUSTOMER_NAME"; then
    emit_task_event "CHILD_TASK_END" "exportCustomerKind30382" \
        "customer_id=$CUSTOMER_ID" \
        "customer_name=$CUSTOMER_NAME" \
        "status=success" \
        "parent_task=updateAllScoresForSingleCustomer"
else
    emit_task_event "CHILD_TASK_ERROR" "exportCustomerKind30382" \
        "customer_id=$CUSTOMER_ID" \
        "customer_name=$CUSTOMER_NAME" \
        "status=failed" \
        "parent_task=updateAllScoresForSingleCustomer"
    echo "$(date): ERROR: publishNip85.sh failed for customer $CUSTOMER_NAME" >> "$LOG_FILE"
fi

echo "$(date): Continuing calculateAllScores; starting publishNip85.sh"
echo "$(date): Continuing calculateAllScores; starting publishNip85.sh" >> "$LOG_FILE"

# Log end time
echo "$(date): Finished calculateAllScores for customer $CUSTOMER_ID and customer_pubkey $CUSTOMER_PUBKEY and customer_name $CUSTOMER_NAME"
echo "$(date): Finished calculateAllScores for customer $CUSTOMER_ID and customer_pubkey $CUSTOMER_PUBKEY and customer_name $CUSTOMER_NAME" >> "$LOG_FILE"

# Emit structured event for task completion
emit_task_event "TASK_END" "updateAllScoresForSingleCustomer" \
    "customer_id=$CUSTOMER_ID" \
    "customer_pubkey=$CUSTOMER_PUBKEY" \
    "customer_name=$CUSTOMER_NAME" \
    "status=success"

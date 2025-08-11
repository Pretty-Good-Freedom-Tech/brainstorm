#!/bin/bash

# Call this script prior to (or at the beginning of) updateAllScoresForSingleCustomer.sh for a given customer.
# This script prepares neo4j for storage of WoT metrics using a given customer as observer.
# It updates the neo4j database to ensure two properties:
# 1. every NostrUser has a single associated SetOfNostrUserWotMetricsCards node.
# 2. each SetOfNostrUserWotMetricsCards node has a single associated NostrUserWotMetricsCard node for the given customer.
# It is called with a command like:
# sudo bash prepareNeo4jForCustomerData.sh <customer_id> <customer_pubkey>
# which in turn calls two other scripts:
# sudo bash addSetsOfMetricsCards.sh (property 1)
# sudo bash addMetricsCards.sh <customer_id> <customer_pubkey> (property 2)
# Example: (cloudfodder.brainstorm.social)
# sudo bash prepareNeo4jForCustomerData.sh 52387c6b99cc42aac51916b08b7b51d2baddfc19f2ba08d82a48432849dbdfb2 2

source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, BRAINSTORM_LOG_DIR

# Source structured logging utilities
source "$BRAINSTORM_MODULE_BASE_DIR/src/utils/structuredLogging.sh"

# Check if CUSTOMER_PUBKEY is provided
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

# TODO: check if CUSTOMER_ID and CUSTOMER_PUBKEY are valid

echo "$(date): Starting prepareNeo4jForCustomerData for customer_pubkey $CUSTOMER_PUBKEY and customer_id $CUSTOMER_ID"
echo "$(date): Starting prepareNeo4jForCustomerData for customer_pubkey $CUSTOMER_PUBKEY and customer_id $CUSTOMER_ID" >> ${BRAINSTORM_LOG_DIR}/prepareNeo4jForCustomerData.log

# Emit structured event for task start
emit_task_event "TASK_START" "prepareNeo4jForCustomerData" "$CUSTOMER_PUBKEY" '{
    "customer_id": "'$CUSTOMER_ID'",
    "customer_pubkey": "'$CUSTOMER_PUBKEY'",
    "message": "Starting Neo4j customer data preparation",
    "task_type": "customer_preparation",
    "database": "neo4j",
    "operation": "wot_metrics_setup",
    "child_scripts": 2,
    "category": "maintenance",
    "scope": "customer",
    "parent_task": "processCustomer"
}'

# Emit structured event for first child script
emit_task_event "PROGRESS" "prepareNeo4jForCustomerData" "$CUSTOMER_PUBKEY" '{
    "customer_id": "'$CUSTOMER_ID'",
    "customer_pubkey": "'$CUSTOMER_PUBKEY'",
    "message": "Starting SetOfNostrUserWotMetricsCards setup",
    "phase": "metrics_cards_setup",
    "step": "sets_of_metrics_cards",
    "child_script": "addSetsOfMetricsCards.sh",
    "database": "neo4j",
    "operation": "general_setup"
}'

# Add SetOfNostrUserWotMetricsCards nodes to the neo4j database. This does not require customer_id or customer_pubkey.
if sudo bash $BRAINSTORM_MODULE_BASE_DIR/src/cns/addSetsOfMetricsCards.sh; then
    # Emit structured event for first child script success
    emit_task_event "PROGRESS" "prepareNeo4jForCustomerData" "$CUSTOMER_PUBKEY" '{
        "customer_id": "'$CUSTOMER_ID'",
        "customer_pubkey": "'$CUSTOMER_PUBKEY'",
        "message": "SetOfNostrUserWotMetricsCards setup completed successfully",
        "phase": "metrics_cards_setup",
        "step": "sets_of_metrics_cards_complete",
        "child_script": "addSetsOfMetricsCards.sh",
        "status": "success",
        "database": "neo4j"
    }'
else
    # Emit structured event for first child script failure
    emit_task_event "TASK_ERROR" "prepareNeo4jForCustomerData" "$CUSTOMER_PUBKEY" '{
        "customer_id": "'$CUSTOMER_ID'",
        "customer_pubkey": "'$CUSTOMER_PUBKEY'",
        "message": "SetOfNostrUserWotMetricsCards setup failed",
        "status": "failed",
        "task_type": "customer_preparation",
        "child_script": "addSetsOfMetricsCards.sh",
        "error_reason": "child_script_failure",
        "database": "neo4j",
        "category": "maintenance",
        "scope": "customer",
        "parent_task": "processCustomer"
    }'
    exit 1
fi

echo "$(date): Continuing prepareNeo4jForCustomerData for customer_pubkey $CUSTOMER_PUBKEY and customer_id $CUSTOMER_ID"
echo "$(date): Continuing prepareNeo4jForCustomerData for customer_pubkey $CUSTOMER_PUBKEY and customer_id $CUSTOMER_ID" >> ${BRAINSTORM_LOG_DIR}/prepareNeo4jForCustomerData.log

# Emit structured event for second child script
emit_task_event "PROGRESS" "prepareNeo4jForCustomerData" "$CUSTOMER_PUBKEY" '{
    "customer_id": "'$CUSTOMER_ID'",
    "customer_pubkey": "'$CUSTOMER_PUBKEY'",
    "message": "Starting customer-specific NostrUserWotMetricsCard setup",
    "phase": "metrics_cards_setup",
    "step": "customer_metrics_cards",
    "child_script": "addMetricsCards.sh",
    "database": "neo4j",
    "operation": "customer_specific_setup"
}'

# Add NostrUserWotMetricsCard nodes to the neo4j database for the given customer
if sudo bash $BRAINSTORM_MODULE_BASE_DIR/src/cns/addMetricsCards.sh $CUSTOMER_PUBKEY $CUSTOMER_ID; then
    # Emit structured event for second child script success
    emit_task_event "PROGRESS" "prepareNeo4jForCustomerData" "$CUSTOMER_PUBKEY" '{
        "customer_id": "'$CUSTOMER_ID'",
        "customer_pubkey": "'$CUSTOMER_PUBKEY'",
        "message": "Customer-specific NostrUserWotMetricsCard setup completed successfully",
        "phase": "metrics_cards_setup",
        "step": "customer_metrics_cards_complete",
        "child_script": "addMetricsCards.sh",
        "status": "success",
        "database": "neo4j"
    }'
else
    # Emit structured event for second child script failure
    emit_task_event "TASK_ERROR" "prepareNeo4jForCustomerData" "$CUSTOMER_PUBKEY" '{
        "customer_id": "'$CUSTOMER_ID'",
        "customer_pubkey": "'$CUSTOMER_PUBKEY'",
        "message": "Customer-specific NostrUserWotMetricsCard setup failed",
        "status": "failed",
        "task_type": "customer_preparation",
        "child_script": "addMetricsCards.sh",
        "error_reason": "child_script_failure",
        "database": "neo4j",
        "category": "maintenance",
        "scope": "customer",
        "parent_task": "processCustomer"
    }'
    exit 1
fi

# Emit structured event for successful completion
emit_task_event "TASK_END" "prepareNeo4jForCustomerData" "$CUSTOMER_PUBKEY" '{
    "customer_id": "'$CUSTOMER_ID'",
    "customer_pubkey": "'$CUSTOMER_PUBKEY'",
    "message": "Neo4j customer data preparation completed successfully",
    "status": "success",
    "task_type": "customer_preparation",
    "database": "neo4j",
    "child_scripts_completed": 2,
    "operations_completed": ["sets_of_metrics_cards", "customer_metrics_cards"],
    "category": "maintenance",
    "scope": "customer",
    "parent_task": "processCustomer"
}'

echo "$(date): Finished prepareNeo4jForCustomerData for customer_pubkey $CUSTOMER_PUBKEY and customer_id $CUSTOMER_ID"
echo "$(date): Finished prepareNeo4jForCustomerData for customer_pubkey $CUSTOMER_PUBKEY and customer_id $CUSTOMER_ID" >> ${BRAINSTORM_LOG_DIR}/prepareNeo4jForCustomerData.log


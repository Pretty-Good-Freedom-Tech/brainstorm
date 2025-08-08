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

# Add SetOfNostrUserWotMetricsCards nodes to the neo4j database. This does not require customer_id or customer_pubkey.
sudo bash $BRAINSTORM_MODULE_BASE_DIR/src/cns/addSetsOfMetricsCards.sh

echo "$(date): Continuing prepareNeo4jForCustomerData for customer_pubkey $CUSTOMER_PUBKEY and customer_id $CUSTOMER_ID"
echo "$(date): Continuing prepareNeo4jForCustomerData for customer_pubkey $CUSTOMER_PUBKEY and customer_id $CUSTOMER_ID" >> ${BRAINSTORM_LOG_DIR}/prepareNeo4jForCustomerData.log

# Add NostrUserWotMetricsCard nodes to the neo4j database for the given customer
sudo bash $BRAINSTORM_MODULE_BASE_DIR/src/cns/addMetricsCards.sh $CUSTOMER_PUBKEY $CUSTOMER_ID

echo "$(date): Finished prepareNeo4jForCustomerData for customer_pubkey $CUSTOMER_PUBKEY and customer_id $CUSTOMER_ID"
echo "$(date): Finished prepareNeo4jForCustomerData for customer_pubkey $CUSTOMER_PUBKEY and customer_id $CUSTOMER_ID" >> ${BRAINSTORM_LOG_DIR}/prepareNeo4jForCustomerData.log


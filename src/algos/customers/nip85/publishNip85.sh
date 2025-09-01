#!/bin/bash

# Script to publish Web of Trust scores to the Nostr network as kind 30382 events
# following the Trusted Assertions protocol (NIP-85)

# sampe test commands:
# sudo bash publishNip85.sh 53dab47395542b4df9c9d5b32934403b751f0a882e69bb8dd8a660df3a95f02d 11 customer_53dab473_mdugjpdy

# Source the configuration file
source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR, BRAINSTORM_MODULE_ALGOS_DIR, BRAINSTORM_RELAY_URL

# Source structured logging utility
source /usr/local/lib/node_modules/brainstorm/src/utils/structuredLogging.sh

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
LOG_FILE="$LOG_DIR/publishNip85.log"
touch ${LOG_FILE}
sudo chown brainstorm:brainstorm ${LOG_FILE}

echo "$(date): Starting publishNip85 for customer $CUSTOMER_ID and customer_pubkey $CUSTOMER_PUBKEY and customer_name $CUSTOMER_NAME"
echo "$(date): Starting publishNip85 for customer $CUSTOMER_ID and customer_pubkey $CUSTOMER_PUBKEY and customer_name $CUSTOMER_NAME" >> ${LOG_FILE}

# Start structured logging
emit_task_event "TASK_START" "exportCustomerKind30382" "$CUSTOMER_PUBKEY" '{
    "customer_id": "'$CUSTOMER_ID'",
    "customer_name": "'$CUSTOMER_NAME'",
    "customer_pubkey": "'$CUSTOMER_PUBKEY'",
    "description": "Starting Kind 30382 NIP-85 event publishing for customer",
    "protocol": "NIP-85",
    "event_kind": 30382,
    "phases": 2
}'

echo "$(date): Continuing publishNip85 ... making sure the relay pubkey has been created for this customer"
echo "$(date): Continuing publishNip85 ... making sure the relay pubkey has been created for this customer" >> ${LOG_FILE}

# Phase 1: Relay pubkey verification
emit_task_event "PROGRESS" "exportCustomerKind30382" "$CUSTOMER_PUBKEY" '{
    "customer_id": "'$CUSTOMER_ID'",
    "customer_name": "'$CUSTOMER_NAME'",
    "phase": 1,
    "step": "relay_pubkey_check",
    "description": "Verifying customer relay pubkey exists",
    "operation": "relay_pubkey_verification"
}'

# Make sure the relay pubkey is created for this customer
# being deprecated in favor of createAllCustomerRelays.js which is run on install by install-customers.sh
# sudo bash ${BRAINSTORM_MODULE_ALGOS_DIR}/customers/nip85/relayPubkey/createCustomerRelayPubkeyIfNeeded.sh $CUSTOMER_PUBKEY $CUSTOMER_ID $CUSTOMER_NAME

echo "$(date): Continuing publishNip85 ... calling script to publish kind 30382 events"
echo "$(date): Continuing publishNip85 ... calling script to publish kind 30382 events" >> ${LOG_FILE}

# Phase 2: Kind 30382 event publishing
emit_task_event "PROGRESS" "exportCustomerKind30382" "$CUSTOMER_PUBKEY" '{
    "customer_id": "'$CUSTOMER_ID'",
    "customer_name": "'$CUSTOMER_NAME'",
    "phase": 2,
    "step": "publish_kind30382",
    "description": "Publishing Kind 30382 NIP-85 events to relay",
    "operation": "publish_events",
    "event_kind": 30382,
    "protocol": "NIP-85"
}'

# Publish all kind 30382 events to BRAINSTORM_RELAY_URL
# The script will publish events only for NostrUsers whose hops parameter is not null and is less than 20
sudo node ${BRAINSTORM_MODULE_ALGOS_DIR}/customers/nip85/publish_kind30382.js $CUSTOMER_PUBKEY $CUSTOMER_ID $CUSTOMER_NAME
RESULT_30382=$?

if [ $RESULT_30382 -ne 0 ]; then
    echo "Error: Failed to publish kind 30382 events"
    echo "$(date): Error: Failed to publish kind 30382 events" >> ${LOG_FILE}
    
    # Error event
    emit_task_event "TASK_ERROR" "exportCustomerKind30382" "$CUSTOMER_PUBKEY" '{
        "customer_id": "'$CUSTOMER_ID'",
        "customer_name": "'$CUSTOMER_NAME'",
        "phase": 2,
        "error_code": '$RESULT_30382',
        "description": "Failed to publish Kind 30382 events",
        "operation": "publish_events",
        "event_kind": 30382,
        "protocol": "NIP-85"
    }'
    
    exit 1
fi

# Success event for publishing
emit_task_event "PROGRESS" "exportCustomerKind30382" "$CUSTOMER_PUBKEY" '{
    "customer_id": "'$CUSTOMER_ID'",
    "customer_name": "'$CUSTOMER_NAME'",
    "phase": 2,
    "step": "publish_kind30382",
    "status": "completed",
    "description": "Kind 30382 events published successfully",
    "operation": "publish_events",
    "event_kind": 30382,
    "protocol": "NIP-85"
}'

echo "$(date): Finished publishNip85 for customer $CUSTOMER_ID and customer_pubkey $CUSTOMER_PUBKEY and customer_name $CUSTOMER_NAME"
echo "$(date): Finished publishNip85 for customer $CUSTOMER_ID and customer_pubkey $CUSTOMER_PUBKEY and customer_name $CUSTOMER_NAME" >> ${LOG_FILE}

# End structured logging
emit_task_event "TASK_END" "exportCustomerKind30382" "$CUSTOMER_PUBKEY" '{
    "customer_id": "'$CUSTOMER_ID'",
    "customer_name": "'$CUSTOMER_NAME'",
    "phases_completed": 2,
    "status": "success",
    "description": "Kind 30382 NIP-85 event publishing completed successfully",
    "protocol": "NIP-85",
    "event_kind": 30382
}'

exit 0
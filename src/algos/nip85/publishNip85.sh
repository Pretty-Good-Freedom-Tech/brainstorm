#!/bin/bash

# Script to publish Web of Trust scores to the Nostr network as kind 30382 events
# following the Trusted Assertions protocol (NIP-85)

# Source the configuration file
source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR, BRAINSTORM_NIP85_DIR, BRAINSTORM_RELAY_URL, BRAINSTORM_DEFAULT_FRIEND_RELAYS

# Source structured logging utilities
source "$BRAINSTORM_MODULE_BASE_DIR/src/utils/structuredLogging.sh"

touch ${BRAINSTORM_LOG_DIR}/publishNip85.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/publishNip85.log

echo "$(date): Starting publishNip85"
echo "$(date): Starting publishNip85" >> ${BRAINSTORM_LOG_DIR}/publishNip85.log

# Emit structured event for task start
emit_task_event "TASK_START" "exportOwnerKind30382" "$BRAINSTORM_OWNER_PUBKEY" '{
    "message": "Starting owner-level NIP-85 event publishing",
    "task_type": "owner_export",
    "algorithm": "nip85_publishing",
    "protocol": "NIP-85",
    "event_type": "kind_30382",
    "scope": "owner",
    "phases": ["initialization_and_validation", "nip85_event_publishing", "error_handling_and_completion"],
    "target_relay": "BRAINSTORM_RELAY_URL",
    "trust_data": "web_of_trust_scores",
    "category": "export",
    "parent_task": "processAllTasks"
}'

# Emit structured event for Phase 1 start
emit_task_event "PROGRESS" "exportOwnerKind30382" "$BRAINSTORM_OWNER_PUBKEY" '{
    "message": "Starting Phase 1: Initialization and validation",
    "phase": "initialization_and_validation",
    "step": "phase_1_start",
    "algorithm": "nip85_publishing",
    "protocol": "NIP-85",
    "scope": "owner"
}'

# Check if the NIP85 directory exists
if [ ! -d "${BRAINSTORM_NIP85_DIR}" ]; then
    echo "Error: NIP85 directory not found at ${BRAINSTORM_NIP85_DIR}"
    echo "$(date): Error: NIP85 directory not found at ${BRAINSTORM_NIP85_DIR}" >> ${BRAINSTORM_LOG_DIR}/publishNip85.log
    
    # Emit structured event for directory validation error
    emit_task_event "TASK_ERROR" "exportOwnerKind30382" "$BRAINSTORM_OWNER_PUBKEY" '{
        "message": "NIP85 directory validation failed",
        "error": "directory_not_found",
        "directory_path": "'"$BRAINSTORM_NIP85_DIR"'",
        "phase": "initialization_and_validation",
        "algorithm": "nip85_publishing",
        "scope": "owner"
    }'
    exit 1
fi

# Make sure the scripts are executable
chmod +x ${BRAINSTORM_NIP85_DIR}/publish_kind30382.js

# Emit structured event for Phase 1 completion and Phase 2 start
emit_task_event "PROGRESS" "exportOwnerKind30382" "$BRAINSTORM_OWNER_PUBKEY" '{
    "message": "Phase 1 completed, starting Phase 2: NIP-85 event publishing",
    "phase": "nip85_event_publishing",
    "step": "phase_2_start",
    "algorithm": "nip85_publishing",
    "protocol": "NIP-85",
    "event_type": "kind_30382",
    "child_script": "publish_kind30382.js",
    "directory_validated": true,
    "script_permissions_set": true,
    "scope": "owner"
}'

echo "$(date): Continuing publishNip85 ... calling script to publish kind 30382 events"
echo "$(date): Continuing publishNip85 ... calling script to publish kind 30382 events" >> ${BRAINSTORM_LOG_DIR}/publishNip85.log

# Emit structured event for Node.js script execution start
emit_task_event "PROGRESS" "exportOwnerKind30382" "$BRAINSTORM_OWNER_PUBKEY" '{
    "message": "Executing Node.js script for kind 30382 event publishing",
    "phase": "nip85_event_publishing",
    "step": "nodejs_script_execution",
    "algorithm": "nip85_publishing",
    "protocol": "NIP-85",
    "event_type": "kind_30382",
    "child_script": "publish_kind30382.js",
    "target_relay": "BRAINSTORM_RELAY_URL",
    "filter_criteria": "hops_not_null_and_less_than_20",
    "scope": "owner"
}'

# Publish all kind 30382 events to BRAINSTORM_RELAY_URL
# The script will publish events only for NostrUsers whose hops parameter is not null and is less than 20
node ${BRAINSTORM_NIP85_DIR}/publish_kind30382.js
RESULT_30382=$?

# Emit structured event for Phase 3 start
emit_task_event "PROGRESS" "exportOwnerKind30382" "$BRAINSTORM_OWNER_PUBKEY" '{
    "message": "Starting Phase 3: Error handling and completion",
    "phase": "error_handling_and_completion",
    "step": "phase_3_start",
    "algorithm": "nip85_publishing",
    "nodejs_exit_code": '"$RESULT_30382"',
    "scope": "owner"
}'

if [ $RESULT_30382 -ne 0 ]; then
    echo "Error: Failed to publish kind 30382 events"
    echo "$(date): Error: Failed to publish kind 30382 events" >> ${BRAINSTORM_LOG_DIR}/publishNip85.log
    
    # Emit structured event for publishing error
    emit_task_event "TASK_ERROR" "exportOwnerKind30382" "$BRAINSTORM_OWNER_PUBKEY" '{
        "message": "Failed to publish kind 30382 events",
        "error": "nodejs_script_failure",
        "exit_code": '"$RESULT_30382"',
        "child_script": "publish_kind30382.js",
        "phase": "nip85_event_publishing",
        "algorithm": "nip85_publishing",
        "protocol": "NIP-85",
        "scope": "owner"
    }'
    exit 1
fi

# Emit structured event for successful completion
emit_task_event "TASK_END" "exportOwnerKind30382" "$BRAINSTORM_OWNER_PUBKEY" '{
    "message": "Owner-level NIP-85 event publishing completed successfully",
    "status": "success",
    "task_type": "owner_export",
    "algorithm": "nip85_publishing",
    "protocol": "NIP-85",
    "event_type": "kind_30382",
    "phases_completed": ["initialization_and_validation", "nip85_event_publishing", "error_handling_and_completion"],
    "child_script": "publish_kind30382.js",
    "nodejs_exit_code": '"$RESULT_30382"',
    "target_relay": "BRAINSTORM_RELAY_URL",
    "trust_data": "web_of_trust_scores",
    "filter_criteria": "hops_not_null_and_less_than_20",
    "category": "export",
    "scope": "owner",
    "parent_task": "processAllTasks"
}'

echo "$(date): Finished publishNip85"
echo "$(date): Finished publishNip85" >> ${BRAINSTORM_LOG_DIR}/publishNip85.log

exit 0
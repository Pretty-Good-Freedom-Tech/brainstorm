#!/bin/bash
set -e          # Exit immediately on command failure
set -o pipefail # Fail if any pipeline command fails

source /etc/brainstorm.conf

# Source structured logging utilities
source "${BRAINSTORM_MODULE_BASE_DIR}/src/utils/structuredLogging.sh"

touch ${BRAINSTORM_LOG_DIR}/syncWoT.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/syncWoT.log

# relay="wot.brainstorm.social"
# relay="relay.hasenpfeffr.com"
# relay="profiles.nostr1.com"
relay="wot.grapevine.network"

# Emit structured event for task start
oMetadata=$(jq -n \
    --arg description "Web of Trust data synchronization from relays" \
    --arg target_relay "$relay" \
    '{
        "description": $description,
        "target_relay": $target_relay
    }')
emit_task_event "TASK_START" "syncWoT" "system" "$oMetadata"

echo "$(date): Starting syncWoT"
echo "$(date): Starting syncWoT" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log

sudo strfry sync wss://$relay --filter '{"kinds": [0, 3, 1984, 10000, 30000, 38000, 38172, 38173]}' --dir down

echo "$(date): Finished syncWoT"
echo "$(date): Finished syncWoT" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log

# Emit structured event for task completion
oMetadata=$(jq -n \
    --arg message "Web of Trust synchronization completed successfully" \
    '{
        "message": $message
    }')
emit_task_event "TASK_END" "syncWoT" "system" "$oMetadata"

exit 0  # Explicit success exit code for parent script orchestration

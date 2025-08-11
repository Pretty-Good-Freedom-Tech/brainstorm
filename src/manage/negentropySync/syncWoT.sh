#!/bin/bash
set -e          # Exit immediately on command failure
set -o pipefail # Fail if any pipeline command fails

source /etc/brainstorm.conf

# Source structured logging utilities
source "${BRAINSTORM_MODULE_BASE_DIR}/src/utils/structuredLogging.sh"

touch ${BRAINSTORM_LOG_DIR}/syncWoT.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/syncWoT.log

# Emit structured event for task start
emit_task_event "TASK_START" "syncWoT" "system" '{
    "description": "Web of Trust data synchronization from relays",
    "target_relays": ["relay.hasenpfeffr.com"],
    "filter_kinds": [3, 1984, 10000, 30000, 38000, 38172, 38173],
    "sync_direction": "down"
}'

echo "$(date): Starting syncWoT; first with relay.hasenpfeffr.com, then with wot.brainstorm.social"
echo "$(date): Starting syncWoT; first with relay.hasenpfeffr.com, then with wot.brainstorm.social" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log

# Emit progress event for sync initialization
emit_task_event "PROGRESS" "syncWoT" "system" '{
    "phase": "initialization",
    "step": "setup_complete",
    "message": "Logging initialized, starting relay synchronization"
}'

# Emit progress event for relay sync start
emit_task_event "PROGRESS" "syncWoT" "system" '{
    "phase": "relay_sync",
    "step": "sync_hasenpfeffr",
    "relay": "relay.hasenpfeffr.com",
    "message": "Starting synchronization with relay.hasenpfeffr.com"
}'

sudo strfry sync wss://relay.hasenpfeffr.com --filter '{"kinds":[3, 1984, 10000, 30000, 38000, 38172, 38173]}' --dir down
# wss://relay.hasenpfeffr.com 
# wss://wot.brainstorm.social
# wss://profiles.nostr1.com

echo "$(date): Completed syncWoT with relay.hasenpfeffr.com"
echo "$(date): Completed syncWoT with relay.hasenpfeffr.com" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log

# Emit progress event for relay sync completion
emit_task_event "PROGRESS" "syncWoT" "system" '{
    "phase": "relay_sync",
    "step": "sync_hasenpfeffr_complete",
    "relay": "relay.hasenpfeffr.com",
    "message": "Completed synchronization with relay.hasenpfeffr.com"
}'

# for some reason, it hangs when I try to sync with wot.brainstorm.social
# sudo strfry sync wss://wot.brainstorm.social --filter '{"kinds":[3, 1984, 10000, 30000, 38000, 38172, 38173]}' --dir down

# echo "$(date): Completed syncWoT with wot.brainstorm.social"
# echo "$(date): Completed syncWoT with wot.brainstorm.social" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log

echo "$(date): Finished syncWoT"
echo "$(date): Finished syncWoT" >> ${BRAINSTORM_LOG_DIR}/syncWoT.log

# Emit structured event for task completion
emit_task_event "TASK_END" "syncWoT" "system" '{
    "phases_completed": 2,
    "relays_synced": ["relay.hasenpfeffr.com"],
    "sync_direction": "down",
    "filter_kinds": [3, 1984, 10000, 30000, 38000, 38172, 38173],
    "status": "success",
    "message": "Web of Trust synchronization completed successfully"
}'
exit 0  # Explicit success exit code for parent script orchestration

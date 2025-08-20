#!/bin/bash
set -e          # Exit immediately on command failure
set -o pipefail # Fail if any pipeline command fails

source /etc/brainstorm.conf

# Source structured logging utilities
source "${BRAINSTORM_MODULE_BASE_DIR}/src/utils/structuredLogging.sh"

touch ${BRAINSTORM_LOG_DIR}/syncProfiles.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/syncProfiles.log

# Emit structured event for task start
emit_task_event "TASK_START" "syncProfiles" "system" '  {
    "description": "Profiles data synchronization from relays",
    "target_relays": ["profiles.nostr1.com"],
    "filter_kinds": [0],
    "sync_direction": "down"
}'

echo "$(date): Starting syncProfiles"
echo "$(date): Starting syncProfiles" >> ${BRAINSTORM_LOG_DIR}/syncProfiles.log

sudo strfry sync wss://profiles.nostr1.com --filter '{"kinds":[0]}' --dir down

echo "$(date): Finished syncProfiles"
echo "$(date): Finished syncProfiles" >> ${BRAINSTORM_LOG_DIR}/syncProfiles.log

# Emit progress event for relay sync completion
emit_task_event "PROGRESS" "syncProfiles" "system" '{
    "phase": "relay_sync",
    "step": "sync_profiles_complete",
    "relay": "profiles.nostr1.com",
    "message": "Completed synchronization with profiles.nostr1.com"
}'

exit 0  # Explicit success exit code for parent script orchestration


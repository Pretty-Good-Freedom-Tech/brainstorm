#!/bin/bash

CONFIG_FILE="/etc/brainstorm.conf"
source "$CONFIG_FILE" # BRAINSTORM_MODULE_PIPELINE_DIR

# Source structured logging utility
source "${BRAINSTORM_MODULE_BASE_DIR}/src/utils/structuredLogging.sh"

touch ${BRAINSTORM_LOG_DIR}/callBatchTransferIfNeeded.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/callBatchTransferIfNeeded.log

echo "$(date): Starting callBatchTransferIfNeeded"
echo "$(date): Starting callBatchTransferIfNeeded" >> ${BRAINSTORM_LOG_DIR}/callBatchTransferIfNeeded.log

# Start structured logging
emit_task_event "TASK_START" "callBatchTransferIfNeeded" \
    "system" \
    "description=Checking if batch transfer is needed and executing conditionally"

# First, determine from BRAINSTORM_LOG_DIR/batchTransfer.log whether a transfer is needed
# if transfer is needed, run transfer.sh
# For now, just check whether a batch transfer has been completed at least once.
# TODO: a more robust method of determining whether a batch transfer is needed
# e.g., compare number of kind 3 events in strfry with data in neo4j
# neo4j query: fetch number of NostrUsers with a valid kind3EventId

emit_task_event "PROGRESS" "callBatchTransferIfNeeded" \
    "system" \
    "phase=decision" \
    "step=check_log" \
    "description=Checking batchTransfer.log to determine if transfer is needed"

batchTransferCompleted=$(cat ${BRAINSTORM_LOG_DIR}/batchTransfer.log | grep "Finished batchTransfer")
if [ -z "${batchTransferCompleted}" ]; then
    emit_task_event "PROGRESS" "callBatchTransferIfNeeded" \
        "system" \
        "phase=execution" \
        "step=transfer_needed" \
        "action=starting_batch_transfer" \
        "description=Batch transfer needed, executing transfer.sh"
    
    echo "$(date): Continuing callBatchTransferIfNeeded ... starting batch/transfer.sh"
    echo "$(date): Continuing callBatchTransferIfNeeded ... starting batch/transfer.sh" >> ${BRAINSTORM_LOG_DIR}/callBatchTransferIfNeeded.log
    sudo $BRAINSTORM_MODULE_PIPELINE_DIR/batch/transfer.sh
    echo "$(date): Continuing callBatchTransferIfNeeded ... batch/transfer.sh completed"
    echo "$(date): Continuing callBatchTransferIfNeeded ... batch/transfer.sh completed" >> ${BRAINSTORM_LOG_DIR}/callBatchTransferIfNeeded.log
    
    emit_task_event "PROGRESS" "callBatchTransferIfNeeded" \
        "system" \
        "phase=execution" \
        "step=transfer_completed" \
        "action=batch_transfer_finished" \
        "description=Batch transfer execution completed successfully"
else
    emit_task_event "PROGRESS" "callBatchTransferIfNeeded" \
        "system" \
        "phase=execution" \
        "step=transfer_skipped" \
        "action=no_transfer_needed" \
        "description=Batch transfer not needed, skipping execution"
    
    echo "$(date): Continuing callBatchTransferIfNeeded ... batch/transfer.sh not needed"
    echo "$(date): Continuing callBatchTransferIfNeeded ... batch/transfer.sh not needed" >> ${BRAINSTORM_LOG_DIR}/callBatchTransferIfNeeded.log
fi

echo "$(date): Finished callBatchTransferIfNeeded"
echo "$(date): Finished callBatchTransferIfNeeded" >> ${BRAINSTORM_LOG_DIR}/callBatchTransferIfNeeded.log

# End structured logging
emit_task_event "TASK_END" "callBatchTransferIfNeeded" \
    "system" \
    "phases_completed=2" \
    "transfer_executed=$([ -z \"${batchTransferCompleted}\" ] && echo \"true\" || echo \"false\")" \
    "status=success" \
    "description=Batch transfer conditional execution completed"
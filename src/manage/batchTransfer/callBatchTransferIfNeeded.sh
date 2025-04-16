#!/bin/bash

CONFIG_FILE="/etc/brainstorm.conf"
source "$CONFIG_FILE" # BRAINSTORM_MODULE_PIPELINE_DIR

touch ${BRAINSTORM_LOG_DIR}/callBatchTransferIfNeeded.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/callBatchTransferIfNeeded.log

echo "$(date): Starting callBatchTransferIfNeeded"
echo "$(date): Starting callBatchTransferIfNeeded" >> ${BRAINSTORM_LOG_DIR}/callBatchTransferIfNeeded.log

# First, determine from BRAINSTORM_LOG_DIR/batchTransfer.log whether a transfer is needed
# if transfer is needed, run transfer.sh
# For now, just check whether a batch transfer has been completed at least once.
# TODO: a more robust method of determining whether a batch transfer is needed
# e.g., compare number of kind 3 events in strfry with data in neo4j
# neo4j query: fetch number of NostrUsers with a valid kind3EventId

batchTransferCompleted=$(cat ${BRAINSTORM_LOG_DIR}/batchTransfer.log | grep "Finished batchTransfer")
if [ -z "${batchTransferCompleted}" ]; then
    echo "$(date): Continuing callBatchTransferIfNeeded ... starting batch/transfer.sh"
    echo "$(date): Continuing callBatchTransferIfNeeded ... starting batch/transfer.sh" >> ${BRAINSTORM_LOG_DIR}/callBatchTransferIfNeeded.log
    sudo $BRAINSTORM_MODULE_PIPELINE_DIR/batch/transfer.sh
    echo "$(date): Continuing callBatchTransferIfNeeded ... batch/transfer.sh completed"
    echo "$(date): Continuing callBatchTransferIfNeeded ... batch/transfer.sh completed" >> ${BRAINSTORM_LOG_DIR}/callBatchTransferIfNeeded.log
else
    echo "$(date): Continuing callBatchTransferIfNeeded ... batch/transfer.sh not needed"
    echo "$(date): Continuing callBatchTransferIfNeeded ... batch/transfer.sh not needed" >> ${BRAINSTORM_LOG_DIR}/callBatchTransferIfNeeded.log
fi

echo "$(date): Finished callBatchTransferIfNeeded"
echo "$(date): Finished callBatchTransferIfNeeded" >> ${BRAINSTORM_LOG_DIR}/callBatchTransferIfNeeded.log
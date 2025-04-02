#!/bin/bash

CONFIG_FILE="/etc/hasenpfeffr.conf"
source "$CONFIG_FILE" # HASENPFEFFR_MODULE_PIPELINE_DIR

touch ${HASENPFEFFR_LOG_DIR}/callBatchTransferIfNeeded.log
sudo chown hasenpfeffr:hasenpfeffr ${HASENPFEFFR_LOG_DIR}/callBatchTransferIfNeeded.log

echo "$(date): Starting callBatchTransferIfNeeded"
echo "$(date): Starting callBatchTransferIfNeeded" >> ${HASENPFEFFR_LOG_DIR}/callBatchTransferIfNeeded.log

# First, determine from HASENPFEFFR_LOG_DIR/batchTransfer.log whether a transfer is needed
# if transfer is needed, run transfer.sh
# For now, just check whether a batch transfer has been completed at least once.
# TODO: a more robust method of determining whether a batch transfer is needed
# e.g., compare number of kind 3 events in strfry with data in neo4j
# neo4j query: fetch number of NostrUsers with a valid kind3EventId

batchTransferCompleted=$(cat ${HASENPFEFFR_LOG_DIR}/batchTransfer.log | grep "Finished batchTransfer")
if [ -z "${batchTransferCompleted}" ]; then
    echo "$(date): Continuing callBatchTransferIfNeeded ... starting batch/transfer.sh"
    echo "$(date): Continuing callBatchTransferIfNeeded ... starting batch/transfer.sh" >> ${HASENPFEFFR_LOG_DIR}/callBatchTransferIfNeeded.log
    sudo $HASENPFEFFR_MODULE_PIPELINE_DIR/batch/transfer.sh
    echo "$(date): Continuing callBatchTransferIfNeeded ... batch/transfer.sh completed"
    echo "$(date): Continuing callBatchTransferIfNeeded ... batch/transfer.sh completed" >> ${HASENPFEFFR_LOG_DIR}/callBatchTransferIfNeeded.log
else
    echo "$(date): Continuing callBatchTransferIfNeeded ... batch/transfer.sh not needed"
    echo "$(date): Continuing callBatchTransferIfNeeded ... batch/transfer.sh not needed" >> ${HASENPFEFFR_LOG_DIR}/callBatchTransferIfNeeded.log
fi

echo "$(date): Finished callBatchTransferIfNeeded"
echo "$(date): Finished callBatchTransferIfNeeded" >> ${HASENPFEFFR_LOG_DIR}/callBatchTransferIfNeeded.log
#!/bin/bash

CONFIG_FILE="/etc/brainstorm.conf"
source "$CONFIG_FILE" # BRAINSTORM_MODULE_PIPELINE_DIR

touch ${BRAINSTORM_LOG_DIR}/callBatchTransfer.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/callBatchTransfer.log

echo "$(date): Starting callBatchTransfer"
echo "$(date): Starting callBatchTransfer" >> ${BRAINSTORM_LOG_DIR}/callBatchTransfer.log

echo "$(date): Continuing callBatchTransfer ... starting batch/transfer.sh"
echo "$(date): Continuing callBatchTransfer ... starting batch/transfer.sh" >> ${BRAINSTORM_LOG_DIR}/callBatchTransfer.log
sudo $BRAINSTORM_MODULE_PIPELINE_DIR/batch/transfer.sh
echo "$(date): Continuing callBatchTransfer ... batch/transfer.sh completed"
echo "$(date): Continuing callBatchTransfer ... batch/transfer.sh completed" >> ${BRAINSTORM_LOG_DIR}/callBatchTransfer.log

echo "$(date): Finished callBatchTransfer"
echo "$(date): Finished callBatchTransfer" >> ${BRAINSTORM_LOG_DIR}/callBatchTransfer.log
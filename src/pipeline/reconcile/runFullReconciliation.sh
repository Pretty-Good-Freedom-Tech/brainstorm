#!/bin/bash

# This should be put on a timer and run periodically.
# Hopefully, all kind 3 events will be processed by the streaming pipeline service, 
# and few if any will require processing by the reconciliation pipeline.
# TODO: create a log file of pubkeys, event ids that are processed by this service to aid
# detection of any patterns that could cause events to fail incorporation by the streaming service.

source /etc/hasenpfeffr.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, HASENPFEFFR_OWNER_PUBKEY, HASENPFEFFR_LOG_DIR, HASENPFEFFR_MODULE_ALGOS_DIR

touch ${HASENPFEFFR_LOG_DIR}/runFullReconciliation.log
sudo chown hasenpfeffr:hasenpfeffr ${HASENPFEFFR_LOG_DIR}/runFullReconciliation.log

echo "$(date): Starting runFullReconciliation" 
echo "$(date): Starting runFullReconciliation" >> ${HASENPFEFFR_LOG_DIR}/runFullReconciliation.log

echo "$(date): Continuing runFullReconciliation ... starting createReconciliationQueue"
echo "$(date): Continuing runFullReconciliation ... starting createReconciliationQueue" >> ${HASENPFEFFR_LOG_DIR}/runFullReconciliation.log

sudo node ${HASENPFEFFR_MODULE_PIPELINE_DIR}/reconcile/createReconciliationQueue.js

echo "$(date): Continuing runFullReconciliation ... finished createReconciliationQueue, starting processReconciliationQueue"
echo "$(date): Continuing runFullReconciliation ... finished createReconciliationQueue, starting processReconciliationQueue" >> ${HASENPFEFFR_LOG_DIR}/runFullReconciliation.log

sudo node ${HASENPFEFFR_MODULE_PIPELINE_DIR}/reconcile/processReconciliationQueue.js

echo "$(date): Continuing runFullReconciliation ... finished processReconciliationQueue"
echo "$(date): Continuing runFullReconciliation ... finished processReconciliationQueue" >> ${HASENPFEFFR_LOG_DIR}/runFullReconciliation.log

echo "finished runFullReconciliation"
echo "$(date): Finished runFullReconciliation" >> ${HASENPFEFFR_LOG_DIR}/runFullReconciliation.log
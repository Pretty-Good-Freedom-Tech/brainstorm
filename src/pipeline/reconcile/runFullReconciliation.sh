#!/bin/bash

# This should be put on a timer and run periodically.
# Hopefully, all kind 3 events will be processed by the streaming pipeline service, 
# and few if any will require processing by the reconciliation pipeline.
# TODO: create a log file of pubkeys, event ids that are processed by this service to aid
# detection of any patterns that could cause events to fail incorporation by the streaming service.

source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, BRAINSTORM_OWNER_PUBKEY, BRAINSTORM_LOG_DIR, BRAINSTORM_MODULE_ALGOS_DIR

touch ${BRAINSTORM_LOG_DIR}/runFullReconciliation.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/runFullReconciliation.log

echo "$(date): Starting runFullReconciliation" 
echo "$(date): Starting runFullReconciliation" >> ${BRAINSTORM_LOG_DIR}/runFullReconciliation.log

echo "$(date): Continuing runFullReconciliation ... starting createReconciliationQueue"
echo "$(date): Continuing runFullReconciliation ... starting createReconciliationQueue" >> ${BRAINSTORM_LOG_DIR}/runFullReconciliation.log

sudo node ${BRAINSTORM_MODULE_PIPELINE_DIR}/reconcile/createReconciliationQueue.js

echo "$(date): Continuing runFullReconciliation ... finished createReconciliationQueue, starting processReconciliationQueue"
echo "$(date): Continuing runFullReconciliation ... finished createReconciliationQueue, starting processReconciliationQueue" >> ${BRAINSTORM_LOG_DIR}/runFullReconciliation.log

sudo node ${BRAINSTORM_MODULE_PIPELINE_DIR}/reconcile/processReconciliationQueue.js

echo "$(date): Continuing runFullReconciliation ... finished processReconciliationQueue"
echo "$(date): Continuing runFullReconciliation ... finished processReconciliationQueue" >> ${BRAINSTORM_LOG_DIR}/runFullReconciliation.log

echo "finished runFullReconciliation"
echo "$(date): Finished runFullReconciliation" >> ${BRAINSTORM_LOG_DIR}/runFullReconciliation.log
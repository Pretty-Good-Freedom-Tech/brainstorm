#!/bin/bash

# This should be put on a timer and run periodically.
# Hopefully, all kind 3 events will be processed by the streaming pipeline service, 
# and few if any will require processing by the reconciliation pipeline.
# TODO: create a log file of pubkeys, event ids that are processed by this service to aid
# detection of any patterns that could cause events to fail incorporation by the streaming service.

echo "Initiating full reconciliation of strfry and neo4j (currently kind 3 only) ..."

echo "Reconciliation: initiating creation og queue of pubkeys that require processing ..."

sudo node /usr/local/lib/node_modules/hasenpfeffr/src/pipeline/reconcile/createReconciliationQueue.js

echo "Reconciliation: initiating processing of queue ..."

sudo node /usr/local/lib/node_modules/hasenpfeffr/src/pipeline/reconcile/processReconciliationQueue.js

echo "Completed full reconciliation of strfry and neo4j."
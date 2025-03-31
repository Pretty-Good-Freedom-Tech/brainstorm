## Pipeline from strfry to Neo4j

The strfry to Neo4j extract, transform, load (ETL) pipeline consists of three modules:

1. Batch: `src/pipeline/batch`, used for loading data in batch. This should create 200 to 300 thousand NostrUser nodes and approximately 8 million FOLLOWS, MUTES, and REPORTS relationships. Typically run only once at installation but can be re-run as desired.
2. Streaming: `src/pipeline/stream`, used for real-time processing of new events. This is managed by systemd services listed below (strfry-router, addToQueue, and processQueue). Typically, this will run indefinitely, processing updates to FOLLOWS and new MUTES and REPORTS as they arrive, usually on the order of 3 to 5 per minute. 
3. Reconciliation: `src/pipeline/reconcile`, used to fix any data mismatches between strfry and Neo4j. This is managed by the systemd service `reconcile.timer`
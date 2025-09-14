# Populating Databases: Strfry and Neo4j

Once you have initialized Brainstorm, your next step is to populate it with data. These instructions may change as these become automated.

## Populating Strfry

As of 3 Sep 2025 there are over 3 million events, and downloading them all takes time (hours). Obviously this will go faster if you are part of a smaller nostr community than the "main" one.

First, check whether there are any events in Strfry:

```bash
sudo strfry scan --count '{}'
```

Then populate events using negentropy. Brainstorm maintains a relay: `wss://wot.grapevine.network`, which maintains open connections to all the major relays known to us, so syncing with just this relay ought to be sufficient. Obviously you can use whatever relay or set of relays you want.  

### Option 1: command line

```bash
sudo strfry sync wss://wot.grapevine.network --filter '{"kinds": [0, 3, 1984, 10000, 30000, 38000, 38172, 38173]}' --dir down
```

### Option 2: run script

```bash
cd /usr/local/lib/node_modules/brainstorm/src/manage/negentropySync
sudo -u brainstorm bash ./syncWoT.sh
```

### Option 3: Front end

Go to the Task Explorer and run the syncWoT task.

## Populating Neo4j

### Step 1: Verify constraints and indexes

Check your Neo4j instance and determine whether constraints and indexes have been set. If not, or if you're not sure, then go to the Task Explorer and run the `neo4jConstraintsAndIndexes` task, which will populate them. 

### Step 1: Batch import events

Go to the Task Explorer and run the `callBatchTransfer` task. If you're not sure whether this has been run, you can run the `callBatchTransferIfNeeded` task which will run the `callBatchTransfer` task only if it hasn't been run yet.

This step will take a long time (hours) to complete. You can monitor its progress in the Neo4j browser as nodes and relationships are created. (Won't see anything at first, as the task indexes available strfry events.)

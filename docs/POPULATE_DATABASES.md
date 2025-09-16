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

Go to the Task Explorer: Card View and run the syncWoT task. Monitor its progress in the Log Data View.

## Populating Neo4j

### Step 1: Verify constraints and indexes

Check your Neo4j browser (e.g. `http://alice.brainstorm.social:7474`) and determine whether constraints and indexes have been set. You should see them on the left under Database Information. ALternatively, you can run `show constraints` and `show indexes` at the top of the browser. If you don't see them, or if you're not sure, then go to the Task Explorer and run the `neo4jConstraintsAndIndexes` task, which will populate them. 

### Step 2: Batch import events

Go to Task Explorer: Card View and run the `callBatchTransfer` task. If you're not sure whether this has been run, you can run the `callBatchTransferIfNeeded` task which will run the `callBatchTransfer` task only if it hasn't been run yet.

This step will take a long time (hours) to complete. You can monitor its progress in the Neo4j browser as nodes and relationships are created. (Won't see anything at first, because the task first needs to index available strfry events.)

To verify that callBatchTransfer has completed:
- In the Neo4j browser, the number of nodes and relationships is no longer increasing. Assuming you synced with the default relays during the syncWoT step, you should have about 1.7 million nodes and 19 million relationships (as of Sep 2025).
- In the Task Explorer: Log Data View under the Status column, all tasks should show `Last: Success` rather than `Running`.




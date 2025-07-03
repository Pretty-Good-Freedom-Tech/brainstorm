# Reconciliation

Reconcile the Neo4j database with the Strfry database by updating the relationships that have changed.

## Motivation

Currently, I keep the Neo4j database synchronized with the Strfry database by deleting all existing Neo4j relationships and re-running the script that populates Neo4j with NostrUsers and their relationships. This requires the repeated deletion and re-insertion of approximately 12 million relationships. Unfortunately, this is causing frequent crashes of the No4j database, likely due to memory issues. The reconciliation process is designed to cause less strain on the Neo4j database by only updating the relationships that have changed. On nostr, users can unfollow and unmute but they cannot delete their reports. Therefore, the reconciliation process will require adding new FOLLOWS, MUTES, and REPORTS, as well as deleting deprecated FOLLOWS and MUTES. REPORTS will not need to be deleted.

## Process

1. Create object called: currentRelationships_neo4j
For each NostrUser in the database, determine all relationships originating with that user and create three lists:
- follows
- mutes
- reports
Create a list of all NostrUsers who originate one or more relationships in Neo4j.

2. Create object called: currentRelationships_strfry
For each NostrUser in the database, determine all relationships originating with that user and create three lists:
- follows (based on kind 3 events)
- mutes (based on kind 10000 events)
- reports (based on kind 1984 events)
Create a list of all pubkeys who author events that give rise to one or more relationships in Strfry.

3. Compare the two objects and create csv files for each of the following 6 pieces of information:
- NostrUsersToCreate.csv: new NostrUser nodes that should be added to Neo4j
- FollowsToCreate.csv: follows that should be added to Neo4j
- FollowsToDestroy.csv: follows that should be removed from Neo4j
- MutesToCreate.csv: mutes that should be added to Neo4j
- MutesToDestroy.csv: mutes that should be removed from Neo4j
- ReportsToCreate.csv: reports that should be added to Neo4j
Each csv file will be used to update the Neo4j database via an iterative APOC procedures.

4. Update the Neo4j database via APOC procedures:
- process NostrUsersToCreate.csv
- process FollowsToCreate.csv
- process FollowsToDestroy.csv
- process MutesToCreate.csv
- process MutesToDestroy.csv
- process ReportsToCreate.csv

Logging:
- log the number of NostrUsers in the Neo4j database
- log the number of kind 0 events in the Strfry database
- log the total number of follows, mutes, and reports in the Neo4j database
- log the total number of follows, mutes, and reports in the Strfry database
- log the number of follows that should be added to Neo4j
- log the number of follows that should be removed from Neo4j
- log the number of mutes that should be added to Neo4j
- log the number of mutes that should be removed from Neo4j
- log the number of reports that should be added to Neo4j
- Log the time when each stage of the reconciliation process started and ended
- To debug any potential Neo4j crashes or memory problems, log all relevant metrics to monitor the health of the instance.

# Location of files
- scripts will be located in src/pipeline/reconciliation
- apocCypherCommands will be located in src/pipeline/reconciliation/apocCypherCommands
- currentRelationships will be located in src/pipeline/reconciliation/currentRelationships (or should these be kept in memory?)
- csv files will be located in src/pipeline/reconciliation/csv
- logs will be located in /var/log/brainstorm/reconciliation.log





// Optimized Neo4j data loading using LOAD CSV with efficient batch processing
// This script uses parameters for file paths: nodesFile, relsFile, eventsFile

// Step 1: Create schema constraints and indexes if they don't exist
CREATE CONSTRAINT IF NOT EXISTS FOR (u:NostrUser) REQUIRE u.pubkey IS UNIQUE;
// CREATE INDEX IF NOT EXISTS FOR ()-[:FOLLOWS]->() ON (RELATIONSHIP);

// Step 2: Load nodes in batches using apoc.periodic.iterate
CALL apoc.periodic.iterate(
    "LOAD CSV WITH HEADERS FROM 'file:///" + $NODES_FILE + "' AS row RETURN row",
    "MERGE (u:NostrUser {pubkey: row.pubkey})",
    {batchSize: 5000, parallel: true, retries: 3}
);

// Step 3: Load relationships in batches using apoc.periodic.iterate
CALL apoc.periodic.iterate(
    "LOAD CSV WITH HEADERS FROM 'file:///" + $RELS_FILE + "' AS row RETURN row",
    "MATCH (source:NostrUser {pubkey: row.`:START_ID`})
     MATCH (target:NostrUser {pubkey: row.`:END_ID`})
     MERGE (source)-[r:FOLLOWS]->(target)",
    {batchSize: 5000, parallel: false, retries: 3}
);

// Step 4: Update event properties in batches using apoc.periodic.iterate
CALL apoc.periodic.iterate(
    "LOAD CSV WITH HEADERS FROM 'file:///" + $EVENTS_FILE + "' AS row RETURN row",
    "MATCH (u:NostrUser {pubkey: row.pubkey})
     SET u.kind3EventId = row.eventId,
         u.kind3CreatedAt = toInteger(row.createdAt)",
    {batchSize: 5000, parallel: true, retries: 3}
);

// Step 5: Optimize the database after bulk loading
// Show indexes (using the correct procedure name for your Neo4j version)
CALL db.schema.visualization();

// Report statistics
MATCH (n:NostrUser) RETURN count(n) AS NodeCount;
MATCH ()-[r:FOLLOWS]->() RETURN count(r) AS RelationshipCount;

// Optimized Neo4j data loading using LOAD CSV with efficient batch processing
// This script uses parameters for file paths: nodesFile, relsFile, eventsFile

// Step 1: Create schema constraints and indexes if they don't exist
CREATE CONSTRAINT IF NOT EXISTS FOR (u:NostrUser) REQUIRE u.pubkey IS UNIQUE;
CREATE INDEX IF NOT EXISTS FOR ()-[:FOLLOWS]->() ON (RELATIONSHIP);

// Step 2: Load nodes in batches with periodic commit
:auto USING PERIODIC COMMIT 10000
LOAD CSV WITH HEADERS FROM 'file:///' + $nodesFile AS row
MERGE (u:NostrUser {pubkey: row.pubkey});

// Step 3: Load relationships in batches with periodic commit
:auto USING PERIODIC COMMIT 10000
LOAD CSV WITH HEADERS FROM 'file:///' + $relsFile AS row
MATCH (source:NostrUser {pubkey: row.`:START_ID`})
MATCH (target:NostrUser {pubkey: row.`:END_ID`})
MERGE (source)-[r:FOLLOWS]->(target);

// Step 4: Update event properties in batches
:auto USING PERIODIC COMMIT 10000
LOAD CSV WITH HEADERS FROM 'file:///' + $eventsFile AS row
MATCH (u:NostrUser {pubkey: row.pubkey})
SET u.kind3EventId = row.eventId,
    u.kind3CreatedAt = toInteger(row.createdAt);

// Step 5: Optimize the database after bulk loading
CALL db.indexes();
CALL db.awaitIndexes(300);
CALL apoc.periodic.commit("
MATCH (n:NostrUser)
WITH n LIMIT 10000
RETURN count(*)
", {});

// Report statistics
MATCH (n:NostrUser) RETURN count(n) AS NodeCount;
MATCH ()-[r:FOLLOWS]->() RETURN count(r) AS RelationshipCount;

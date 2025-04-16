#!/bin/bash

# Script to process different types of Nostr events and update relationships in Neo4j
# Handles kind 3 (FOLLOWS), kind 10000 (MUTES), and kind 1984 (REPORTS) events

source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

# Change to the directory containing the script
cd /usr/local/lib/node_modules/brainstorm/src/pipeline/batch/

# Process each event kind
process_event_kind() {
    local EVENT_KIND=$1
    local RELATIONSHIP_TYPE=$2
    
    echo "Processing kind $EVENT_KIND events for $RELATIONSHIP_TYPE relationships..."
    
    # Extract events of the specified kind from strfry
    echo "Extracting kind $EVENT_KIND events from strfry..."
    sudo strfry scan "{ \"kinds\": [$EVENT_KIND]}" > allKind${EVENT_KIND}EventsStripped.json
    
    # Process events to extract relationships
    echo "Processing kind $EVENT_KIND events to extract $RELATIONSHIP_TYPE relationships..."
    node eventsToRelationships.js $EVENT_KIND allKind${EVENT_KIND}EventsStripped.json ${RELATIONSHIP_TYPE}ToAddToNeo4j.json
    
    # Move files to Neo4j import directory
    echo "Moving files to Neo4j import directory..."
    sudo mv ${RELATIONSHIP_TYPE}ToAddToNeo4j.json /var/lib/neo4j/import/${RELATIONSHIP_TYPE}ToAddToNeo4j.json
    sudo mv allKind${EVENT_KIND}EventsStripped.json /var/lib/neo4j/import/allKind${EVENT_KIND}EventsStripped.json
    sudo chown neo4j:neo4j /var/lib/neo4j/import/${RELATIONSHIP_TYPE}ToAddToNeo4j.json
    sudo chown neo4j:neo4j /var/lib/neo4j/import/allKind${EVENT_KIND}EventsStripped.json
    
    # Create Cypher query file for this relationship type
    echo "Creating Cypher query for $RELATIONSHIP_TYPE relationships..."
    cat > ${RELATIONSHIP_TYPE}CypherCommand.cypher << EOF
// First create all nodes in a separate transaction
CALL apoc.periodic.iterate(
    "CALL apoc.load.json('file:///${RELATIONSHIP_TYPE}ToAddToNeo4j.json') YIELD value AS line RETURN DISTINCT line.pk_author AS pubkey",
    "MERGE (u:NostrUser {pubkey: pubkey})",
    {batchSize:500, parallel:false, retries:3}
);

// Then create all target nodes in a separate transaction
CALL apoc.periodic.iterate(
    "CALL apoc.load.json('file:///${RELATIONSHIP_TYPE}ToAddToNeo4j.json') YIELD value AS line RETURN DISTINCT line.pk_target AS pubkey",
    "MERGE (u:NostrUser {pubkey: pubkey})",
    {batchSize:500, parallel:false, retries:3}
);

// Finally create the relationships with smaller batches and retries
CALL apoc.periodic.iterate(
    "CALL apoc.load.json('file:///${RELATIONSHIP_TYPE}ToAddToNeo4j.json') YIELD value AS line",
    "
    MATCH (u1:NostrUser {pubkey:line.pk_author})
    MATCH (u2:NostrUser {pubkey:line.pk_target})
    MERGE (u1)-[r:$RELATIONSHIP_TYPE]->(u2)
    SET r.timestamp = line.timestamp
    ",
    {batchSize:250, parallel:false, retries:5}
);

// Update metadata for users
CALL apoc.periodic.iterate(
    "CALL apoc.load.json('file:///allKind${EVENT_KIND}EventsStripped.json') YIELD value AS event",
    "
    MERGE (u:NostrUser {pubkey:event.pubkey})
    SET u.kind${EVENT_KIND}CreatedAt=event.created_at, u.kind${EVENT_KIND}EventId=event.id
    ",
    { batchSize:1000, parallel:true}
);
EOF
    
    # Execute the Cypher query
    echo "Executing Cypher query for $RELATIONSHIP_TYPE relationships..."
    sudo cp ${RELATIONSHIP_TYPE}CypherCommand.cypher /var/lib/neo4j/import/${RELATIONSHIP_TYPE}CypherCommand.cypher
    sudo chown neo4j:neo4j /var/lib/neo4j/import/${RELATIONSHIP_TYPE}CypherCommand.cypher
    sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" -f /var/lib/neo4j/import/${RELATIONSHIP_TYPE}CypherCommand.cypher
    
    # Clean up
    echo "Cleaning up..."
    sudo rm /var/lib/neo4j/import/${RELATIONSHIP_TYPE}ToAddToNeo4j.json
    sudo rm /var/lib/neo4j/import/allKind${EVENT_KIND}EventsStripped.json
    sudo rm /var/lib/neo4j/import/${RELATIONSHIP_TYPE}CypherCommand.cypher
    
    echo "Completed processing kind $EVENT_KIND events for $RELATIONSHIP_TYPE relationships."
}

# Process each event kind
process_event_kind 3 "FOLLOWS"
process_event_kind 10000 "MUTES"
process_event_kind 1984 "REPORTS"

echo "All event types processed successfully."

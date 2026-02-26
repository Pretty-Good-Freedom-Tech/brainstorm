#!/bin/bash
set -e          # Exit immediately on command failure
set -o pipefail # Fail if any pipeline command fails

# Brainstorm Neo4j Concept Graph Setup
# This script takes kinds 9998, 9999, 39998, 39999 events from strfry and loads them into Neo4j
source /etc/brainstorm.conf

# Source the defaults.conf file
source /etc/concept-graph.conf

touch ${BRAINSTORM_LOG_DIR}/conceptGraphSetup.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/conceptGraphSetup.log

echo "$(date): Starting conceptGraphSetup"
echo "$(date): Starting conceptGraphSetup" >> ${BRAINSTORM_LOG_DIR}/conceptGraphSetup.log

NEO4J_URI="bolt://localhost:7687"
NEO4J_USER="neo4j"
# Get the Neo4j password from the Brainstorm configuration
if [ -f "/etc/brainstorm.conf" ]; then
  source /etc/brainstorm.conf
  NEO4J_PASSWORD=${NEO4J_PASSWORD:-neo4j}
else
  NEO4J_PASSWORD="neo4j"
  echo "Warning: /etc/brainstorm.conf not found, using default Neo4j password"
fis

# For every Event node of kind: 9998 or 39998, add the node label: ListHeader.
CYPHER_COMMAND1="
MATCH (listHeader:Event)
WHERE listHeader.kind = 9998 or listHeader.kind = 39998
SET listHeader:ListHeader
RETURN listHeader;

"

#For every Event node of kind: 9999 or 39999, add the node label: ListItem.
CYPHER_COMMAND2="
MATCH (listItem:Event)
WHERE listItem.kind = 9999 or listItem.kind = 39999
SET listItem:ListItem
RETURN listItem;

"

#For each ListHeader and ListItem, add the property: uuid which is either the event id (if kind is 9998 or 9999) or the a-tag of that event (if kind is 39998 or 39999).

CYPHER_COMMAND3="
MATCH (n:Event)
WHERE n.kind = 9998 or n.kind = 9999
SET n.uuid = n.id
RETURN n;

"

CYPHER_COMMAND4="
MATCH (n:Event)-[:TAGGED_WITH]->(tag:Tag {type: 'd'})
WHERE n.kind = 39998 OR n.kind = 39999
WITH n, n.kind as kind, n.pubkey as pubkey, tag.value as dTag, n.id as eventId
SET n.aTag = kind + ':' + pubkey + ':' + dTag, n.uuid = kind + ':' + pubkey + ':' + dTag
RETURN n;

"

# For each of the following “canonical” Knowledge Graph node types, add node labels: Set, Superset, JSONSchema, Property, Relationship to every ListItem node that is connected to the relevant z-Tag:
# Set
CYPHER_COMMAND5="
MATCH (listItem:ListItem)-[:TAGGED_WITH]->(:Tag {type: 'z', value: '${UUID_FOR_SETS}'})
SET listItem:Set
RETURN listItem;

"

# Superset
CYPHER_COMMAND6="
MATCH (listItem:ListItem)-[:TAGGED_WITH]->(:Tag {type: 'z', value: '${UUID_FOR_SUPERSETS}'})
SET listItem:Superset
RETURN listItem;

"

# JSONSchema
CYPHER_COMMAND7="
MATCH (listItem:ListItem)-[:TAGGED_WITH]->(:Tag {type: 'z', value: '${UUID_FOR_JSON_SCHEMAS}'})
SET listItem:JSONSchema
RETURN listItem;
"

# Property
CYPHER_COMMAND8="
MATCH (listItem:ListItem)-[:TAGGED_WITH]->(:Tag {type: 'z', value: '${UUID_FOR_PROPERTIES}'})
SET listItem:Property
RETURN listItem;

"

# Relationship
CYPHER_COMMAND9="
MATCH (listItem:ListItem)-[:TAGGED_WITH]->(:Tag {type: 'z', value: '${UUID_FOR_RELATIONSHIPS}'})
SET listItem:Relationship
RETURN listItem;

"

# Add Relationships

CYPHER_COMMAND10="
MATCH (relationship:ListItem)-[:TAGGED_WITH]->(nodeFrom:Tag {type: "nodeFrom"})
OPTIONAL MATCH (relationship)-[:TAGGED_WITH]->(nodeTo:Tag {type: "nodeTo"})
OPTIONAL MATCH (relationship)-[:TAGGED_WITH]->(relationshipType:Tag {type: "relationshipType"})

WITH 
  nodeFrom.value AS uuid_nodeFrom,
  nodeTo.value   AS uuid_nodeTo,
  relationshipType.value AS relType

MERGE (from:Event {uuid: uuid_nodeFrom})
MERGE (to:Event   {uuid: uuid_nodeTo})

FOREACH (ignore IN CASE WHEN relType = 'IS_THE_CONCEPT_FOR'     THEN [1] ELSE [] END |
  MERGE (from)-[:IS_THE_CONCEPT_FOR]->(to)
)
FOREACH (ignore IN CASE WHEN relType = 'IS_A_SUPERSET_OF'   THEN [1] ELSE [] END |
  MERGE (from)-[:IS_A_SUPERSET_OF]->(to)
)
FOREACH (ignore IN CASE WHEN relType = 'HAS_ELEMENT'   THEN [1] ELSE [] END |
  MERGE (from)-[:HAS_ELEMENT]->(to)
)
FOREACH (ignore IN CASE WHEN relType = 'IS_A_PROPERTY_OF'      THEN [1] ELSE [] END |
  MERGE (from)-[:IS_A_PROPERTY_OF]->(to)
)
FOREACH (ignore IN CASE WHEN relType = 'IS_THE_JSON_SCHEMA_FOR'   THEN [1] ELSE [] END |
  MERGE (from)-[:IS_THE_JSON_SCHEMA_FOR]->(to)
)
FOREACH (ignore IN CASE WHEN relType = 'ENUMERATES'   THEN [1] ELSE [] END |
  MERGE (from)-[:ENUMERATES]->(to)
)
// Repeat for each possible relType value in your data
// ...
RETURN uuid_nodeFrom, relType, uuid_nodeTo;

"

# concatenate all cypher commands
CYPHER_COMMAND="${CYPHER_COMMAND1}${CYPHER_COMMAND2}${CYPHER_COMMAND3}${CYPHER_COMMAND4}${CYPHER_COMMAND5}${CYPHER_COMMAND6}${CYPHER_COMMAND7}${CYPHER_COMMAND8}${CYPHER_COMMAND9}${CYPHER_COMMAND10}"

# Run Cypher commands with stored password
echo "$(date): Running Cypher commands to set up concept graph..." >> ${BRAINSTORM_LOG_DIR}/conceptGraphSetup.log
sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER_COMMAND" >> ${BRAINSTORM_LOG_DIR}/conceptGraphSetup.log 2>&1
STORED_PASSWORD_RESULT=$?


echo "$(date): Finished conceptGraphSetup - SUCCESS" >> ${BRAINSTORM_LOG_DIR}/conceptGraphSetup.log
exit 0


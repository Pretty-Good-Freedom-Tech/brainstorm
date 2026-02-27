#!/bin/bash

# transfer all ConceptGraph events from strfry to Neo4j
# create nodes: NostrUser, NostrEvent, NostrEventTag
# create relationships: :AUTHORS :HAS_TAG, :REFERENCES

source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

touch ${BRAINSTORM_LOG_DIR}/conceptGraphBatchTransfer.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/conceptGraphBatchTransfer.log

echo "$(date): Starting conceptGraphBatchTransfer" 
echo "$(date): Starting conceptGraphBatchTransfer" >> ${BRAINSTORM_LOG_DIR}/conceptGraphBatchTransfer.log

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

SINCE_TIMESTAMP=0

filter="{ \"kinds\": [9998, 9999, 39998, 39999], \"since\": $SINCE_TIMESTAMP }"

command1="sudo strfry scan --count '$filter'"
eval "$command1"

command2="sudo strfry scan '$filter' | jq -cr 'del(.content)' > $SCRIPT_DIR/conceptGraphEventsToAddToNeo4j.json"
eval "$command2"

# execute processTags.js
node $SCRIPT_DIR/processTags.js

sudo mv $SCRIPT_DIR/conceptGraphEventsToAddToNeo4j.json /var/lib/neo4j/import/conceptGraphEventsToAddToNeo4j.json
sudo mv $SCRIPT_DIR/conceptGraphEventTagsToAddToNeo4j.json /var/lib/neo4j/import/conceptGraphEventTagsToAddToNeo4j.json

sudo cypher-shell -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" -a "$NEO4J_URI" -f "$SCRIPT_DIR/apocCypherCommand1_conceptGraph" > /dev/null
sudo cypher-shell -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" -a "$NEO4J_URI" -f "$SCRIPT_DIR/apocCypherCommand2_conceptGraph" > /dev/null

# Add REFERENCES relationships to NostrEventTag nodes

command3="
MATCH (t:NostrEventTag {type: 'p'})
MERGE (u:NostrUser {pubkey: t.value})
MERGE (t)-[:REFERENCES]->(u)
RETURN count(*) as merged
"

command4="
MATCH (t:NostrEventTag {type: 'e'})
MERGE (e:NostrEvent {id: t.value})
MERGE (t)-[:REFERENCES]->(e)
RETURN count(*) as merged
"

sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$command3" >> ${BRAINSTORM_LOG_DIR}/conceptGraphBatchTransfer.log 2>&1
sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$command4" >> ${BRAINSTORM_LOG_DIR}/conceptGraphBatchTransfer.log 2>&1

# clean up
sudo rm /var/lib/neo4j/import/conceptGraphEventsToAddToNeo4j.json
sudo rm /var/lib/neo4j/import/conceptGraphEventTagsToAddToNeo4j.json

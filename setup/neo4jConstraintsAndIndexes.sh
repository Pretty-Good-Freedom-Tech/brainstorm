#!/bin/bash

# Hasenpfeffr Neo4j Constraints and Indexes Setup
# This script sets up the necessary constraints and indexes for the Hasenpfeffr project


source /etc/hasenpfeffr.conf
touch ${HASENPFEFFR_LOG_DIR}/neo4jConstraintsAndIndexes.log
sudo chown hasenpfeffr:hasenpfeffr ${HASENPFEFFR_LOG_DIR}/neo4jConstraintsAndIndexes.log

echo "$(date): Starting neo4jConstraintsAndIndexes"
echo "$(date): Starting neo4jConstraintsAndIndexes" >> ${HASENPFEFFR_LOG_DIR}/neo4jConstraintsAndIndexes.log


NEO4J_URI="bolt://localhost:7687"
NEO4J_USER="neo4j"
# Get the Neo4j password from the Hasenpfeffr configuration
if [ -f "/etc/hasenpfeffr.conf" ]; then
  source /etc/hasenpfeffr.conf
  NEO4J_PASSWORD=${NEO4J_PASSWORD:-neo4j}
else
  NEO4J_PASSWORD="neo4j"
  echo "Warning: /etc/hasenpfeffr.conf not found, using default Neo4j password"
fi

# Cypher command to set up constraints and indexes

CYPHER_COMMAND="
CREATE CONSTRAINT nostrUser_pubkey IF NOT EXISTS FOR (n:NostrUser) REQUIRE n.pubkey IS UNIQUE;
CREATE INDEX nostrUser_pubkey IF NOT EXISTS FOR (n:NostrUser) ON (n.pubkey);
CREATE INDEX nostrUser_kind3EventId IF NOT EXISTS FOR (n:NostrUser) ON (n.kind3EventId);
CREATE INDEX nostrUser_kind3CreatedAt IF NOT EXISTS FOR (n:NostrUser) ON (n.kind3CreatedAt);
CREATE INDEX nostrUser_kind1984EventId IF NOT EXISTS FOR (n:NostrUser) ON (n.kind1984EventId);
CREATE INDEX nostrUser_kind1984CreatedAt IF NOT EXISTS FOR (n:NostrUser) ON (n.kind1984CreatedAt);
CREATE INDEX nostrUser_kind10000EventId IF NOT EXISTS FOR (n:NostrUser) ON (n.kind10000EventId);
CREATE INDEX nostrUser_kind10000CreatedAt IF NOT EXISTS FOR (n:NostrUser) ON (n.kind10000CreatedAt);
CREATE INDEX nostrUser_hops IF NOT EXISTS FOR (n:NostrUser) ON (n.hops);
CREATE INDEX nostrUser_personalizedPageRank IF NOT EXISTS FOR (n:NostrUser) ON (n.personalizedPageRank);

CREATE INDEX nostrUser_influence IF NOT EXISTS FOR (n:NostrUser) ON (n.influence);
CREATE INDEX nostrUser_average IF NOT EXISTS FOR (n:NostrUser) ON (n.average);
CREATE INDEX nostrUser_confidence IF NOT EXISTS FOR (n:NostrUser) ON (n.confidence);
CREATE INDEX nostrUser_input IF NOT EXISTS FOR (n:NostrUser) ON (n.input);

CREATE INDEX nostrUser_followedInput IF NOT EXISTS FOR (n:NostrUser) ON (n.followedInput);
CREATE INDEX nostrUser_mutedInput IF NOT EXISTS FOR (n:NostrUser) ON (n.mutedInput);
CREATE INDEX nostrUser_reportedInput IF NOT EXISTS FOR (n:NostrUser) ON (n.reportedInput);
CREATE INDEX nostrUser_blacklisted IF NOT EXISTS FOR (n:NostrUser) ON (n.blacklisted);

CREATE CONSTRAINT nostrEvent_event_id IF NOT EXISTS FOR (n:NostrEvent) REQUIRE n.event_id IS UNIQUE;
CREATE INDEX nostrEvent_event_id IF NOT EXISTS FOR (n:NostrEvent) ON (n.event_id);
CREATE INDEX nostrEvent_kind IF NOT EXISTS FOR (n:NostrEvent) ON (n.kind);
CREATE INDEX nostrEvent_created_at IF NOT EXISTS FOR (n:NostrEvent) ON (n.created_at);
CREATE INDEX nostrEvent_author IF NOT EXISTS FOR (n:NostrEvent) ON (n.author);
"

# Run Cypher commands with stored password
sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER_COMMAND"

# Run Cypher commands with default password
sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p neo4j "$CYPHER_COMMAND"

echo "$(date): Finished neo4jConstraintsAndIndexes"
echo "$(date): Finished neo4jConstraintsAndIndexes" >> ${HASENPFEFFR_LOG_DIR}/neo4jConstraintsAndIndexes.log

echo "Neo4j constraints and indexes have been set up successfully."
echo "You can verify by running 'SHOW CONSTRAINTS;' and 'SHOW INDEXES;' in the Neo4j Browser."

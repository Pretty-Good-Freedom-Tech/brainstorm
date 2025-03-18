#!/bin/bash

# Hasenpfeffr Neo4j Constraints and Indices Setup
# This script sets up the necessary constraints and indices for the Hasenpfeffr project

# Get the Neo4j password from the Hasenpfeffr configuration
if [ -f "/etc/hasenpfeffr.conf" ]; then
  source /etc/hasenpfeffr.conf
  NEO4J_PASSWORD=${NEO4J_PASSWORD:-neo4j}
else
  NEO4J_PASSWORD="neo4j"
  echo "Warning: /etc/hasenpfeffr.conf not found, using default Neo4j password"
fi

# Run Cypher commands to set up constraints and indices
neo4j-admin dbms run --user=neo4j --password="$NEO4J_PASSWORD" --database=neo4j "
CREATE CONSTRAINT nostrUser_pubkey IF NOT EXISTS FOR (n:NostrUser) REQUIRE n.pubkey IS UNIQUE;
CREATE INDEX nostrUser_pubkey IF NOT EXISTS FOR (n:NostrUser) ON (n.pubkey);
CREATE INDEX nostrUser_kind3EventId IF NOT EXISTS FOR (n:NostrUser) ON (n.kind3EventId);
CREATE INDEX nostrUser_kind3CreatedAt IF NOT EXISTS FOR (n:NostrUser) ON (n.kind3CreatedAt);
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

# Run Cypher commands with default password
neo4j-admin dbms run --user=neo4j --password=neo4j --database=neo4j "
CREATE CONSTRAINT nostrUser_pubkey IF NOT EXISTS FOR (n:NostrUser) REQUIRE n.pubkey IS UNIQUE;
CREATE INDEX nostrUser_pubkey IF NOT EXISTS FOR (n:NostrUser) ON (n.pubkey);
CREATE INDEX nostrUser_kind3EventId IF NOT EXISTS FOR (n:NostrUser) ON (n.kind3EventId);
CREATE INDEX nostrUser_kind3CreatedAt IF NOT EXISTS FOR (n:NostrUser) ON (n.kind3CreatedAt);
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

echo "Neo4j constraints and indices have been set up successfully."
echo "You can verify by running 'SHOW CONSTRAINTS;' and 'SHOW INDEXES;' in the Neo4j Browser."

#!/bin/bash

# Brainstorm Neo4j Constraints and Indexes Setup
# This script sets up the necessary constraints and indexes for the Brainstorm project


source /etc/brainstorm.conf
touch ${BRAINSTORM_LOG_DIR}/neo4jConstraintsAndIndexes.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/neo4jConstraintsAndIndexes.log

echo "$(date): Starting neo4jConstraintsAndIndexes"
echo "$(date): Starting neo4jConstraintsAndIndexes" >> ${BRAINSTORM_LOG_DIR}/neo4jConstraintsAndIndexes.log


NEO4J_URI="bolt://localhost:7687"
NEO4J_USER="neo4j"
# Get the Neo4j password from the Brainstorm configuration
if [ -f "/etc/brainstorm.conf" ]; then
  source /etc/brainstorm.conf
  NEO4J_PASSWORD=${NEO4J_PASSWORD:-neo4j}
else
  NEO4J_PASSWORD="neo4j"
  echo "Warning: /etc/brainstorm.conf not found, using default Neo4j password"
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
echo "$(date): Attempting to create constraints and indexes with stored password..." >> ${BRAINSTORM_LOG_DIR}/neo4jConstraintsAndIndexes.log
sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER_COMMAND" >> ${BRAINSTORM_LOG_DIR}/neo4jConstraintsAndIndexes.log 2>&1
STORED_PASSWORD_RESULT=$?

# If stored password failed, try with default password
if [ $STORED_PASSWORD_RESULT -ne 0 ]; then
    echo "$(date): First attempt failed, trying with default password..." >> ${BRAINSTORM_LOG_DIR}/neo4jConstraintsAndIndexes.log
    sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p neo4j "$CYPHER_COMMAND" >> ${BRAINSTORM_LOG_DIR}/neo4jConstraintsAndIndexes.log 2>&1
    DEFAULT_PASSWORD_RESULT=$?
else
    DEFAULT_PASSWORD_RESULT=0
fi

# Verify that constraints and indexes were created successfully
echo "$(date): Verifying constraints and indexes were created successfully..." >> ${BRAINSTORM_LOG_DIR}/neo4jConstraintsAndIndexes.log

# Check for the primary constraint that should exist
# VERIFY_COMMAND="MATCH (n:NostrUser) WHERE n.pubkey = 'verification_check' RETURN n LIMIT 1;"
SHOW_CONSTRAINTS="SHOW CONSTRAINTS;"
SHOW_INDEXES="SHOW INDEXES;"

# Try with stored password first
sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$SHOW_CONSTRAINTS" > /tmp/neo4j_constraints.txt 2>&1
SHOW_CONSTRAINTS_RESULT=$?

# If that fails, try with default password
if [ $SHOW_CONSTRAINTS_RESULT -ne 0 ]; then
    sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p neo4j "$SHOW_CONSTRAINTS" > /tmp/neo4j_constraints.txt 2>&1
    SHOW_CONSTRAINTS_RESULT=$?
fi

# Check if the primary constraint exists
CONSTRAINT_COUNT_USER=$(grep -c "nostrUser_pubkey" /tmp/neo4j_constraints.txt || echo "0")
CONSTRAINT_COUNT_EVENT=$(grep -c "nostrEvent_event_id" /tmp/neo4j_constraints.txt || echo "0")
CONSTRAINT_COUNT=$(($CONSTRAINT_COUNT_USER + $CONSTRAINT_COUNT_EVENT))

# Show the indexes
if [ $SHOW_CONSTRAINTS_RESULT -eq 0 ]; then
    sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$SHOW_INDEXES" > /tmp/neo4j_indexes.txt 2>&1 || \
    sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p neo4j "$SHOW_INDEXES" > /tmp/neo4j_indexes.txt 2>&1
    
    # Count indexes
    INDEX_COUNT_USER=$(grep -c "nostrUser_" /tmp/neo4j_indexes.txt || echo "0")
    INDEX_COUNT_EVENT=$(grep -c "nostrEvent_" /tmp/neo4j_indexes.txt || echo "0")
    INDEX_COUNT=$(($INDEX_COUNT_USER + $INDEX_COUNT_EVENT))
else
    INDEX_COUNT=0
fi

# Clean up temporary files
rm -f /tmp/neo4j_constraints.txt /tmp/neo4j_indexes.txt

# Log results
echo "$(date): Constraint check result: $CONSTRAINT_COUNT constraints found" >> ${BRAINSTORM_LOG_DIR}/neo4jConstraintsAndIndexes.log
echo "$(date): Index check result: $INDEX_COUNT indexes found" >> ${BRAINSTORM_LOG_DIR}/neo4jConstraintsAndIndexes.log

# Update timestamp only if the commands were successful and the constraints/indexes exist
if [ $STORED_PASSWORD_RESULT -eq 0 -o $DEFAULT_PASSWORD_RESULT -eq 0 ] && [ $CONSTRAINT_COUNT -gt 0 ] && [ $INDEX_COUNT -gt 0 ]; then
    # Update BRAINSTORM_CREATED_CONSTRAINTS_AND_INDEXES in brainstorm.conf with current timestamp
    CURRENT_TIMESTAMP=$(date +%s)
    echo "$(date): Setting BRAINSTORM_CREATED_CONSTRAINTS_AND_INDEXES=$CURRENT_TIMESTAMP in /etc/brainstorm.conf" >> ${BRAINSTORM_LOG_DIR}/neo4jConstraintsAndIndexes.log

    # Use sed to replace the line in brainstorm.conf
    sudo sed -i "s/^export BRAINSTORM_CREATED_CONSTRAINTS_AND_INDEXES=.*$/export BRAINSTORM_CREATED_CONSTRAINTS_AND_INDEXES=$CURRENT_TIMESTAMP/" /etc/brainstorm.conf
    
    echo "Neo4j constraints and indexes have been set up successfully."
    echo "$(date): Finished neo4jConstraintsAndIndexes - SUCCESS" >> ${BRAINSTORM_LOG_DIR}/neo4jConstraintsAndIndexes.log
else
    echo "Failed to set up Neo4j constraints and indexes. Check the log at ${BRAINSTORM_LOG_DIR}/neo4jConstraintsAndIndexes.log"
    echo "$(date): Finished neo4jConstraintsAndIndexes - FAILED" >> ${BRAINSTORM_LOG_DIR}/neo4jConstraintsAndIndexes.log
    exit 1
fi

echo "You can verify by running 'SHOW CONSTRAINTS;' and 'SHOW INDEXES;' in the Neo4j Browser."

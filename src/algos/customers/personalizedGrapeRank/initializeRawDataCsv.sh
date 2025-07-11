#!/bin/bash

source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, BRAINSTORM_OWNER_PUBKEY, BRAINSTORM_LOG_DIR, BRAINSTORM_MODULE_ALGOS_DIR

echo "$(date): Continuing personalizedGrapeRank ... starting initializeRawDataCsv"
echo "$(date): Continuing personalizedGrapeRank ... starting initializeRawDataCsv" >> ${BRAINSTORM_LOG_DIR}/personalizedGrapeRank.log

CYPHER0="
MATCH (user:NostrUser)
WHERE user.hops < 20
RETURN user.pubkey AS ratee_pubkey
"

CYPHER1="
MATCH (rater:NostrUser)-[r:FOLLOWS]->(ratee:NostrUser)
WHERE ratee.hops < 20
RETURN rater.pubkey AS pk_rater, ratee.pubkey AS pk_ratee
"

CYPHER2="
MATCH (rater:NostrUser)-[r:MUTES]->(ratee:NostrUser)
WHERE ratee.hops < 20
RETURN rater.pubkey AS pk_rater, ratee.pubkey AS pk_ratee
"

CYPHER3="
MATCH (rater:NostrUser)-[r:REPORTS]->(ratee:NostrUser)
WHERE ratee.hops < 20
RETURN rater.pubkey AS pk_rater, ratee.pubkey AS pk_ratee
"

# Create the base directory structure
USERNAME="brainstorm"
BASE_DIR="/var/lib/brainstorm"
TEMP_DIR="$BASE_DIR/algos/personalizedGrapeRank/tmp"
THIS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p $TEMP_DIR
# Set ownership
chown -R "$USERNAME:$USERNAME" "$TEMP_DIR"
# Set permissions
chmod -R 755 "$TEMP_DIR"

cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER0" > $TEMP_DIR/ratees.csv
cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1" > $TEMP_DIR/follows.csv
cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER2" > $TEMP_DIR/mutes.csv
cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER3" > $TEMP_DIR/reports.csv

echo "$(date): Continuing personalizedGrapeRank, initializeRawDataCsv ... finished cypher queries"
echo "$(date): Continuing personalizedGrapeRank, initializeRawDataCsv ... finished cypher queries" >> ${BRAINSTORM_LOG_DIR}/personalizedGrapeRank.log

echo "$(date): Continuing personalizedGrapeRank ... finished initializeRawDataCsv"
echo "$(date): Continuing personalizedGrapeRank ... finished initializeRawDataCsv" >> ${BRAINSTORM_LOG_DIR}/personalizedGrapeRank.log

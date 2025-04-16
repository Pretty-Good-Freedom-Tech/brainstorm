#!/bin/bash

source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, BRAINSTORM_OWNER_PUBKEY
source /etc/graperank.conf # GrapeRank configuration values

touch ${BRAINSTORM_LOG_DIR}/calculateImportedGrapeRank.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/calculateImportedGrapeRank.log

echo "$(date): Starting calculateImportedGrapeRank"
echo "$(date): Starting calculateImportedGrapeRank" >> ${BRAINSTORM_LOG_DIR}/calculateImportedGrapeRank.log

echo "$(date): Continuing calculateImportedGrapeRank ... starting cypher queries"
echo "$(date): Continuing calculateImportedGrapeRank ... starting cypher queries" >> ${BRAINSTORM_LOG_DIR}/calculateImportedGrapeRank.log

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
TEMP_DIR="$BASE_DIR/algos/importedGrapeRankEngine/tmp"
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

# calculate GrapeRank from imported GrapeRank engine library
# sudo bash $THIS_DIR/calculateFromLibrary.sh

# tsc $THIS_DIR/calculateFromLibrary.ts
node $THIS_DIR/calculateFromLibrary.js

# create one large raw data object oRatingsReverse.json of format: [context][ratee][rater] = [score, confidence]
# sudo bash $THIS_DIR/initializeRatings.sh

# intialize oScorecards: iterate through ratees.csv and create empty objects for each ratee
# sudo bash $THIS_DIR/initializeScorecards.sh

# iterate through GrapeRank until max iterations or until convergence
# sudo bash $THIS_DIR/calculateGrapeRank.sh

# update Neo4j with data from scorecards.json
# sudo bash $THIS_DIR/updateNeo4j.sh

# clean up tmp files

# Update the WHEN_IMPORTED_LAST_CALCULATED timestamp in the configuration file
TIMESTAMP=$(date +%s)
TMP_CONF=$(mktemp)
cat /etc/graperank.conf | sed "s/^export WHEN_IMPORTED_LAST_CALCULATED=.*$/export WHEN_IMPORTED_LAST_CALCULATED=$TIMESTAMP/" > "$TMP_CONF"
sudo cp "$TMP_CONF" /etc/graperank.conf
sudo chmod 644 /etc/graperank.conf
sudo chown root:brainstorm /etc/graperank.conf
rm "$TMP_CONF"

echo "$(date): Finished calculateImportedGrapeRank"
echo "$(date): Finished calculateImportedGrapeRank" >> ${BRAINSTORM_LOG_DIR}/calculateImportedGrapeRank.log
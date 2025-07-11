#!/bin/bash

# Source configuration
source /etc/brainstorm.conf # BRAINSTORM_OWNER_PUBKEY
source /etc/graperank.conf   # Rating and confidence values

touch ${BRAINSTORM_LOG_DIR}/calculatePersonalizedGrapeRank.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/calculatePersonalizedGrapeRank.log

echo "$(date): Starting calculatePersonalizedGrapeRank"
echo "$(date): Starting calculatePersonalizedGrapeRank" >> ${BRAINSTORM_LOG_DIR}/calculatePersonalizedGrapeRank.log

echo "$(date): Continuing calculatePersonalizedGrapeRank ... starting cypher queries"
echo "$(date): Continuing calculatePersonalizedGrapeRank ... starting cypher queries" >> ${BRAINSTORM_LOG_DIR}/calculatePersonalizedGrapeRank.log

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

echo "$(date): Continuing calculatePersonalizedGrapeRank ... finished cypher queries, starting initializeRatings"
echo "$(date): Continuing calculatePersonalizedGrapeRank ... finished cypher queries, starting initializeRatings" >> ${BRAINSTORM_LOG_DIR}/calculatePersonalizedGrapeRank.log

# create one large raw data object oRatingsReverse.json of format: [context][ratee][rater] = [score, confidence]
sudo bash $THIS_DIR/initializeRatings.sh

echo "$(date): Continuing calculatePersonalizedGrapeRank ... finished initializeRatings, calling initializeScorecards"
echo "$(date): Continuing calculatePersonalizedGrapeRank ... finished initializeRatings, calling initializeScorecards" >> ${BRAINSTORM_LOG_DIR}/calculatePersonalizedGrapeRank.log

# intialize oScorecards: iterate through ratees.csv and create empty objects for each ratee
sudo bash $THIS_DIR/initializeScorecards.sh

echo "$(date): Continuing calculatePersonalizedGrapeRank ... finished initializeScorecards, calling calculateGrapeRank"
echo "$(date): Continuing calculatePersonalizedGrapeRank ... finished initializeScorecards, calling calculateGrapeRank" >> ${BRAINSTORM_LOG_DIR}/calculatePersonalizedGrapeRank.log

# iterate through GrapeRank until max iterations or until convergence
sudo bash $THIS_DIR/calculateGrapeRank.sh

echo "$(date): Continuing calculatePersonalizedGrapeRank ... finished calculateGrapeRank, calling updateNeo4j"
echo "$(date): Continuing calculatePersonalizedGrapeRank ... finished calculateGrapeRank, calling updateNeo4j" >> ${BRAINSTORM_LOG_DIR}/calculatePersonalizedGrapeRank.log

# update Neo4j with data from scorecards.json
sudo bash $THIS_DIR/updateNeo4j.sh

echo "$(date): Continuing calculatePersonalizedGrapeRank ... finished updateNeo4j, starting clean up"
echo "$(date): Continuing calculatePersonalizedGrapeRank ... finished updateNeo4j, starting clean up" >> ${BRAINSTORM_LOG_DIR}/calculatePersonalizedGrapeRank.log

# clean up tmp files

# Update the WHEN_LAST_CALCULATED timestamp in the configuration file
TIMESTAMP=$(date +%s)
TMP_CONF=$(mktemp)
cat /etc/graperank.conf | sed "s/^export WHEN_LAST_CALCULATED=.*$/export WHEN_LAST_CALCULATED=$TIMESTAMP/" > "$TMP_CONF"
sudo cp "$TMP_CONF" /etc/graperank.conf
sudo chmod 644 /etc/graperank.conf
sudo chown root:brainstorm /etc/graperank.conf
rm "$TMP_CONF"

echo "$(date): Finished calculatePersonalizedGrapeRank"
echo "$(date): Finished calculatePersonalizedGrapeRank" >> ${BRAINSTORM_LOG_DIR}/calculatePersonalizedGrapeRank.log
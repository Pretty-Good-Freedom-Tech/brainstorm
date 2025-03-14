#!/bin/bash

source /etc/hasenpfeffr.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, HASENPFEFFR_OWNER_PUBKEY
source /etc/graperank.conf # GrapeRank configuration values

echo "$(date): Starting calculatePersonalizedGrapeRank" >> /var/log/hasenpfeffr/calculatePersonalizedGrapeRank.log

echo "HASENPFEFFR_OWNER_PUBKEY: $HASENPFEFFR_OWNER_PUBKEY"

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
USERNAME="hasenpfeffr"
BASE_DIR="/var/lib/hasenpfeffr"
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

# create one large raw data object oRatingsReverse.json of format: [context][ratee][rater] = [score, confidence]
sudo bash $THIS_DIR/initializeRatings.sh

# intialize oScorecards: iterate through ratees.csv and create empty objects for each ratee
sudo bash $THIS_DIR/initializeScorecards.sh

# iterate through GrapeRank until max iterations or until convergence

# update Neo4j with data from oScorecards

# clean up tmp files

echo "$(date): Finished calculatePersonalizedGrapeRank" >> /var/log/hasenpfeffr/calculatePersonalizedGrapeRank.log
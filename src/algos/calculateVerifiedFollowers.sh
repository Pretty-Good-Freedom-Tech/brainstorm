#!/bin/bash

# This calculates number of hops from scratch starting with BRAINSTORM_OWNER_PUBKEY which by definition is 0 hops away
# The resuls are stored in neo4j using the property: hops

source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR

touch ${BRAINSTORM_LOG_DIR}/calculateVerifiedFollowers.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/calculateVerifiedFollowers.log

echo "$(date): Starting calculateVerifiedFollowers"
echo "$(date): Starting calculateVerifiedFollowers" >> ${BRAINSTORM_LOG_DIR}/calculateVerifiedFollowers.log

CYPHER1="
MATCH (f:NostrUser)-[:FOLLOWS]->(u:NostrUser)
WHERE f.influence > 0.1
WITH u, COUNT(f) AS verifiedFollowers
SET u.verifiedFollowerCount = verifiedFollowers
RETURN COUNT(u) AS usersUpdated, SUM(verifiedFollowers) AS totalVerifiedFollowersSet"

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1")
numUsersUpdated="${cypherResults:11}"
numVerifiedFollowersSet="${cypherResults:33}"

echo "$(date): numUsersUpdated: $numUsersUpdated; numVerifiedFollowersSet: $numVerifiedFollowersSet"
echo "$(date): numUsersUpdated: $numUsersUpdated; numVerifiedFollowersSet: $numVerifiedFollowersSet" >> ${BRAINSTORM_LOG_DIR}/calculateVerifiedFollowers.log

echo "$(date): Finished calculateVerifiedFollowers"
echo "$(date): Finished calculateVerifiedFollowers" >> ${BRAINSTORM_LOG_DIR}/calculateVerifiedFollowers.log
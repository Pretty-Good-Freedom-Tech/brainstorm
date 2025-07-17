#!/bin/bash

source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR

touch ${BRAINSTORM_LOG_DIR}/calculateVerifiedReporterCounts.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/calculateVerifiedReporterCounts.log

echo "$(date): Starting calculateVerifiedReporterCounts"
echo "$(date): Starting calculateVerifiedReporterCounts" >> ${BRAINSTORM_LOG_DIR}/calculateVerifiedReporterCounts.log

CYPHER1="
MATCH (f:NostrUser)-[:REPORTS]->(u:NostrUser)
WHERE f.influence > 0.1
WITH u, COUNT(f) AS verifiedReporters
SET u.verifiedReporterCount = verifiedReporters
RETURN COUNT(u) AS usersUpdated, SUM(verifiedReporters) AS totalVerifiedReportersSet"

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1")
numUsersUpdated="${cypherResults:11}"
numVerifiedReportersSet="${cypherResults:33}"

echo "$(date): numUsersUpdated: $numUsersUpdated; numVerifiedReportersSet: $numVerifiedReportersSet"
echo "$(date): numUsersUpdated: $numUsersUpdated; numVerifiedReportersSet: $numVerifiedReportersSet" >> ${BRAINSTORM_LOG_DIR}/calculateVerifiedReporterCounts.log

echo "$(date): Finished calculateVerifiedReporterCounts"
echo "$(date): Finished calculateVerifiedReporterCounts" >> ${BRAINSTORM_LOG_DIR}/calculateVerifiedReporterCounts.log
#!/bin/bash

source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR

touch ${BRAINSTORM_LOG_DIR}/calculateReporterCounts.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/calculateReporterCounts.log

echo "$(date): Starting calculateReporterCounts"
echo "$(date): Starting calculateReporterCounts" >> ${BRAINSTORM_LOG_DIR}/calculateReporterCounts.log

CYPHER1="
MATCH (f:NostrUser)-[:REPORTS]->(u:NostrUser)
WITH u, COUNT(f) AS reporterCount
SET u.reporterCount = reporterCount
RETURN COUNT(u) AS usersUpdated, SUM(reporterCount) AS totalReportersSet"

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1")
numUsersUpdated="${cypherResults:11}"
numReportersSet="${cypherResults:33}"

echo "$(date): numUsersUpdated: $numUsersUpdated; numReportersSet: $numReportersSet"
echo "$(date): numUsersUpdated: $numUsersUpdated; numReportersSet: $numReportersSet" >> ${BRAINSTORM_LOG_DIR}/calculateReporterCount.log

echo "$(date): Finished calculateReporterCount"
echo "$(date): Finished calculateReporterCount" >> ${BRAINSTORM_LOG_DIR}/calculateReporterCount.log
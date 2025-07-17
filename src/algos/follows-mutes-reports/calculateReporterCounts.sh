#!/bin/bash

source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR

touch ${BRAINSTORM_LOG_DIR}/calculateReporterCounts.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/calculateReporterCounts.log

echo "$(date): Starting calculateReporterCounts"
echo "$(date): Starting calculateReporterCounts" >> ${BRAINSTORM_LOG_DIR}/calculateReporterCounts.log

CYPHER1="
MATCH (n:NostrUser)<-[f:REPORTS]-(m:NostrUser)
WITH n, count(f) AS reporterCount
SET n.reporterCount = reporterCount
RETURN COUNT(n) AS numUsersUpdated"

# set reporterCount to 0 for users with no reports
CYPHER2="
MATCH (n:NostrUser)
OPTIONAL MATCH (n)<-[f:REPORTS]-(m:NostrUser)
WITH n, count(f) as reporterCount
WHERE reporterCount = 0
SET n.reporterCount = 0
RETURN count(n) AS numUsersUpdated
"

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1")
numUsersUpdated="${cypherResults:16}"

echo "$(date): numUsersUpdated: $numUsersUpdated (with nonzero reporterCount)"
echo "$(date): numUsersUpdated: $numUsersUpdated (with nonzero reporterCount)" >> ${BRAINSTORM_LOG_DIR}/calculateReporterCount.log

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER2")
numUsersUpdated="${cypherResults:16}"

echo "$(date): numUsersUpdated: $numUsersUpdated (with zero reporterCount)"
echo "$(date): numUsersUpdated: $numUsersUpdated (with zero reporterCount)" >> ${BRAINSTORM_LOG_DIR}/calculateReporterCount.log

echo "$(date): Finished calculateReporterCount"
echo "$(date): Finished calculateReporterCount" >> ${BRAINSTORM_LOG_DIR}/calculateReporterCount.log
#!/bin/bash

source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR

touch ${BRAINSTORM_LOG_DIR}/calculateReportingCounts.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/calculateReportingCounts.log

echo "$(date): Starting calculateReportingCounts"
echo "$(date): Starting calculateReportingCounts" >> ${BRAINSTORM_LOG_DIR}/calculateReportingCounts.log

CYPHER1="
MATCH (n:NostrUser)-[f:REPORTS]->(m:NostrUser)
WITH n, count(f) AS reportingCount
SET n.reportingCount = reportingCount
RETURN COUNT(n) AS numUsersUpdated"

# set reportingCount to NULL for users with no reports
CYPHER2="
MATCH (n:NostrUser)
OPTIONAL MATCH (n)-[f:REPORTS]->(m:NostrUser)
WITH n, count(f) as reportingCount
WHERE reportingCount = 0
SET n.reportingCount = NULL
RETURN count(n) AS numUsersUpdated
"

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1")
numUsersUpdated="${cypherResults:11}"

echo "$(date): numUsersUpdated: $numUsersUpdated (with nonzero reportingCount)"
echo "$(date): numUsersUpdated: $numUsersUpdated (with nonzero reportingCount)" >> ${BRAINSTORM_LOG_DIR}/calculateReportingCounts.log

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER2")
numUsersUpdated="${cypherResults:11}"

echo "$(date): numUsersUpdated: $numUsersUpdated (with zero reportingCount)"
echo "$(date): numUsersUpdated: $numUsersUpdated (with zero reportingCount)" >> ${BRAINSTORM_LOG_DIR}/calculateReportingCounts.log

echo "$(date): Finished calculateReportingCounts"
echo "$(date): Finished calculateReportingCounts" >> ${BRAINSTORM_LOG_DIR}/calculateReportingCounts.log
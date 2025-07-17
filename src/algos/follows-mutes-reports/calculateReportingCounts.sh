#!/bin/bash

source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR

touch ${BRAINSTORM_LOG_DIR}/calculateReportingCounts.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/calculateReportingCounts.log

echo "$(date): Starting calculateReportingCounts"
echo "$(date): Starting calculateReportingCounts" >> ${BRAINSTORM_LOG_DIR}/calculateReportingCounts.log

CYPHER1="
MATCH (f:NostrUser)<-[:REPORTS]-(u:NostrUser)
WITH u, COUNT(f) AS reportingCount
SET u.reportingCount = reportingCount
RETURN COUNT(u) AS usersUpdated, SUM(reportingCount) AS totalReportingSet"

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1")
numUsersUpdated="${cypherResults:11}"
numReportingSet="${cypherResults:33}"

echo "$(date): numUsersUpdated: $numUsersUpdated; numReportingSet: $numReportingSet"
echo "$(date): numUsersUpdated: $numUsersUpdated; numReportingSet: $numReportingSet" >> ${BRAINSTORM_LOG_DIR}/calculateReportingCounts.log

echo "$(date): Finished calculateReportingCounts"
echo "$(date): Finished calculateReportingCounts" >> ${BRAINSTORM_LOG_DIR}/calculateReportingCounts.log
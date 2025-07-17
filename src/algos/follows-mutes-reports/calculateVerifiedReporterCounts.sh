#!/bin/bash

source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR

touch ${BRAINSTORM_LOG_DIR}/calculateVerifiedReporterCounts.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/calculateVerifiedReporterCounts.log

echo "$(date): Starting calculateVerifiedReporterCounts"
echo "$(date): Starting calculateVerifiedReporterCounts" >> ${BRAINSTORM_LOG_DIR}/calculateVerifiedReporterCounts.log

CYPHER1="
MATCH (n:NostrUser)<-[f:REPORTS]-(m:NostrUser)
WHERE m.influence > 0.1
WITH n, count(f) AS verifiedReporterCount
SET n.verifiedReporterCount = verifiedReporterCount
RETURN COUNT(n) AS numUsersUpdated"

# set verifiedReporterCount to 0 for users with no reports
CYPHER2="
MATCH (n:NostrUser)
OPTIONAL MATCH (n)<-[f:REPORTS]-(m:NostrUser)
WHERE m.influence > 0.1
WITH n, count(f) as verifiedReporterCount
WHERE verifiedReporterCount = 0
SET n.verifiedReporterCount = 0
RETURN count(n) AS numUsersUpdated
"

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1")
numUsersUpdated="${cypherResults:16}"

echo "$(date): numUsersUpdated: $numUsersUpdated (with nonzero verifiedReporterCount)"
echo "$(date): numUsersUpdated: $numUsersUpdated (with nonzero verifiedReporterCount)" >> ${BRAINSTORM_LOG_DIR}/calculateVerifiedReporterCounts.log

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER2")
numUsersUpdated="${cypherResults:16}"

echo "$(date): numUsersUpdated: $numUsersUpdated (with zero verifiedReporterCount)"
echo "$(date): numUsersUpdated: $numUsersUpdated (with zero verifiedReporterCount)" >> ${BRAINSTORM_LOG_DIR}/calculateVerifiedReporterCounts.log

echo "$(date): Finished calculateVerifiedReporterCounts"
echo "$(date): Finished calculateVerifiedReporterCounts" >> ${BRAINSTORM_LOG_DIR}/calculateVerifiedReporterCounts.log
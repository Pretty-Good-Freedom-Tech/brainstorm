#!/bin/bash

source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR

touch ${BRAINSTORM_LOG_DIR}/calculateReportScores.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/calculateReportScores.log

echo "$(date): Starting calculateReportScores"
echo "$(date): Starting calculateReportScores" >> ${BRAINSTORM_LOG_DIR}/calculateReportScores.log

# import array of report types
REPORT_TYPES=$(cat ${BRAINSTORM_MODULE_ALGOS_DIR}/reports/reportTypes.json)

# loop through report types; for each reported user, count the number of reports of that type by verified users
for reportType in ${REPORT_TYPES[@]}; do
    cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "
MATCH (a:NostrUser)-[r:REPORTS {report_type: '$reportType'}]->(u:NostrUser)
WHERE a.influence > 0.1
WITH u, COUNT(r) AS verifiedReportCount
SET u.${reportType}_verifiedCount = verifiedReportCount
RETURN COUNT(u) AS numReportedUsers")
    numReportedUsers="${cypherResults:11}"
    echo "$(date): for reportType: $reportType; numReportedUsers: $numReportedUsers"
    echo "$(date): for reportType: $reportType; numReportedUsers: $numReportedUsers" >> ${BRAINSTORM_LOG_DIR}/calculateReportScores.log
done

echo "$(date): Finished calculateReportScores"
echo "$(date): Finished calculateReportScores" >> ${BRAINSTORM_LOG_DIR}/calculateReportScores.log
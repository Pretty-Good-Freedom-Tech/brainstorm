#!/bin/bash

source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR

touch ${BRAINSTORM_LOG_DIR}/updateReportTypes.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/updateReportTypes.log

echo "$(date): Starting updateReportTypes"
echo "$(date): Starting updateReportTypes" >> ${BRAINSTORM_LOG_DIR}/updateReportTypes.log

# cypher query to obtain a list of all report types in the Neo4j database
CYPHER1="
MATCH (a:NostrUser)-[r:REPORTS]->(u:NostrUser)
WHERE r.report_type IS NOT NULL
AND r.report_type <> ''
WITH DISTINCT r.report_type AS reportType
RETURN reportType
"

cypherResults1=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1")

# remove existing reportTypes.json
sudo rm -f ${BRAINSTORM_MODULE_ALGOS_DIR}/reports/reportTypes.json

# write new reportTypes.json, removing quotes
sudo echo "$cypherResults1" | sed 's/"//g' > ${BRAINSTORM_MODULE_ALGOS_DIR}/reports/reportTypes.json   

echo "$(date): Finished updateReportTypes"
echo "$(date): Finished updateReportTypes" >> ${BRAINSTORM_LOG_DIR}/updateReportTypes.log


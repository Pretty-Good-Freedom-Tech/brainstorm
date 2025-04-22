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
WITH DISTINCT r.report_type AS reportType_e34fT4hG
RETURN reportType_e34fT4hG
"

cypherResults1=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1")

# remove existing reportTypes.json
sudo rm -f ${BRAINSTORM_MODULE_ALGOS_DIR}/reports/reportTypes.json

# write new reportTypes.json
# add opening bracket
echo "{" > ${BRAINSTORM_MODULE_ALGOS_DIR}/reports/reportTypes.json
# cycle through results and create reportTypes.json
for reportType in $cypherResults1; do
    # make sure to remove quotes from cypher results
    reportType=$(echo "$reportType" | sed 's/"//g')
    # add if reportType does not equal reportType_e34fT4hG
    if [ "$reportType" != "reportType_e34fT4hG" ]; then
        echo "$reportType": true >> ${BRAINSTORM_MODULE_ALGOS_DIR}/reports/reportTypes.json
        # add cypher index for properties: nip56_${reportType}_verifiedReportCount, nip56_${reportType}_reportCount, nip56_${reportType}_grapeRankScore
        # use this format: CREATE INDEX nostrUser_nip56_totalGrapeRankScore IF NOT EXISTS FOR (n:NostrUser) ON (n.nip56_totalGrapeRankScore);
        cypherCommand1="CREATE INDEX nostrUser_nip56_${reportType}_verifiedReportCount IF NOT EXISTS FOR (n:NostrUser) ON (n.nip56_${reportType}_verifiedReportCount)"
        cypherCommand2="CREATE INDEX nostrUser_nip56_${reportType}_reportCount IF NOT EXISTS FOR (n:NostrUser) ON (n.nip56_${reportType}_reportCount)"
        cypherCommand3="CREATE INDEX nostrUser_nip56_${reportType}_grapeRankScore IF NOT EXISTS FOR (n:NostrUser) ON (n.nip56_${reportType}_grapeRankScore)"
        sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$cypherCommand1"
        sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$cypherCommand2"
        sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$cypherCommand3"
    fi
done
# add closing bracket
echo "}" >> ${BRAINSTORM_MODULE_ALGOS_DIR}/reports/reportTypes.json

echo "$(date): Finished updateReportTypes"
echo "$(date): Finished updateReportTypes" >> ${BRAINSTORM_LOG_DIR}/updateReportTypes.log


#!/bin/bash

source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR

touch ${BRAINSTORM_LOG_DIR}/calculateReportScores.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/calculateReportScores.log

echo "$(date): Starting calculateReportScores"
echo "$(date): Starting calculateReportScores" >> ${BRAINSTORM_LOG_DIR}/calculateReportScores.log

# update reportTypes.json
sudo $BRAINSTORM_MODULE_ALGOS_DIR/reports/updateReportTypes.sh

# import array of report types
REPORT_TYPES=$(cat ${BRAINSTORM_MODULE_ALGOS_DIR}/reports/reportTypes.json)

# loop through report types; for each user, initialize report counts
# skip the first item in the array, which is "reportType"
for reportType in ${REPORT_TYPES[@]:1}; do
    cypherResults1=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "
MATCH (u:NostrUser)
SET u.nip56_${reportType}_grapeRankScore = 0
SET u.nip56_${reportType}_reportCount = 0
SET u.nip56_${reportType}_verifiedReportCount = 0
RETURN COUNT(u) AS numReportedUsers")
    numReportedUsers="${cypherResults1:11}"
    echo "$(date): for reportType: $reportType; numReportedUsers: $numReportedUsers"
    echo "$(date): for reportType: $reportType; numReportedUsers: $numReportedUsers" >> ${BRAINSTORM_LOG_DIR}/calculateReportScores.log
done

cypherResults1=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "
MATCH (u:NostrUser)
SET u.nip56_totalGrapeRankScore = 0
SET u.nip56_totalReportCount = 0
SET u.nip56_totalVerifiedReportCount = 0
RETURN COUNT(u) AS numReportedUsers")
numReportedUsers="${cypherResults1:11}"

echo "$(date): for reportType: total; numReportedUsers: $numReportedUsers"
echo "$(date): for reportType: total; numReportedUsers: $numReportedUsers" >> ${BRAINSTORM_LOG_DIR}/calculateReportScores.log

echo "$(date): Finished calculateReportScores"
echo "$(date): Finished calculateReportScores" >> ${BRAINSTORM_LOG_DIR}/calculateReportScores.log

# loop through report types; for each reported user, count the total number as well as the influence-weighted number of reports of that type by verified users
for reportType in ${REPORT_TYPES[@]}; do
    cypherResults1=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "
MATCH (a:NostrUser)-[r:REPORTS {report_type: '$reportType'}]->(u:NostrUser)
WITH u, SUM(a.influence) AS influenceTotal, COUNT(r) AS totalReportCount
SET u.nip56_${reportType}_grapeRankScore = influenceTotal, u.nip56_${reportType}_reportCount = totalReportCount
RETURN COUNT(u) AS numReportedUsers")
    numReportedUsers="${cypherResults1:11}"
    echo "$(date): for reportType: $reportType; numReportedUsers: $numReportedUsers"
    echo "$(date): for reportType: $reportType; numReportedUsers: $numReportedUsers" >> ${BRAINSTORM_LOG_DIR}/calculateReportScores.log

    cypherResults2=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "
MATCH (a:NostrUser)-[r:REPORTS {report_type: '$reportType'}]->(u:NostrUser)
WHERE a.influence > 0.1
WITH u, COUNT(r) AS verifiedReportCount
SET u.nip56_${reportType}_verifiedReportCount = verifiedReportCount
RETURN COUNT(u) AS numReportedUsers")
    numReportedUsers="${cypherResults2:11}"
    echo "$(date): for reportType: $reportType; numReportedUsers: $numReportedUsers"
    echo "$(date): for reportType: $reportType; numReportedUsers: $numReportedUsers" >> ${BRAINSTORM_LOG_DIR}/calculateReportScores.log
done

# for each reported user, calculate the total number of reports of all types and save results using properties: nip56_totalReportCount, nip56_totalVerifiedReportCount, nip56_totalGrapeRankScore
# iterate through REPORT_TYPES to build the cypher query
TOTAL_REPORT_COUNT=""
TOTAL_VERIFIED_REPORT_COUNT=""
TOTAL_GRAPE_RANK_SCORE=""
for reportType in ${REPORT_TYPES[@]}; do
    TOTAL_REPORT_COUNT+="u.nip56_${reportType}_reportCount + "
    TOTAL_VERIFIED_REPORT_COUNT+="u.nip56_${reportType}_verifiedReportCount + "
    TOTAL_GRAPE_RANK_SCORE+="u.nip56_${reportType}_grapeRankScore + "
done 

# remove final " + " from the end of TOTAL_REPORT_COUNT, TOTAL_VERIFIED_REPORT_COUNT, and TOTAL_GRAPE_RANK_SCORE
TOTAL_REPORT_COUNT="${TOTAL_REPORT_COUNT::-3}"
TOTAL_VERIFIED_REPORT_COUNT="${TOTAL_VERIFIED_REPORT_COUNT::-3}"
TOTAL_GRAPE_RANK_SCORE="${TOTAL_GRAPE_RANK_SCORE::-3}"

echo "TOTAL_REPORT_COUNT: ${TOTAL_REPORT_COUNT}"
echo "TOTAL_VERIFIED_REPORT_COUNT: ${TOTAL_VERIFIED_REPORT_COUNT}"
echo "TOTAL_GRAPE_RANK_SCORE:  ${TOTAL_GRAPE_RANK_SCORE}"

cypherCommand="
MATCH (u:NostrUser)
SET u.nip56_totalVerifiedReportCount = $TOTAL_VERIFIED_REPORT_COUNT
SET u.nip56_totalReportCount = $TOTAL_REPORT_COUNT
SET u.nip56_totalGrapeRankScore = $TOTAL_GRAPE_RANK_SCORE
RETURN COUNT(u) AS numReportedUsers
"

echo "cypherCommand: ${cypherCommand}"

cypherResults3=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$cypherCommand")

numReportedUsers="${cypherResults3:11}"

echo "$(date): Finished calculateReportScores"
echo "$(date): Finished calculateReportScores" >> ${BRAINSTORM_LOG_DIR}/calculateReportScores.log


#!/bin/bash
set -e          # Exit immediately on command failure
set -o pipefail # Fail if any pipeline command fails

source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR

# Source structured logging utilities
source "$BRAINSTORM_MODULE_BASE_DIR/src/utils/structuredLogging.sh"

touch ${BRAINSTORM_LOG_DIR}/calculateReportScores.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/calculateReportScores.log

echo "$(date): Starting calculateReportScores"
echo "$(date): Starting calculateReportScores" >> ${BRAINSTORM_LOG_DIR}/calculateReportScores.log

# Emit structured event for task start
emit_task_event "TASK_START" "calculateReportScores" "$BRAINSTORM_OWNER_PUBKEY" '{
    "message": "Starting report scores calculation algorithm",
    "task_type": "owner_algorithm",
    "algorithm": "report_scoring",
    "scope": "owner",
    "phases": ["report_types_update", "per_type_processing", "total_aggregation"],
    "operations": ["influence_weighted_scoring", "verified_report_counting", "property_aggregation"],
    "database": "neo4j",
    "category": "algorithms",
    "parent_task": "processAllTasks"
}'

# Emit structured event for Phase 1 start
emit_task_event "PROGRESS" "calculateReportScores" "$BRAINSTORM_OWNER_PUBKEY" '{
    "message": "Starting Phase 1: Report types update",
    "phase": "report_types_update",
    "step": "phase_1_start",
    "algorithm": "report_scoring",
    "child_script": "updateReportTypes.sh",
    "scope": "owner"
}'

# update reportTypes.txt
sudo $BRAINSTORM_MODULE_ALGOS_DIR/reports/updateReportTypes.sh

# import text list of report types
REPORT_TYPES=$(cat ${BRAINSTORM_MODULE_ALGOS_DIR}/reports/reportTypes.txt)

# loop through report types; for each reported user, count the total number as well as the influence-weighted number of reports of that type by verified users
report_type_count=0
total_report_types=$(echo $REPORT_TYPES | wc -w)

# Emit structured event for Phase 1 completion and Phase 2 start
progressMetadata=$(cat <<EOF
{
    "message": "Phase 1 completed, starting Phase 2: Per-type processing",
    "phase": "per_type_processing",
    "step": "phase_2_start",
    "algorithm": "report_scoring",
    "report_types": "$REPORT_TYPES",
    "report_types_count": $total_report_types,
    "report_types_loaded": true,
    "operations_per_type": ["influence_weighted_scoring", "verified_report_counting"],
    "scope": "owner"
}
EOF
)
emit_task_event "PROGRESS" "calculateReportScores" "$BRAINSTORM_OWNER_PUBKEY" "$progressMetadata"

for reportType in $REPORT_TYPES; do
    report_type_count=$((report_type_count + 1))

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

    # Emit structured event for individual report type completion
    progressMetadata=$(cat <<EOF
{
    "message": "Completed processing report type: $reportType",
    "phase": "per_type_processing",
    "step": "report_type_complete",
    "algorithm": "report_scoring",
    "report_type": "$reportType",
    "report_type_index": $report_type_count,
    "total_report_types": $total_report_types,
    "reported_users_count": $numReportedUsers,
    "operations_completed": ["influence_weighted_scoring", "verified_report_counting"],
    "scope": "owner"
}
EOF
)
done

echo "$(date): Continuing calculateReportScores; completed per-type processing"
echo "$(date): Continuing calculateReportScores; completed per-type processing" >> ${BRAINSTORM_LOG_DIR}/calculateReportScores.log

# Emit structured event for Phase 2 completion and Phase 3 start
progressMetadata=$(cat <<EOF
{
    "message": "Phase 2 completed, starting Phase 3: Total aggregation",
    "phase": "total_aggregation",
    "step": "phase_3_start",
    "algorithm": "report_scoring",
    "report_types_processed": $total_report_types,
    "aggregation_operations": ["total_report_count", "total_verified_count", "total_grape_rank_score"],
    "scope": "owner"
}
EOF
)
emit_task_event "PROGRESS" "calculateReportScores" "$BRAINSTORM_OWNER_PUBKEY" "$progressMetadata"

# for each reported user, calculate the total number of reports of all types and save results using properties: nip56_totalReportCount, nip56_totalVerifiedReportCount, nip56_totalGrapeRankScore
# iterate through REPORT_TYPES to build the cypher query
TOTAL_REPORT_COUNT=""
TOTAL_VERIFIED_REPORT_COUNT=""
TOTAL_GRAPE_RANK_SCORE=""
for reportType in $REPORT_TYPES; do
    TOTAL_REPORT_COUNT+="COALESCE(u.nip56_${reportType}_reportCount, 0) + "
    TOTAL_VERIFIED_REPORT_COUNT+="COALESCE(u.nip56_${reportType}_verifiedReportCount, 0) + "
    TOTAL_GRAPE_RANK_SCORE+="COALESCE(u.nip56_${reportType}_grapeRankScore, 0) + "
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

# Emit structured event for successful completion
progressMetadata=$(cat <<EOF
{
    "message": "Report scores calculation completed successfully",
    "status": "success",
    "task_type": "owner_algorithm",
    "algorithm": "report_scoring",
    "phases_completed": ["report_types_update", "per_type_processing", "total_aggregation"],
    "total_report_types_processed": $total_report_types,
    "final_reported_users_count": $numReportedUsers,
    "operations_completed": ["influence_weighted_scoring", "verified_report_counting", "property_aggregation"],
    "neo4j_properties_updated": ["nip56_totalReportCount", "nip56_totalVerifiedReportCount", "nip56_totalGrapeRankScore"],
    "database": "neo4j",
    "category": "algorithms",
    "scope": "owner",
    "parent_task": "processAllTasks"
}
EOF
)
emit_task_event "TASK_END" "calculateReportScores" "$BRAINSTORM_OWNER_PUBKEY" "$progressMetadata"

echo "$(date): Finished calculateReportScores"
echo "$(date): Finished calculateReportScores" >> ${BRAINSTORM_LOG_DIR}/calculateReportScores.log

exit 0  # Explicit success exit code for parent script orchestration

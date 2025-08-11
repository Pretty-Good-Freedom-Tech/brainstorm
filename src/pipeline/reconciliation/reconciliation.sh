#!/bin/bash
set -e          # Exit immediately on command failure
set -o pipefail # Fail if any pipeline command fails

# reconciliation.sh
# Main orchestrator script for the Neo4j database reconciliation process

# Source environment configuration
source /etc/brainstorm.conf

# Source structured logging utility
source /usr/local/lib/node_modules/brainstorm/src/utils/structuredLogging.sh

# Create necessary directory structure
# SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
# BASE_DIR="${SCRIPT_DIR}"
BASE_DIR_RECONCILIATION="/usr/local/lib/node_modules/brainstorm/src/pipeline/reconciliation"
# TODO: define BASE_DIR_RECONCILIATION in brainstorm.conf
BASE_DIR=${BASE_DIR_RECONCILIATION:-"/usr/local/lib/node_modules/brainstorm/src/pipeline/reconciliation"}
LOG_DIR=${BRAINSTORM_LOG_DIR:-"/var/log/brainstorm"}
APOC_COMMANDS_DIR="${BASE_DIR}/apocCypherCommands"

# Make sure directories exist
# mkdir -p "${LOG_DIR}"
mkdir -p "${APOC_COMMANDS_DIR}"

# Log file path
LOG_FILE="${LOG_DIR}/reconciliation.log"

# Create log file and set permissions
touch $LOG_FILE
sudo chown brainstorm:brainstorm $LOG_FILE

# Function for logging
log() {
  echo "$(date): $1" | tee -a "${LOG_FILE}"
}

# Function to check disk space
check_disk_space() {
  local label=$1
  log "${label} - Checking disk space"
  
  # Overall disk usage
  log "${label} - Overall disk usage:"
  df -h / | tee -a "${LOG_FILE}"
  
  # Neo4j data directory size
  log "${label} - Neo4j data directory size:"
  du -sh /var/lib/neo4j/data | tee -a "${LOG_FILE}"
  
  # Neo4j transaction logs size
  log "${label} - Neo4j transaction logs size:"
  du -sh /var/lib/neo4j/data/transactions | tee -a "${LOG_FILE}"
}

emit_function_error() {
  local function_name="$1"
  local line_number="$2" 
  local exit_code="$3"
  local last_command="${BASH_COMMAND}"
  
  emit_task_event "TASK_ERROR" "reconciliation" "system" "$(cat <<EOF
{
  "message": "Function failure in reconciliation script",
  "function": "$function_name",
  "line_number": $line_number,
  "exit_code": $exit_code,
  "failed_command": "$last_command",
  "phase": "pre_phase_A",
  "context": "cleanup_operations",
  "category": "function_error",
  "scope": "system"
}
EOF
)"
}

# create function for cleaning up
function cleanup() {
  # clean up neo4j import folder
  log "Starting cleanup"

  # Trap errors within this function
  set -e
  trap 'emit_function_error "cleanup" "$LINENO" "$?"' ERR

  # clean up mutes (use -f to avoid errors if files don't exist)
  sudo rm -f /var/lib/neo4j/import/mutesToAddToNeo4j.json
  sudo rm -f /var/lib/neo4j/import/allKind10000EventsStripped.json
  sudo rm -f /var/lib/neo4j/import/mutesToDeleteFromNeo4j.json
  # clean up follows
  sudo rm -f /var/lib/neo4j/import/followsToAddToNeo4j.json
  sudo rm -f /var/lib/neo4j/import/allKind3EventsStripped.json
  sudo rm -f /var/lib/neo4j/import/followsToDeleteFromNeo4j.json
  # clean up reports
  sudo rm -f /var/lib/neo4j/import/reportsToAddToNeo4j.json
  sudo rm -f /var/lib/neo4j/import/allKind1984EventsStripped.json
  # sudo rm -f /var/lib/neo4j/import/reportsToDeleteFromNeo4j.json

  # clean up current relationships from base directory
  sudo rm -f $BASE_DIR/currentMutesFromStrfry.json
  sudo rm -f $BASE_DIR/currentFollowsFromStrfry.json
  sudo rm -f $BASE_DIR/currentReportsFromStrfry.json

  # clean up reconciliation/currentRelationshipsFromStrfry
  sudo rm -rf $BASE_DIR/currentRelationshipsFromStrfry
  # recreate currentRelationshipsFromStrfry/follows, currentRelationshipsFromStrfry/mutes, and currentRelationshipsFromStrfry/reports
  sudo mkdir -p $BASE_DIR/currentRelationshipsFromStrfry/follows
  sudo mkdir -p $BASE_DIR/currentRelationshipsFromStrfry/mutes
  sudo mkdir -p $BASE_DIR/currentRelationshipsFromStrfry/reports

  sudo chown -R brainstorm:brainstorm $BASE_DIR/currentRelationshipsFromStrfry

  # clean up reconciliation/currentRelationshipsFromNeo4j
  sudo rm -rf $BASE_DIR/currentRelationshipsFromNeo4j
  # recreate currentRelationshipsFromNeo4j/follows, currentRelationshipsFromNeo4j/mutes, and currentRelationshipsFromNeo4j/reports
  sudo mkdir -p $BASE_DIR/currentRelationshipsFromNeo4j/follows
  sudo mkdir -p $BASE_DIR/currentRelationshipsFromNeo4j/mutes
  sudo mkdir -p $BASE_DIR/currentRelationshipsFromNeo4j/reports

  sudo chown -R brainstorm:brainstorm $BASE_DIR/currentRelationshipsFromNeo4j

  log "Completed cleanup"
  trap - ERR  # Remove trap
}

# Start reconciliation process
log "Starting reconciliation"

# Start structured logging
emit_task_event "TASK_START" "reconciliation" "system" '{
    "description": "Neo4j database reconciliation process",
    "phases": 3,
    "targets": ["mutes", "follows", "reports"],
    "process_type": "database_reconciliation",
    "database": "neo4j"
}'

check_disk_space "Before reconciliation"

# cleanup, to cover possibility that the prior reconciliation process was interrupted
cleanup

#############################################
# A: PROCESS MUTES
#############################################

# Phase A: Process Mutes
emit_task_event "PROGRESS" "reconciliation" "system" '{
    "phase": "A",
    "phase_name": "process_mutes",
    "step": "1A",
    "description": "Starting mutes reconciliation phase",
    "operation": "phase_start"
}'

# Step 1A: Extract current mutes from Neo4j
# populates currentRelationshipsFromNeo4j/mutes
log "Step 1A: Extracting current mutes from Neo4j"
emit_task_event "PROGRESS" "reconciliation" "system" '{
    "phase": "A",
    "phase_name": "process_mutes",
    "step": "1A",
    "operation": "extract_neo4j_mutes",
    "description": "Extracting current mutes from Neo4j database",
    "data_source": "neo4j"
}'
START_TIME=$(date +%s)
sudo node "${BASE_DIR}/getCurrentMutesFromNeo4j.js" \
  --neo4jUri="${NEO4J_URI}" \
  --neo4jUser="${NEO4J_USER}" \
  --neo4jPassword="${NEO4J_PASSWORD}" \
  --logFile="${LOG_FILE}"
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
log "Completed extracting Neo4j mutes in ${DURATION} seconds"
emit_task_event "PROGRESS" "reconciliation" "system" '{
    "phase": "A",
    "phase_name": "process_mutes",
    "step": "1A",
    "operation": "extract_neo4j_mutes",
    "duration": '$DURATION',
    "status": "completed",
    "description": "Neo4j mutes extraction completed",
    "data_source": "neo4j"
}'
# check_disk_space "After Neo4j mutes extraction"

# Step 2A: convert kind 10000 events to mutes
# populates currentRelationshipsFromStrfry/mutes
log "Step 2Aa: Converting kind 10000 events to mutes"
emit_task_event "PROGRESS" "reconciliation" "system" '{
    "phase": "A",
    "phase_name": "process_mutes",
    "step": "2A",
    "operation": "convert_kind10000_to_mutes",
    "description": "Converting kind 10000 events to mutes format",
    "data_source": "strfry",
    "event_kind": 10000
}'
sudo bash ${BASE_DIR}/strfryToKind10000Events.sh
log "Step 2Ab: Completed strfry to kind 10000 events"
sudo node "${BASE_DIR}/kind10000EventsToMutes.js"
log "Step 2Ac: Completed kind 10000 events to mutes"
emit_task_event "PROGRESS" "reconciliation" "system" '{
    "phase": "A",
    "phase_name": "process_mutes",
    "step": "2A",
    "operation": "convert_kind10000_to_mutes",
    "status": "completed",
    "description": "Kind 10000 events to mutes conversion completed",
    "data_source": "strfry",
    "event_kind": 10000
}'
# check_disk_space "After kind 10000 events to mutes"

# Step 3A: create json files for adding and deleting mutes
# populates json/mutesToAddToNeo4j.json and json/mutesToDeleteFromNeo4j.json
log "Step 3A: Creating json files for adding and deleting mutes"
emit_task_event "PROGRESS" "reconciliation" "system" '{
    "phase": "A",
    "phase_name": "process_mutes",
    "step": "3A",
    "operation": "create_mutes_json",
    "description": "Creating JSON files for mutes updates",
    "output_files": ["mutesToAddToNeo4j.json", "mutesToDeleteFromNeo4j.json"]
}'
sudo node "${BASE_DIR}/calculateMutesUpdates.js"
log "Completed creating json files for adding and deleting mutes"
emit_task_event "PROGRESS" "reconciliation" "system" '{
    "phase": "A",
    "phase_name": "process_mutes",
    "step": "3A",
    "operation": "create_mutes_json",
    "status": "completed",
    "description": "Mutes JSON files creation completed",
    "output_files": ["mutesToAddToNeo4j.json", "mutesToDeleteFromNeo4j.json"]
}'
# check_disk_space "After creating json files for adding and deleting mutes"

# Step 4A: Apply mutes to Neo4j
log "Step 4A: Applying mutes to Neo4j"
emit_task_event "PROGRESS" "reconciliation" "system" '{
    "phase": "A",
    "phase_name": "process_mutes",
    "step": "4A",
    "operation": "apply_mutes_to_neo4j",
    "description": "Applying mutes updates to Neo4j database",
    "database": "neo4j",
    "operations": ["add_mutes", "delete_mutes"]
}'
# add MUTES relationships from mutesToAddToNeo4j.json
# move mutesToAddToNeo4j.json from json folder to /var/lib/neo4j/import
sudo mv $BASE_DIR/json/mutesToAddToNeo4j.json /var/lib/neo4j/import/mutesToAddToNeo4j.json
sudo cypher-shell -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" -a "$NEO4J_URI" -f "$BASE_DIR/apocCypherCommands/apocCypherCommand1_mutesToAddToNeo4j" > /dev/null
# delete MUTES relationships from mutesToDeleteFromNeo4j.json
sudo mv $BASE_DIR/json/mutesToDeleteFromNeo4j.json /var/lib/neo4j/import/mutesToDeleteFromNeo4j.json
sudo cypher-shell -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" -a "$NEO4J_URI" -f "$BASE_DIR/apocCypherCommands/apocCypherCommand1_mutesToDeleteFromNeo4j" > /dev/null
# move allKind10000EventsStripped.json from base folder to /var/lib/neo4j/import
sudo mv $BASE_DIR/allKind10000EventsStripped.json /var/lib/neo4j/import/allKind10000EventsStripped.json
sudo cypher-shell -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" -a "$NEO4J_URI" -f "$BASE_DIR/apocCypherCommands/apocCypherCommand2_mutes" > /dev/null
log "Step 4A completed applying mutes to Neo4j"
emit_task_event "PROGRESS" "reconciliation" "system" '{
    "phase": "A",
    "phase_name": "process_mutes",
    "step": "4A",
    "operation": "apply_mutes_to_neo4j",
    "status": "completed",
    "description": "Mutes application to Neo4j completed",
    "database": "neo4j",
    "operations": ["add_mutes", "delete_mutes"]
}'

#############################################
# C: PROCESS REPORTS
#############################################

# Phase C: Process Reports
emit_task_event "PROGRESS" "reconciliation" "system" '{
    "phase": "C",
    "phase_name": "process_reports",
    "step": "1C",
    "description": "Starting reports reconciliation phase",
    "operation": "phase_start"
}'

# Step 1C: Extract current reports from Neo4j
# populates currentRelationshipsFromNeo4j/reports
log "Step 1C: Extracting current reports from Neo4j"
emit_task_event "PROGRESS" "reconciliation" "system" '{
    "phase": "C",
    "phase_name": "process_reports",
    "step": "1C",
    "operation": "extract_neo4j_reports",
    "description": "Extracting current reports from Neo4j database",
    "data_source": "neo4j"
}'
START_TIME=$(date +%s)
sudo node "${BASE_DIR}/getCurrentReportsFromNeo4j.js" \
  --neo4jUri="${NEO4J_URI}" \
  --neo4jUser="${NEO4J_USER}" \
  --neo4jPassword="${NEO4J_PASSWORD}" \
  --logFile="${LOG_FILE}"
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
log "Completed extracting Neo4j reports in ${DURATION} seconds"
emit_task_event "PROGRESS" "reconciliation" "system" '{
    "phase": "C",
    "phase_name": "process_reports",
    "step": "1C",
    "operation": "extract_neo4j_reports",
    "duration": '$DURATION',
    "status": "completed",
    "description": "Neo4j reports extraction completed",
    "data_source": "neo4j"
}'
# check_disk_space "After Neo4j reports extraction"

# Step 2C: convert kind 1984 events to reports
# populates currentRelationshipsFromStrfry/reports
log "Step 2Ca: Converting kind 1984 events to reports"
emit_task_event "PROGRESS" "reconciliation" "system" '{
    "phase": "C",
    "phase_name": "process_reports",
    "step": "2C",
    "operation": "convert_kind1984_to_reports",
    "description": "Converting kind 1984 events to reports format",
    "data_source": "strfry",
    "event_kind": 1984
}'
sudo bash ${BASE_DIR}/strfryToKind1984Events.sh
log "Step 2Cb: Completed strfry to kind 1984 events"
sudo node "${BASE_DIR}/kind1984EventsToReports.js"
log "Step 2Cc: Completed kind 1984 events to reports"
emit_task_event "PROGRESS" "reconciliation" "system" '{
    "phase": "C",
    "phase_name": "process_reports",
    "step": "2C",
    "operation": "convert_kind1984_to_reports",
    "status": "completed",
    "description": "Kind 1984 events to reports conversion completed",
    "data_source": "strfry",
    "event_kind": 1984
}'
# check_disk_space "After kind 1984 events to reports"

# Step 3C: create json files for adding and deleting reports
# populates json/reportsToAddToNeo4j.json and json/reportsToDeleteFromNeo4j.json
log "Step 3C: Creating json files for adding and deleting reports"
emit_task_event "PROGRESS" "reconciliation" "system" '{
    "phase": "C",
    "phase_name": "process_reports",
    "step": "3C",
    "operation": "create_reports_json",
    "description": "Creating JSON files for reports updates",
    "output_files": ["reportsToAddToNeo4j.json", "reportsToDeleteFromNeo4j.json"]
}'
sudo node "${BASE_DIR}/calculateReportsUpdates.js"
log "Completed creating json files for adding and deleting reports"
emit_task_event "PROGRESS" "reconciliation" "system" '{
    "phase": "C",
    "phase_name": "process_reports",
    "step": "3C",
    "operation": "create_reports_json",
    "status": "completed",
    "description": "Reports JSON files creation completed",
    "output_files": ["reportsToAddToNeo4j.json", "reportsToDeleteFromNeo4j.json"]
}'
# check_disk_space "After creating json files for adding and deleting reports"

# Step 4C: Apply reports to Neo4j
log "Step 4C: Applying reports to Neo4j"
emit_task_event "PROGRESS" "reconciliation" "system" '{
    "phase": "C",
    "phase_name": "process_reports",
    "step": "4C",
    "operation": "apply_reports_to_neo4j",
    "description": "Applying reports updates to Neo4j database",
    "database": "neo4j",
    "operations": ["add_reports"]
}'
# add REPORTS relationships from reportsToAddToNeo4j.json
# move reportsToAddToNeo4j.json from json folder to /var/lib/neo4j/import
sudo mv $BASE_DIR/json/reportsToAddToNeo4j.json /var/lib/neo4j/import/reportsToAddToNeo4j.json
sudo cypher-shell -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" -a "$NEO4J_URI" -f "$BASE_DIR/apocCypherCommands/apocCypherCommand1_reportsToAddToNeo4j" > /dev/null
# delete REPORTS relationships from reportsToDeleteFromNeo4j.json
# sudo mv $BASE_DIR/json/reportsToDeleteFromNeo4j.json /var/lib/neo4j/import/reportsToDeleteFromNeo4j.json
# sudo cypher-shell -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" -a "$NEO4J_URI" -f "$BASE_DIR/apocCypherCommands/apocCypherCommand1_reportsToDeleteFromNeo4j" > /dev/null
# move allKind1984EventsStripped.json from base folder to /var/lib/neo4j/import
sudo mv $BASE_DIR/allKind1984EventsStripped.json /var/lib/neo4j/import/allKind1984EventsStripped.json
sudo cypher-shell -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" -a "$NEO4J_URI" -f "$BASE_DIR/apocCypherCommands/apocCypherCommand2_reports" > /dev/null
log "Step 4C completed applying reports to Neo4j"
emit_task_event "PROGRESS" "reconciliation" "system" '{
    "phase": "C",
    "phase_name": "process_reports",
    "step": "4C",
    "operation": "apply_reports_to_neo4j",
    "status": "completed",
    "description": "Reports application to Neo4j completed",
    "database": "neo4j",
    "operations": ["add_reports"]
}'

#############################################
# B: PROCESS FOLLOWS
#############################################

# Phase B: Process Follows
emit_task_event "PROGRESS" "reconciliation" "system" '{
    "phase": "B",
    "phase_name": "process_follows",
    "step": "1B",
    "description": "Starting follows reconciliation phase",
    "operation": "phase_start"
}'

# Step 1B: Extract current follows from Neo4j
# populates currentRelationshipsFromNeo4j/follows
log "Step 1B: Extracting current follows from Neo4j"
emit_task_event "PROGRESS" "reconciliation" "system" '{
    "phase": "B",
    "phase_name": "process_follows",
    "step": "1B",
    "operation": "extract_neo4j_follows",
    "description": "Extracting current follows from Neo4j database",
    "data_source": "neo4j"
}'
START_TIME=$(date +%s)
sudo node "${BASE_DIR}/getCurrentFollowsFromNeo4j.js" \
  --neo4jUri="${NEO4J_URI}" \
  --neo4jUser="${NEO4J_USER}" \
  --neo4jPassword="${NEO4J_PASSWORD}" \
  --logFile="${LOG_FILE}"
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
log "Completed extracting Neo4j follows in ${DURATION} seconds"
emit_task_event "PROGRESS" "reconciliation" "system" '{
    "phase": "B",
    "phase_name": "process_follows",
    "step": "1B",
    "operation": "extract_neo4j_follows",
    "duration": '$DURATION',
    "status": "completed",
    "description": "Neo4j follows extraction completed",
    "data_source": "neo4j"
}'
# check_disk_space "After Neo4j follows extraction"

# Step 2B: convert kind 3 events to follows
# populates currentRelationshipsFromStrfry/follows
log "Step 2Ba: Converting kind 3 events to follows"
emit_task_event "PROGRESS" "reconciliation" "system" '{
    "phase": "B",
    "phase_name": "process_follows",
    "step": "2B",
    "operation": "convert_kind3_to_follows",
    "description": "Converting kind 3 events to follows format",
    "data_source": "strfry",
    "event_kind": 3
}'
sudo bash ${BASE_DIR}/strfryToKind3Events.sh
log "Step 2Bb: Completed strfry to kind 3 events"
sudo node "${BASE_DIR}/kind3EventsToFollows.js"
log "Step 2Bc: Completed kind 3 events to follows"
emit_task_event "PROGRESS" "reconciliation" "system" '{
    "phase": "B",
    "phase_name": "process_follows",
    "step": "2B",
    "operation": "convert_kind3_to_follows",
    "status": "completed",
    "description": "Kind 3 events to follows conversion completed",
    "data_source": "strfry",
    "event_kind": 3
}'
# check_disk_space "After kind 3 events to follows"

# Step 3B: create json files for adding and deleting follows
# populates json/followsToAddToNeo4j.json and json/followsToDeleteFromNeo4j.json
log "Step 3B: Creating json files for adding and deleting follows"
emit_task_event "PROGRESS" "reconciliation" "system" '{
    "phase": "B",
    "phase_name": "process_follows",
    "step": "3B",
    "operation": "create_follows_json",
    "description": "Creating JSON files for follows updates",
    "output_files": ["followsToAddToNeo4j.json", "followsToDeleteFromNeo4j.json"]
}'
sudo node "${BASE_DIR}/calculateFollowsUpdates.js"
log "Completed creating json files for adding and deleting follows"
emit_task_event "PROGRESS" "reconciliation" "system" '{
    "phase": "B",
    "phase_name": "process_follows",
    "step": "3B",
    "operation": "create_follows_json",
    "status": "completed",
    "description": "Follows JSON files creation completed",
    "output_files": ["followsToAddToNeo4j.json", "followsToDeleteFromNeo4j.json"]
}'
# check_disk_space "After creating json files for adding and deleting follows"

# Step 4B: Apply follows to Neo4j
log "Step 4B: Applying follows to Neo4j"
emit_task_event "PROGRESS" "reconciliation" "system" '{
    "phase": "B",
    "phase_name": "process_follows",
    "step": "4B",
    "operation": "apply_follows_to_neo4j",
    "description": "Applying follows updates to Neo4j database",
    "database": "neo4j",
    "operations": ["add_follows", "delete_follows"]
}'
# add FOLLOWS relationships from followsToAddToNeo4j.json
# move followsToAddToNeo4j.json from json folder to /var/lib/neo4j/import
sudo mv $BASE_DIR/json/followsToAddToNeo4j.json /var/lib/neo4j/import/followsToAddToNeo4j.json
sudo cypher-shell -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" -a "$NEO4J_URI" -f "$BASE_DIR/apocCypherCommands/apocCypherCommand1_followsToAddToNeo4j" > /dev/null
# delete FOLLOWS relationships from followsToDeleteFromNeo4j.json
sudo mv $BASE_DIR/json/followsToDeleteFromNeo4j.json /var/lib/neo4j/import/followsToDeleteFromNeo4j.json
sudo cypher-shell -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" -a "$NEO4J_URI" -f "$BASE_DIR/apocCypherCommands/apocCypherCommand1_followsToDeleteFromNeo4j" > /dev/null
# move allKind3EventsStripped.json from base folder to /var/lib/neo4j/import
sudo mv $BASE_DIR/allKind3EventsStripped.json /var/lib/neo4j/import/allKind3EventsStripped.json
sudo cypher-shell -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" -a "$NEO4J_URI" -f "$BASE_DIR/apocCypherCommands/apocCypherCommand2_follows" > /dev/null
log "Step 4B completed applying follows to Neo4j"
emit_task_event "PROGRESS" "reconciliation" "system" '{
    "phase": "B",
    "phase_name": "process_follows",
    "step": "4B",
    "operation": "apply_follows_to_neo4j",
    "status": "completed",
    "description": "Follows application to Neo4j completed",
    "database": "neo4j",
    "operations": ["add_follows", "delete_follows"]
}'

# moving this step to processAllTasks.sh
# Step 5B: Run processNpubsUpToMaxNumBlocks until all npubs are processed
# MAX_ITERATIONS=5
# log "Step 5B: Running processNpubsUpToMaxNumBlocks until all npubs are processed"
# sudo bash $BRAINSTORM_MODULE_SRC_DIR/manage/nostrUsers/processNpubsUpToMaxNumBlocks.sh $MAX_ITERATIONS
# log "Step 5B completed running processNpubsUpToMaxNumBlocks until all npubs are processed"

# Step 6B: Project followsGraph into memory
log "Step 6B: Projecting followsGraph into memory"
emit_task_event "PROGRESS" "reconciliation" \
    "system" \
    "phase=B" \
    "step=6B" \
    "operation=project_follows_graph" \
    "description=Projecting followsGraph into memory"
sudo bash $BRAINSTORM_MODULE_SRC_DIR/algos/projectFollowsGraphIntoMemory.sh
log "Step 6B completed projecting followsGraph into memory"
emit_task_event "PROGRESS" "reconciliation" \
    "system" \
    "phase=B" \
    "step=6B" \
    "operation=project_follows_graph" \
    "status=completed" \
    "description=FollowsGraph projection into memory completed"

# CLEAN UP

cleanup

: <<'COMMENT_BLOCK'
# foo
COMMENT_BLOCK

check_disk_space "At end of reconciliation"

log "Finished reconciliation"

# End structured logging
emit_task_event "TASK_END" "reconciliation" "system" '{
    "phases_completed": 3,
    "targets_processed": ["mutes", "follows", "reports"],
    "status": "success",
    "description": "Neo4j database reconciliation process completed successfully",
    "process_type": "database_reconciliation",
    "database": "neo4j"
}'

# Explicit success exit code for parent script orchestration
exit 0

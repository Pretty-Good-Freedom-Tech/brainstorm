#!/bin/bash
set -e          # Exit immediately on command failure
set -o pipefail # Fail if any pipeline command fails

source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR

# Source structured logging utilities
source "$BRAINSTORM_MODULE_BASE_DIR/src/utils/structuredLogging.sh"

touch ${BRAINSTORM_LOG_DIR}/processFollowsMutesReports.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/processFollowsMutesReports.log

echo "$(date): Starting processFollowsMutesReports"
echo "$(date): Starting processFollowsMutesReports" >> ${BRAINSTORM_LOG_DIR}/processFollowsMutesReports.log

# Emit structured event for task start
emit_task_event "TASK_START" "processOwnerFollowsMutesReports" "$BRAINSTORM_OWNER_PUBKEY" '{
    "message": "Starting owner-level follows-mutes-reports processing",
    "task_type": "owner_orchestrator",
    "algorithm": "follows_mutes_reports_processing",
    "scope": "owner",
    "child_scripts": 10,
    "phases": ["basic_counts", "verified_counts", "inputs_calculation"],
    "phase_1_scripts": 6,
    "phase_2_scripts": 3,
    "phase_3_scripts": 1,
    "category": "algorithms",
    "parent_task": "processAllTasks"
}'

# Emit structured event for Phase 1 start
emit_task_event "PROGRESS" "processOwnerFollowsMutesReports" "$BRAINSTORM_OWNER_PUBKEY" '{
    "message": "Starting Phase 1: Basic counts calculation",
    "phase": "basic_counts",
    "step": "phase_1_start",
    "algorithm": "follows_mutes_reports_processing",
    "scripts_in_phase": 6,
    "scope": "owner"
}'

sudo $BRAINSTORM_MODULE_ALGOS_DIR/follows-mutes-reports/calculateFollowerCounts.sh
sudo $BRAINSTORM_MODULE_ALGOS_DIR/follows-mutes-reports/calculateFollowingCounts.sh

sudo $BRAINSTORM_MODULE_ALGOS_DIR/follows-mutes-reports/calculateMuterCounts.sh
sudo $BRAINSTORM_MODULE_ALGOS_DIR/follows-mutes-reports/calculateMutingCounts.sh

sudo $BRAINSTORM_MODULE_ALGOS_DIR/follows-mutes-reports/calculateReporterCounts.sh
sudo $BRAINSTORM_MODULE_ALGOS_DIR/follows-mutes-reports/calculateReportingCounts.sh

echo "$(date): Continuing processFollowsMutesReports ... finished calculating follower, following, muter, muting, reporter, and reporting counts"
echo "$(date): Continuing processFollowsMutesReports ... finished calculating follower, following, muter, muting, reporter, and reporting counts" >> ${BRAINSTORM_LOG_DIR}/processFollowsMutesReports.log

# Emit structured event for Phase 1 completion
emit_task_event "PROGRESS" "processOwnerFollowsMutesReports" "$BRAINSTORM_OWNER_PUBKEY" '{
    "message": "Phase 1 completed: Basic counts calculation finished",
    "phase": "basic_counts",
    "step": "phase_1_complete",
    "algorithm": "follows_mutes_reports_processing",
    "scripts_completed": 6,
    "counts_calculated": ["follower", "following", "muter", "muting", "reporter", "reporting"],
    "status": "success",
    "scope": "owner"
}'

# Emit structured event for Phase 2 start
emit_task_event "PROGRESS" "processOwnerFollowsMutesReports" "$BRAINSTORM_OWNER_PUBKEY" '{
    "message": "Starting Phase 2: Verified counts calculation",
    "phase": "verified_counts",
    "step": "phase_2_start",
    "algorithm": "follows_mutes_reports_processing",
    "scripts_in_phase": 3,
    "scope": "owner"
}'

sudo $BRAINSTORM_MODULE_ALGOS_DIR/follows-mutes-reports/calculateVerifiedFollowerCounts.sh
sudo $BRAINSTORM_MODULE_ALGOS_DIR/follows-mutes-reports/calculateVerifiedMuterCounts.sh
sudo $BRAINSTORM_MODULE_ALGOS_DIR/follows-mutes-reports/calculateVerifiedReporterCounts.sh

echo "$(date): Continuing processFollowsMutesReports ... finished calculating verified follower, muter, and reporter counts"
echo "$(date): Continuing processFollowsMutesReports ... finished calculating verified follower, muter, and reporter counts" >> ${BRAINSTORM_LOG_DIR}/processFollowsMutesReports.log

# Emit structured event for Phase 2 completion
emit_task_event "PROGRESS" "processOwnerFollowsMutesReports" "$BRAINSTORM_OWNER_PUBKEY" '{
    "message": "Phase 2 completed: Verified counts calculation finished",
    "phase": "verified_counts",
    "step": "phase_2_complete",
    "algorithm": "follows_mutes_reports_processing",
    "scripts_completed": 3,
    "verified_counts_calculated": ["verified_follower", "verified_muter", "verified_reporter"],
    "status": "success",
    "scope": "owner"
}'

# Emit structured event for Phase 3 start
emit_task_event "PROGRESS" "processOwnerFollowsMutesReports" "$BRAINSTORM_OWNER_PUBKEY" '{
    "message": "Starting Phase 3: Inputs calculation",
    "phase": "inputs_calculation",
    "step": "phase_3_start",
    "algorithm": "follows_mutes_reports_processing",
    "scripts_in_phase": 1,
    "scope": "owner"
}'

sudo $BRAINSTORM_MODULE_ALGOS_DIR/follows-mutes-reports/calculateFollowerMuterReporterInputs.sh

echo "$(date): Continuing processFollowsMutesReports ... finished calculating follower, muter, and reporter inputs"
echo "$(date): Continuing processFollowsMutesReports ... finished calculating follower, muter, and reporter inputs" >> ${BRAINSTORM_LOG_DIR}/processFollowsMutesReports.log

# Emit structured event for Phase 3 completion
emit_task_event "PROGRESS" "processOwnerFollowsMutesReports" "$BRAINSTORM_OWNER_PUBKEY" '{
    "message": "Phase 3 completed: Inputs calculation finished",
    "phase": "inputs_calculation",
    "step": "phase_3_complete",
    "algorithm": "follows_mutes_reports_processing",
    "scripts_completed": 1,
    "inputs_calculated": ["follower_inputs", "muter_inputs", "reporter_inputs"],
    "status": "success",
    "scope": "owner"
}'

# Emit structured event for successful completion
emit_task_event "TASK_END" "processOwnerFollowsMutesReports" "$BRAINSTORM_OWNER_PUBKEY" '{
    "message": "Owner-level follows-mutes-reports processing completed successfully",
    "status": "success",
    "task_type": "owner_orchestrator",
    "algorithm": "follows_mutes_reports_processing",
    "phases_completed": ["basic_counts", "verified_counts", "inputs_calculation"],
    "total_child_scripts": 10,
    "phase_1_scripts": 6,
    "phase_2_scripts": 3,
    "phase_3_scripts": 1,
    "counts_types": ["follower", "following", "muter", "muting", "reporter", "reporting", "verified_follower", "verified_muter", "verified_reporter"],
    "inputs_types": ["follower_inputs", "muter_inputs", "reporter_inputs"],
    "category": "algorithms",
    "scope": "owner",
    "parent_task": "processAllTasks"
}'

echo "$(date): Finished processFollowsMutesReports"
echo "$(date): Finished processFollowsMutesReports" >> ${BRAINSTORM_LOG_DIR}/processFollowsMutesReports.log

exit 0  # Explicit success exit code for parent script orchestration

#!/bin/bash

# This script calculats verified follower, muter, and reporter counts for a customer
# It also calculates follower, muter, and reporter inputs for a customer
# Results are stored in the relevant NostrUserWotMetricsCard nodes
# Absolute follower, muter, and reporter counts are not calculated here

source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR

# Source structured logging utilities
source "$BRAINSTORM_MODULE_BASE_DIR/src/utils/structuredLogging.sh"

# Check if customer_pubkey, customer_id, customer_name are provided
if [ -z "$1" ] || [ -z "$2" ] || [ -z "$3" ]; then
    echo "Usage: $0 <customer_pubkey> <customer_id> <customer_name>"
    exit 1
fi

# Get customer_pubkey
CUSTOMER_PUBKEY="$1"

# Get customer_id
CUSTOMER_ID="$2"

# Get customer_name
CUSTOMER_NAME="$3"

# Get log directory
LOG_DIR="$BRAINSTORM_LOG_DIR/customers/$CUSTOMER_NAME"

# Create log directory if it doesn't exist; chown to brainstorm user
mkdir -p "$LOG_DIR"
sudo chown brainstorm:brainstorm "$LOG_DIR"

# Log file
LOG_FILE="$LOG_DIR/processFollowsMutesReports.log"
touch ${LOG_FILE}
sudo chown brainstorm:brainstorm ${LOG_FILE}

echo "$(date): Starting processFollowsMutesReports for $CUSTOMER_PUBKEY ($CUSTOMER_ID) ($CUSTOMER_NAME)"
echo "$(date): Starting processFollowsMutesReports for $CUSTOMER_PUBKEY ($CUSTOMER_ID) ($CUSTOMER_NAME)" >> ${LOG_FILE}

# Emit structured event for task start
emit_task_event "TASK_START" "processCustomerFollowsMutesReports" "$CUSTOMER_PUBKEY" '{
    "customer_id": "'$CUSTOMER_ID'",
    "customer_pubkey": "'$CUSTOMER_PUBKEY'",
    "customer_name": "'$CUSTOMER_NAME'",
    "message": "Starting follows, mutes, and reports processing",
    "orchestrator": "processCustomerFollowsMutesReports",
    "child_tasks": 6,
    "processing_types": ["follows", "mutes", "reports"],
    "calculation_types": ["verified_counts", "inputs"],
    "category": "orchestrator",
    "parent_task": "updateAllScoresForSingleCustomer"
}'

# Emit structured event for child task start
emit_task_event "CHILD_TASK_START" "processCustomerFollowsMutesReports" "$CUSTOMER_PUBKEY" '{
    "child_task": "calculateVerifiedFollowerCounts",
    "customer_id": "'$CUSTOMER_ID'",
    "customer_name": "'$CUSTOMER_NAME'",
    "step": 1,
    "total_steps": 6,
    "message": "Starting verified follower counts calculation",
    "orchestrator": "processCustomerFollowsMutesReports",
    "calculation_type": "verified_counts",
    "processing_type": "follows"
}'

if sudo $BRAINSTORM_MODULE_ALGOS_DIR/customers/follows-mutes-reports/calculateVerifiedFollowerCounts.sh $CUSTOMER_PUBKEY $CUSTOMER_ID $CUSTOMER_NAME; then
    # Emit structured event for child task success
    emit_task_event "CHILD_TASK_END" "processCustomerFollowsMutesReports" "$CUSTOMER_PUBKEY" '{
        "child_task": "calculateVerifiedFollowerCounts",
        "customer_id": "'$CUSTOMER_ID'",
        "customer_name": "'$CUSTOMER_NAME'",
        "step": 1,
        "status": "success",
        "message": "Verified follower counts calculation completed successfully",
        "orchestrator": "processCustomerFollowsMutesReports",
        "calculation_type": "verified_counts",
        "processing_type": "follows"
    }'
else
    # Emit structured event for child task error
    emit_task_event "CHILD_TASK_ERROR" "processCustomerFollowsMutesReports" "$CUSTOMER_PUBKEY" '{
        "child_task": "calculateVerifiedFollowerCounts",
        "customer_id": "'$CUSTOMER_ID'",
        "customer_name": "'$CUSTOMER_NAME'",
        "step": 1,
        "error_code": '$?',
        "message": "Verified follower counts calculation failed",
        "orchestrator": "processCustomerFollowsMutesReports",
        "calculation_type": "verified_counts",
        "processing_type": "follows"
    }'
fi

echo "$(date): Continuing processFollowsMutesReports ... finished calculating verified follower counts"
echo "$(date): Continuing processFollowsMutesReports ... finished calculating verified follower counts" >> ${LOG_FILE}

# Emit structured event for child task start
emit_task_event "CHILD_TASK_START" "processCustomerFollowsMutesReports" "$CUSTOMER_PUBKEY" '{
    "child_task": "calculateVerifiedMuterCounts",
    "customer_id": "'$CUSTOMER_ID'",
    "customer_name": "'$CUSTOMER_NAME'",
    "step": 2,
    "total_steps": 6,
    "message": "Starting verified muter counts calculation",
    "orchestrator": "processCustomerFollowsMutesReports",
    "calculation_type": "verified_counts",
    "processing_type": "mutes"
}'

if sudo $BRAINSTORM_MODULE_ALGOS_DIR/customers/follows-mutes-reports/calculateVerifiedMuterCounts.sh $CUSTOMER_PUBKEY $CUSTOMER_ID $CUSTOMER_NAME; then
    # Emit structured event for child task success
    emit_task_event "CHILD_TASK_END" "processCustomerFollowsMutesReports" "$CUSTOMER_PUBKEY" '{
        "child_task": "calculateVerifiedMuterCounts",
        "customer_id": "'$CUSTOMER_ID'",
        "customer_name": "'$CUSTOMER_NAME'",
        "step": 2,
        "status": "success",
        "message": "Verified muter counts calculation completed successfully",
        "orchestrator": "processCustomerFollowsMutesReports",
        "calculation_type": "verified_counts",
        "processing_type": "mutes"
    }'
else
    # Emit structured event for child task error
    emit_task_event "CHILD_TASK_ERROR" "processCustomerFollowsMutesReports" "$CUSTOMER_PUBKEY" '{
        "child_task": "calculateVerifiedMuterCounts",
        "customer_id": "'$CUSTOMER_ID'",
        "customer_name": "'$CUSTOMER_NAME'",
        "step": 2,
        "error_code": '$?',
        "message": "Verified muter counts calculation failed",
        "orchestrator": "processCustomerFollowsMutesReports",
        "calculation_type": "verified_counts",
        "processing_type": "mutes"
    }'
fi

echo "$(date): Continuing processFollowsMutesReports ... finished calculating verified muter counts"
echo "$(date): Continuing processFollowsMutesReports ... finished calculating verified muter counts" >> ${LOG_FILE}

# Emit structured event for child task start
emit_task_event "CHILD_TASK_START" "processCustomerFollowsMutesReports" "$CUSTOMER_PUBKEY" '{
    "child_task": "calculateVerifiedReporterCounts",
    "customer_id": "'$CUSTOMER_ID'",
    "customer_name": "'$CUSTOMER_NAME'",
    "step": 3,
    "total_steps": 6,
    "message": "Starting verified reporter counts calculation",
    "orchestrator": "processCustomerFollowsMutesReports",
    "calculation_type": "verified_counts",
    "processing_type": "reports"
}'

if sudo $BRAINSTORM_MODULE_ALGOS_DIR/customers/follows-mutes-reports/calculateVerifiedReporterCounts.sh $CUSTOMER_PUBKEY $CUSTOMER_ID $CUSTOMER_NAME; then
    # Emit structured event for child task success
    emit_task_event "CHILD_TASK_END" "processCustomerFollowsMutesReports" "$CUSTOMER_PUBKEY" '{
        "child_task": "calculateVerifiedReporterCounts",
        "customer_id": "'$CUSTOMER_ID'",
        "customer_name": "'$CUSTOMER_NAME'",
        "step": 3,
        "status": "success",
        "message": "Verified reporter counts calculation completed successfully",
        "orchestrator": "processCustomerFollowsMutesReports",
        "calculation_type": "verified_counts",
        "processing_type": "reports"
    }'
else
    # Emit structured event for child task error
    emit_task_event "CHILD_TASK_ERROR" "processCustomerFollowsMutesReports" "$CUSTOMER_PUBKEY" '{
        "child_task": "calculateVerifiedReporterCounts",
        "customer_id": "'$CUSTOMER_ID'",
        "customer_name": "'$CUSTOMER_NAME'",
        "step": 3,
        "error_code": '$?',
        "message": "Verified reporter counts calculation failed",
        "orchestrator": "processCustomerFollowsMutesReports",
        "calculation_type": "verified_counts",
        "processing_type": "reports"
    }'
fi

echo "$(date): Continuing processFollowsMutesReports ... finished calculating verified reporter counts"
echo "$(date): Continuing processFollowsMutesReports ... finished calculating verified reporter counts" >> ${LOG_FILE}

# Emit structured event for child task start
emit_task_event "CHILD_TASK_START" "processCustomerFollowsMutesReports" "$CUSTOMER_PUBKEY" '{
    "child_task": "calculateFollowerInputs",
    "customer_id": "'$CUSTOMER_ID'",
    "customer_name": "'$CUSTOMER_NAME'",
    "step": 4,
    "total_steps": 6,
    "message": "Starting follower inputs calculation",
    "orchestrator": "processCustomerFollowsMutesReports",
    "calculation_type": "inputs",
    "processing_type": "follows"
}'

if sudo $BRAINSTORM_MODULE_ALGOS_DIR/customers/follows-mutes-reports/calculateFollowerInputs.sh $CUSTOMER_PUBKEY $CUSTOMER_ID $CUSTOMER_NAME; then
    # Emit structured event for child task success
    emit_task_event "CHILD_TASK_END" "processCustomerFollowsMutesReports" "$CUSTOMER_PUBKEY" '{
        "child_task": "calculateFollowerInputs",
        "customer_id": "'$CUSTOMER_ID'",
        "customer_name": "'$CUSTOMER_NAME'",
        "step": 4,
        "status": "success",
        "message": "Follower inputs calculation completed successfully",
        "orchestrator": "processCustomerFollowsMutesReports",
        "calculation_type": "inputs",
        "processing_type": "follows"
    }'
else
    # Emit structured event for child task error
    emit_task_event "CHILD_TASK_ERROR" "processCustomerFollowsMutesReports" "$CUSTOMER_PUBKEY" '{
        "child_task": "calculateFollowerInputs",
        "customer_id": "'$CUSTOMER_ID'",
        "customer_name": "'$CUSTOMER_NAME'",
        "step": 4,
        "error_code": '$?',
        "message": "Follower inputs calculation failed",
        "orchestrator": "processCustomerFollowsMutesReports",
        "calculation_type": "inputs",
        "processing_type": "follows"
    }'
fi

echo "$(date): Continuing processFollowsMutesReports ... finished calculating follower inputs"
echo "$(date): Continuing processFollowsMutesReports ... finished calculating follower inputs" >> ${LOG_FILE}

# Emit structured event for child task start
emit_task_event "CHILD_TASK_START" "processCustomerFollowsMutesReports" "$CUSTOMER_PUBKEY" '{
    "child_task": "calculateMuterInputs",
    "customer_id": "'$CUSTOMER_ID'",
    "customer_name": "'$CUSTOMER_NAME'",
    "step": 5,
    "total_steps": 6,
    "message": "Starting muter inputs calculation",
    "orchestrator": "processCustomerFollowsMutesReports",
    "calculation_type": "inputs",
    "processing_type": "mutes"
}'

if sudo $BRAINSTORM_MODULE_ALGOS_DIR/customers/follows-mutes-reports/calculateMuterInputs.sh $CUSTOMER_PUBKEY $CUSTOMER_ID $CUSTOMER_NAME; then
    # Emit structured event for child task success
    emit_task_event "CHILD_TASK_END" "processCustomerFollowsMutesReports" "$CUSTOMER_PUBKEY" '{
        "child_task": "calculateMuterInputs",
        "customer_id": "'$CUSTOMER_ID'",
        "customer_name": "'$CUSTOMER_NAME'",
        "step": 5,
        "status": "success",
        "message": "Muter inputs calculation completed successfully",
        "orchestrator": "processCustomerFollowsMutesReports",
        "calculation_type": "inputs",
        "processing_type": "mutes"
    }'
else
    # Emit structured event for child task error
    emit_task_event "CHILD_TASK_ERROR" "processCustomerFollowsMutesReports" "$CUSTOMER_PUBKEY" '{
        "child_task": "calculateMuterInputs",
        "customer_id": "'$CUSTOMER_ID'",
        "customer_name": "'$CUSTOMER_NAME'",
        "step": 5,
        "error_code": '$?',
        "message": "Muter inputs calculation failed",
        "orchestrator": "processCustomerFollowsMutesReports",
        "calculation_type": "inputs",
        "processing_type": "mutes"
    }'
fi

echo "$(date): Continuing processFollowsMutesReports ... finished calculating muter inputs"
echo "$(date): Continuing processFollowsMutesReports ... finished calculating muter inputs" >> ${LOG_FILE}

# Emit structured event for child task start
emit_task_event "CHILD_TASK_START" "processCustomerFollowsMutesReports" "$CUSTOMER_PUBKEY" '{
    "child_task": "calculateReporterInputs",
    "customer_id": "'$CUSTOMER_ID'",
    "customer_name": "'$CUSTOMER_NAME'",
    "step": 6,
    "total_steps": 6,
    "message": "Starting reporter inputs calculation",
    "orchestrator": "processCustomerFollowsMutesReports",
    "calculation_type": "inputs",
    "processing_type": "reports"
}'

if sudo $BRAINSTORM_MODULE_ALGOS_DIR/customers/follows-mutes-reports/calculateReporterInputs.sh $CUSTOMER_PUBKEY $CUSTOMER_ID $CUSTOMER_NAME; then
    # Emit structured event for child task success
    emit_task_event "CHILD_TASK_END" "processCustomerFollowsMutesReports" "$CUSTOMER_PUBKEY" '{
        "child_task": "calculateReporterInputs",
        "customer_id": "'$CUSTOMER_ID'",
        "customer_name": "'$CUSTOMER_NAME'",
        "step": 6,
        "status": "success",
        "message": "Reporter inputs calculation completed successfully",
        "orchestrator": "processCustomerFollowsMutesReports",
        "calculation_type": "inputs",
        "processing_type": "reports"
    }'
else
    # Emit structured event for child task error
    emit_task_event "CHILD_TASK_ERROR" "processCustomerFollowsMutesReports" "$CUSTOMER_PUBKEY" '{
        "child_task": "calculateReporterInputs",
        "customer_id": "'$CUSTOMER_ID'",
        "customer_name": "'$CUSTOMER_NAME'",
        "step": 6,
        "error_code": '$?',
        "message": "Reporter inputs calculation failed",
        "orchestrator": "processCustomerFollowsMutesReports",
        "calculation_type": "inputs",
        "processing_type": "reports"
    }'
fi

echo "$(date): Continuing processFollowsMutesReports ... finished calculating reporter inputs"
echo "$(date): Continuing processFollowsMutesReports ... finished calculating reporter inputs" >> ${LOG_FILE}

echo "$(date): Finished processFollowsMutesReports for $CUSTOMER_PUBKEY ($CUSTOMER_ID) ($CUSTOMER_NAME)"
echo "$(date): Finished processFollowsMutesReports for $CUSTOMER_PUBKEY ($CUSTOMER_ID) ($CUSTOMER_NAME)" >> ${LOG_FILE}

# Emit structured event for task completion
emit_task_event "TASK_END" "processCustomerFollowsMutesReports" "$CUSTOMER_PUBKEY" '{
    "customer_id": "'$CUSTOMER_ID'",
    "customer_pubkey": "'$CUSTOMER_PUBKEY'",
    "customer_name": "'$CUSTOMER_NAME'",
    "status": "success",
    "child_tasks_completed": 6,
    "processing_types": ["follows", "mutes", "reports"],
    "calculation_types": ["verified_counts", "inputs"],
    "message": "Follows, mutes, and reports processing completed successfully",
    "orchestrator": "processCustomerFollowsMutesReports",
    "category": "orchestrator",
    "parent_task": "updateAllScoresForSingleCustomer"
}'

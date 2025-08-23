#!/bin/bash

# This script will calculate all scores for a given customer.
# It will pass the customer_id as an argument to updateAllScoresForSingleCustomer.sh
# Progress will be logged to /var/log/brainstorm/updateAllScoresForSingleCustomer.log

CONFIG_FILE="/etc/brainstorm.conf"
source "$CONFIG_FILE" # BRAINSTORM_LOG_DIR

# Source structured logging utility
source "$BRAINSTORM_MODULE_BASE_DIR/src/utils/structuredLogging.sh"

# Check if customer_pubkey, customer_id, and customer_name are provided
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

# Create log directory if it doesn't exist; chown to brainstorm:brainstorm
mkdir -p "$LOG_DIR"
sudo chown brainstorm:brainstorm "$LOG_DIR"

# Log file
LOG_FILE="$LOG_DIR/updateAllScoresForSingleCustomer.log"
touch ${LOG_FILE}
sudo chown brainstorm:brainstorm ${LOG_FILE}

# Log start time
echo "$(date): Starting calculateAllScores for customer $CUSTOMER_ID and customer_pubkey $CUSTOMER_PUBKEY and customer_name $CUSTOMER_NAME"
echo "$(date): Starting calculateAllScores for customer $CUSTOMER_ID and customer_pubkey $CUSTOMER_PUBKEY and customer_name $CUSTOMER_NAME" >> "$LOG_FILE"

# Emit structured event for task start
oMetadata=$(jq -n \
    --argjson customer_id "$CUSTOMER_ID" \
    --arg customer_pubkey "$CUSTOMER_PUBKEY" \
    --arg customer_name "$CUSTOMER_NAME" \
    --arg description "Updates all trust scores for a single customer" \
    --argjson child_tasks 5 \
    --arg scope "customer_specific" \
    --arg orchestrator_level "secondary" \
    '{
        "customer_id": $customer_id,
        "customer_pubkey": $customer_pubkey,
        "customer_name": $customer_name,
        "description": $description,
        "child_tasks": $child_tasks,
        "scope": $scope,
        "orchestrator_level": $orchestrator_level
    }')
emit_task_event "TASK_START" "updateAllScoresForSingleCustomer" "$CUSTOMER_PUBKEY" "$oMetadata"

echo "$(date): Continuing calculateAllScores; starting calculateHops.sh"
echo "$(date): Continuing calculateAllScores; starting calculateHops.sh" >> "$LOG_FILE"

# Emit structured event for child task start
oMetadata=$(jq -n \
    --argjson customer_id "$CUSTOMER_ID" \
    --arg customer_pubkey "$CUSTOMER_PUBKEY" \
    --arg customer_name "$CUSTOMER_NAME" \
    --arg parent_task "updateAllScoresForSingleCustomer" \
    --argjson child_order 1 \
    --arg algorithm "hop_calculation" \
    --arg category "algorithms" \
    '{
        "customer_id": $customer_id,
        "customer_pubkey": $customer_pubkey,
        "customer_name": $customer_name,
        "parent_task": $parent_task,
        "child_order": $child_order,
        "algorithm": $algorithm,
        "category": $category
    }')
emit_task_event "CHILD_TASK_START" "calculateCustomerHops" "$CUSTOMER_PUBKEY" "$oMetadata"

# Run calculateHops.sh
if sudo bash $BRAINSTORM_MODULE_ALGOS_DIR/customers/calculateHops.sh "$CUSTOMER_PUBKEY" "$CUSTOMER_ID" "$CUSTOMER_NAME"; then
    oMetadata=$(jq -n \
        --argjson customer_id "$CUSTOMER_ID" \
        --arg customer_pubkey "$CUSTOMER_PUBKEY" \
        --arg customer_name "$CUSTOMER_NAME" \
        --arg parent_task "updateAllScoresForSingleCustomer" \
        --argjson child_order 1 \
        --arg algorithm "hop_calculation" \
        --arg category "algorithms" \
        --argjson structured_logging true \
        ' {
            "customer_id": $customer_id,
            "customer_pubkey": $customer_pubkey,
            "customer_name": $customer_name,
            "parent_task": $parent_task,
            "child_order": $child_order,
            "algorithm": $algorithm,
            "category": $category,
            "structured_logging": $structured_logging
        }')
    emit_task_event "CHILD_TASK_END" "calculateCustomerHops" "$CUSTOMER_PUBKEY" "$oMetadata"
else
    oMetadata=$(jq -n \
        --argjson customer_id "$CUSTOMER_ID" \
        --arg customer_pubkey "$CUSTOMER_PUBKEY" \
        --arg customer_name "$CUSTOMER_NAME" \
        --arg parent_task "updateAllScoresForSingleCustomer" \
        --argjson child_order 1 \
        --arg algorithm "hop_calculation" \
        --arg category "algorithms" \
        --argjson structured_logging true \
        ' {
            "customer_id": $customer_id,
            "customer_pubkey": $customer_pubkey,
            "customer_name": $customer_name,
            "parent_task": $parent_task,
            "child_order": $child_order,
            "algorithm": $algorithm,
            "category": $category,
            "structured_logging": $structured_logging
        }')
    emit_task_event "CHILD_TASK_ERROR" "calculateCustomerHops" "$CUSTOMER_PUBKEY" "$oMetadata"
    echo "$(date): ERROR: calculateHops.sh failed for customer $CUSTOMER_NAME" >> "$LOG_FILE"
fi

echo "$(date): Continuing calculateAllScores; starting personalizedPageRank.sh"
echo "$(date): Continuing calculateAllScores; starting personalizedPageRank.sh" >> "$LOG_FILE"

# Emit structured event for child task start
oMetadata=$(jq -n \
    --argjson customer_id "$CUSTOMER_ID" \
    --arg customer_pubkey "$CUSTOMER_PUBKEY" \
    --arg customer_name "$CUSTOMER_NAME" \
    --arg parent_task "updateAllScoresForSingleCustomer" \
    --argjson child_order 2 \
    --arg algorithm "personalized_pagerank" \
    --arg category "algorithms" \
    --argjson structured_logging true \
    '{
        "customer_id": $customer_id,
        "customer_pubkey": $customer_pubkey,
        "customer_name": $customer_name,
        "parent_task": $parent_task,
        "child_order": $child_order,
        "algorithm": $algorithm,
        "category": $category,
        "structured_logging": $structured_logging
    }')
emit_task_event "CHILD_TASK_START" "calculateCustomerPageRank" "$CUSTOMER_PUBKEY" "$oMetadata"

# Run personalizedPageRank.sh
if sudo bash $BRAINSTORM_MODULE_ALGOS_DIR/customers/personalizedPageRank.sh "$CUSTOMER_PUBKEY" "$CUSTOMER_ID" "$CUSTOMER_NAME"; then
    oMetadata=$(jq -n \
        --argjson customer_id "$CUSTOMER_ID" \
        --arg customer_pubkey "$CUSTOMER_PUBKEY" \
        --arg customer_name "$CUSTOMER_NAME" \
        --arg parent_task "updateAllScoresForSingleCustomer" \
        --argjson child_order 2 \
        --arg algorithm "personalized_pagerank" \
        --arg category "algorithms" \
        --argjson structured_logging true \
        ' {
            "customer_id": $customer_id,
            "customer_pubkey": $customer_pubkey,
            "customer_name": $customer_name,
            "parent_task": $parent_task,
            "child_order": $child_order,
            "algorithm": $algorithm,
            "category": $category,
            "structured_logging": $structured_logging
        }')
    emit_task_event "CHILD_TASK_END" "calculateCustomerPageRank" "$CUSTOMER_PUBKEY" "$oMetadata"
else
    oMetadata=$(jq -n \
        --argjson customer_id "$CUSTOMER_ID" \
        --arg customer_pubkey "$CUSTOMER_PUBKEY" \
        --arg customer_name "$CUSTOMER_NAME" \
        --arg parent_task "updateAllScoresForSingleCustomer" \
        --argjson child_order 2 \
        --arg algorithm "personalized_pagerank" \
        --arg category "algorithms" \
        --argjson structured_logging true \
        ' {
            "customer_id": $customer_id,
            "customer_pubkey": $customer_pubkey,
            "customer_name": $customer_name,
            "parent_task": $parent_task,
            "child_order": $child_order,
            "algorithm": $algorithm,
            "category": $category,
            "structured_logging": $structured_logging
        }')
    emit_task_event "CHILD_TASK_ERROR" "calculateCustomerPageRank" "$CUSTOMER_PUBKEY" "$oMetadata"
    echo "$(date): ERROR: personalizedPageRank.sh failed for customer $CUSTOMER_NAME" >> "$LOG_FILE"
fi
    oMetadata=$(jq -n \
        --argjson customer_id "$CUSTOMER_ID" \
        --arg customer_pubkey "$CUSTOMER_PUBKEY" \
        --arg customer_name "$CUSTOMER_NAME" \
        --arg parent_task "updateAllScoresForSingleCustomer" \
        --argjson child_order 2 \
        --arg algorithm "personalized_pagerank" \
        --arg category "algorithms" \
        --argjson structured_logging true \
        ' {
            "customer_id": $customer_id,
            "customer_pubkey": $customer_pubkey,
            "customer_name": $customer_name,
            "parent_task": $parent_task,
            "child_order": $child_order,
            "algorithm": $algorithm,
            "category": $category,
            "structured_logging": $structured_logging
        }')
    emit_task_event "CHILD_TASK_END" "calculateCustomerPageRank" "$CUSTOMER_PUBKEY" "$oMetadata"
else
    oMetadata=$(jq -n \
        --argjson customer_id "$CUSTOMER_ID" \
        --arg customer_pubkey "$CUSTOMER_PUBKEY" \
        --arg customer_name "$CUSTOMER_NAME" \
        --arg parent_task "updateAllScoresForSingleCustomer" \
        --argjson child_order 2 \
        --arg algorithm "personalized_pagerank" \
        --arg category "algorithms" \
        --argjson structured_logging true \
        ' {
            "customer_id": $customer_id,
            "customer_pubkey": $customer_pubkey,
            "customer_name": $customer_name,
            "parent_task": $parent_task,
            "child_order": $child_order,
            "algorithm": $algorithm,
            "category": $category,
            "structured_logging": $structured_logging
        }')
    emit_task_event "CHILD_TASK_ERROR" "calculateCustomerPageRank" "$CUSTOMER_PUBKEY" "$oMetadata"
    echo "$(date): ERROR: personalizedPageRank.sh failed for customer $CUSTOMER_NAME" >> "$LOG_FILE"
fi

echo "$(date): Continuing calculateAllScores; starting personalizedGrapeRank.sh"
echo "$(date): Continuing calculateAllScores; starting personalizedGrapeRank.sh" >> "$LOG_FILE"

# Emit structured event for child task start
oMetadata=$(jq -n \
    --argjson customer_id "$CUSTOMER_ID" \
    --arg customer_pubkey "$CUSTOMER_PUBKEY" \
    --arg customer_name "$CUSTOMER_NAME" \
    --arg parent_task "updateAllScoresForSingleCustomer" \
    --argjson child_order 3 \
    --arg algorithm "personalized_graperank" \
    --arg category "algorithms" \
    --argjson structured_logging true \
    '{
        "customer_id": $customer_id,
        "customer_pubkey": $customer_pubkey,
        "customer_name": $customer_name,
        "parent_task": $parent_task,
        "child_order": $child_order,
        "algorithm": $algorithm,
        "category": $category,
        "structured_logging": $structured_logging
    }')
emit_task_event "CHILD_TASK_START" "calculateCustomerGrapeRank" "$CUSTOMER_PUBKEY" "$oMetadata"

# Run personalizedGrapeRank.sh
if sudo bash $BRAINSTORM_MODULE_ALGOS_DIR/customers/personalizedGrapeRank/personalizedGrapeRank.sh "$CUSTOMER_PUBKEY" "$CUSTOMER_ID" "$CUSTOMER_NAME"; then
    oMetadata=$(jq -n \
    --argjson customer_id "$CUSTOMER_ID" \
    --arg customer_pubkey "$CUSTOMER_PUBKEY" \
    --arg customer_name "$CUSTOMER_NAME" \
    --arg parent_task "updateAllScoresForSingleCustomer" \
    --argjson child_order 3 \
    --arg algorithm "personalized_graperank" \
    --arg category "algorithms" \
    --argjson structured_logging true \
    ' {
        "customer_id": $customer_id,
        "customer_pubkey": $customer_pubkey,
        "customer_name": $customer_name,
        "parent_task": $parent_task,
        "child_order": $child_order,
        "algorithm": $algorithm,
        "category": $category,
        "structured_logging": $structured_logging
    }')
    emit_task_event "CHILD_TASK_END" "calculateCustomerGrapeRank" "$CUSTOMER_PUBKEY" "$oMetadata"
else
    oMetadata=$(jq -n \
    --argjson customer_id "$CUSTOMER_ID" \
    --arg customer_pubkey "$CUSTOMER_PUBKEY" \
    --arg customer_name "$CUSTOMER_NAME" \
    --arg parent_task "updateAllScoresForSingleCustomer" \
    --argjson child_order 3 \
    --arg algorithm "personalized_graperank" \
    --arg category "algorithms" \
    --argjson structured_logging true \
    ' {
        "customer_id": $customer_id,
        "customer_pubkey": $customer_pubkey,
        "customer_name": $customer_name,
        "parent_task": $parent_task,
        "child_order": $child_order,
        "algorithm": $algorithm,
        "category": $category,
        "structured_logging": $structured_logging
    }')
    emit_task_event "CHILD_TASK_ERROR" "calculateCustomerGrapeRank" "$CUSTOMER_PUBKEY" "$oMetadata"
    echo "$(date): ERROR: personalizedGrapeRank.sh failed for customer $CUSTOMER_NAME" >> "$LOG_FILE"
fi    
    oMetadata=$(jq -n \
    --argjson customer_id "$CUSTOMER_ID" \
    --arg customer_pubkey "$CUSTOMER_PUBKEY" \
    --arg customer_name "$CUSTOMER_NAME" \
    --arg parent_task "updateAllScoresForSingleCustomer" \
    --argjson child_order 3 \
    --arg algorithm "personalized_graperank" \
    --arg category "algorithms" \
    --argjson structured_logging true \
    ' {
        "customer_id": $customer_id,
        "customer_pubkey": $customer_pubkey,
        "customer_name": $customer_name,
        "parent_task": $parent_task,
        "child_order": $child_order,
        "algorithm": $algorithm,
        "category": $category,
        "structured_logging": $structured_logging
    }')
    emit_task_event "CHILD_TASK_END" "calculateCustomerGrapeRank" "$CUSTOMER_PUBKEY" "$oMetadata"   
else
    oMetadata=$(jq -n \
        --argjson customer_id "$CUSTOMER_ID" \
        --arg customer_pubkey "$CUSTOMER_PUBKEY" \
        --arg customer_name "$CUSTOMER_NAME" \
        --arg parent_task "updateAllScoresForSingleCustomer" \
        --argjson child_order 3 \
        --arg algorithm "personalized_graperank" \
        --arg category "algorithms" \
        --argjson structured_logging true \
        ' {
            "customer_id": $customer_id,
            "customer_pubkey": $customer_pubkey,
            "customer_name": $customer_name,
            "parent_task": $parent_task,
            "child_order": $child_order,
            "algorithm": $algorithm,
            "category": $category,
            "structured_logging": $structured_logging
        }')
    emit_task_event "CHILD_TASK_ERROR" "calculateCustomerGrapeRank" "$CUSTOMER_PUBKEY" "$oMetadata"
    echo "$(date): ERROR: personalizedGrapeRank.sh failed for customer $CUSTOMER_NAME" >> "$LOG_FILE"
fi

echo "$(date): Continuing calculateAllScores; starting processFollowsMutesReports.sh"
echo "$(date): Continuing calculateAllScores; starting processFollowsMutesReports.sh" >> "$LOG_FILE"

# Emit structured event for child task start
oMetadata=$(jq -n \
    --argjson customer_id "$CUSTOMER_ID" \
    --arg customer_pubkey "$CUSTOMER_PUBKEY" \
    --arg customer_name "$CUSTOMER_NAME" \
    --arg parent_task "updateAllScoresForSingleCustomer" \
    --argjson child_order 4 \
    --arg algorithm "follows_mutes_reports" \
    --arg category "algorithms" \
    --argjson structured_logging true \
    '{
        "customer_id": $customer_id,
        "customer_pubkey": $customer_pubkey,
        "customer_name": $customer_name,
        "parent_task": $parent_task,
        "child_order": $child_order,
        "algorithm": $algorithm,
        "category": $category,
        "structured_logging": $structured_logging
    }')
emit_task_event "CHILD_TASK_START" "processCustomerFollowsMutesReports" "$CUSTOMER_PUBKEY" "$oMetadata"

# Run processFollowsMutesReports.sh
if sudo bash $BRAINSTORM_MODULE_ALGOS_DIR/customers/follows-mutes-reports/processFollowsMutesReports.sh "$CUSTOMER_PUBKEY" "$CUSTOMER_ID" "$CUSTOMER_NAME"; then
    oMetadata=$(jq -n \
    --argjson customer_id "$CUSTOMER_ID" \
    --arg customer_pubkey "$CUSTOMER_PUBKEY" \
    --arg customer_name "$CUSTOMER_NAME" \
    --arg parent_task "updateAllScoresForSingleCustomer" \
    --argjson child_order 4 \
    --arg algorithm "follows_mutes_reports" \
    --arg category "algorithms" \
    --argjson structured_logging true \
    ' {
        "customer_id": $customer_id,
        "customer_pubkey": $customer_pubkey,
        "customer_name": $customer_name,
        "parent_task": $parent_task,
        "child_order": $child_order,
        "algorithm": $algorithm,
        "category": $category,
        "structured_logging": $structured_logging
    }')
    emit_task_event "CHILD_TASK_END" "processCustomerFollowsMutesReports" "$CUSTOMER_PUBKEY" "$oMetadata"
else
    oMetadata=$(jq -n \
        --argjson customer_id "$CUSTOMER_ID" \
        --arg customer_pubkey "$CUSTOMER_PUBKEY" \
        --arg customer_name "$CUSTOMER_NAME" \
        --arg parent_task "updateAllScoresForSingleCustomer" \
        --argjson child_order 4 \
        --arg algorithm "follows_mutes_reports" \
        --arg category "algorithms" \
        --argjson structured_logging true \
        ' {
            "customer_id": $customer_id,
            "customer_pubkey": $customer_pubkey,
            "customer_name": $customer_name,
            "parent_task": $parent_task,
            "child_order": $child_order,
            "algorithm": $algorithm,
            "category": $category,
            "structured_logging": $structured_logging
        }')
    emit_task_event "CHILD_TASK_ERROR" "processCustomerFollowsMutesReports" "$CUSTOMER_PUBKEY" "$oMetadata"
    echo "$(date): ERROR: processFollowsMutesReports.sh failed for customer $CUSTOMER_NAME" >> "$LOG_FILE"
fi

# TODO:
# process nip-56 reports by reportType
# create blacklist
# create whitelist

echo "$(date): Continuing calculateAllScores; starting publishNip85.sh"
echo "$(date): Continuing calculateAllScores; starting publishNip85.sh" >> "$LOG_FILE"

# Emit structured event for child task start
oMetadata=$(jq -n \
    --argjson customer_id "$CUSTOMER_ID" \
    --arg customer_pubkey "$CUSTOMER_PUBKEY" \
    --arg customer_name "$CUSTOMER_NAME" \
    --arg parent_task "updateAllScoresForSingleCustomer" \
    --argjson child_order 5 \
    --arg algorithm "nip85_export" \
    --arg category "algorithms" \
    --argjson structured_logging true \
    ' {
        "customer_id": $customer_id,
        "customer_pubkey": $customer_pubkey,
        "customer_name": $customer_name,
        "parent_task": $parent_task,
        "child_order": $child_order,
        "algorithm": $algorithm,
        "category": $category,
        "structured_logging": $structured_logging
    }')
emit_task_event "CHILD_TASK_START" "exportCustomerKind30382" "$CUSTOMER_PUBKEY" "$oMetadata"

# generate nip-85 exports
if sudo bash $BRAINSTORM_MODULE_ALGOS_DIR/customers/nip85/publishNip85.sh "$CUSTOMER_PUBKEY" "$CUSTOMER_ID" "$CUSTOMER_NAME"; then
    oMetadata=$(jq -n \
    --argjson customer_id "$CUSTOMER_ID" \
    --arg customer_pubkey "$CUSTOMER_PUBKEY" \
    --arg customer_name "$CUSTOMER_NAME" \
    --arg parent_task "updateAllScoresForSingleCustomer" \
    --argjson child_order 5 \
    --arg algorithm "nip85_export" \
    --arg category "algorithms" \
    --argjson structured_logging true \
    ' {
        "customer_id": $customer_id,
        "customer_pubkey": $customer_pubkey,
        "customer_name": $customer_name,
        "parent_task": $parent_task,
        "child_order": $child_order,
        "algorithm": $algorithm,
        "category": $category,
        "structured_logging": $structured_logging
    }')
    emit_task_event "CHILD_TASK_END" "exportCustomerKind30382" "$CUSTOMER_PUBKEY" "$oMetadata"
else
    oMetadata=$(jq -n \
    --argjson customer_id "$CUSTOMER_ID" \
    --arg customer_pubkey "$CUSTOMER_PUBKEY" \
    --arg customer_name "$CUSTOMER_NAME" \
    --arg parent_task "updateAllScoresForSingleCustomer" \
    --argjson child_order 5 \
    --arg algorithm "nip85_export" \
    --arg category "algorithms" \
    --argjson structured_logging true \
    ' {
        "customer_id": $customer_id,
        "customer_pubkey": $customer_pubkey,
        "customer_name": $customer_name,
        "parent_task": $parent_task,
        "child_order": $child_order,
        "algorithm": $algorithm,
        "category": $category,
        "structured_logging": $structured_logging
    }')
    emit_task_event "CHILD_TASK_ERROR" "exportCustomerKind30382" "$CUSTOMER_PUBKEY" "$oMetadata"
    echo "$(date): ERROR: publishNip85.sh failed for customer $CUSTOMER_NAME" >> "$LOG_FILE"
fi

# Log end time
echo "$(date): Finished calculateAllScores for customer $CUSTOMER_ID and customer_pubkey $CUSTOMER_PUBKEY and customer_name $CUSTOMER_NAME"
echo "$(date): Finished calculateAllScores for customer $CUSTOMER_ID and customer_pubkey $CUSTOMER_PUBKEY and customer_name $CUSTOMER_NAME" >> "$LOG_FILE"

# Emit structured event for task completion
oMetadata=$(jq -n \
    --argjson customer_id "$CUSTOMER_ID" \
    --arg customer_pubkey "$CUSTOMER_PUBKEY" \
    --arg customer_name "$CUSTOMER_NAME" \
    --arg parent_task "updateAllScoresForSingleCustomer" \
    --argjson child_tasks_completed 5 \
    --arg description "Updates all trust scores for a single customer" \
    --arg scope "customer_specific" \
    --arg orchestrator_level "secondary" \
    --arg algorithm "update_all_scores" \
    --arg category "algorithms" \
    --argjson structured_logging true \
    ' {
        "customer_id": $customer_id,
        "customer_pubkey": $customer_pubkey,
        "customer_name": $customer_name,
        "parent_task": $parent_task,
        "child_tasks_completed": $child_tasks_completed,
        "description": $description,
        "scope": $scope,
        "orchestrator_level": $orchestrator_level,
        "algorithm": $algorithm,
        "category": $category,
        "structured_logging": $structured_logging
    }')
emit_task_event "TASK_END" "updateAllScoresForSingleCustomer" "$CUSTOMER_PUBKEY" "$oMetadata"

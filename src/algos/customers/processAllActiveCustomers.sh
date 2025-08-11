#!/bin/bash

# processAllActiveCustomers.sh
# Consolidated script to process all active customers
# Replaces the processAllActiveCustomers.sh (deprecated) + processAllActiveCustomers.js combination

# Source configuration
source /etc/brainstorm.conf # BRAINSTORM_MODULE_ALGOS_DIR, BRAINSTORM_LOG_DIR

# Source structured logging utilities
source "$BRAINSTORM_MODULE_BASE_DIR/src/utils/structuredLogging.sh"

# Create log directory if it doesn't exist; chown to brainstorm:brainstorm
mkdir -p "$BRAINSTORM_LOG_DIR"
sudo chown brainstorm:brainstorm "$BRAINSTORM_LOG_DIR"

# Log file
LOG_FILE="$BRAINSTORM_LOG_DIR/processAllActiveCustomers.log"
touch ${LOG_FILE}
sudo chown brainstorm:brainstorm ${LOG_FILE}

# Logging function
log_message() {
    echo "$(date): $1"
    echo "$(date): $1" >> ${LOG_FILE}
}

log_message "Starting processAllActiveCustomers"

# Emit structured event for task start
emit_task_event "TASK_START" "processAllActiveCustomers" "" '{
    "message": "Starting processing of all active customers",
    "orchestrator_type": "customer_iteration",
    "description": "Consolidated script to process all active customers",
    "scope": "all_customers"
}'

# Define paths
ALGOS_DIR="${BRAINSTORM_MODULE_ALGOS_DIR}"
CUSTOMERS_DIR='/var/lib/brainstorm/customers';
CUSTOMERS_JSON="${CUSTOMERS_DIR}/customers.json";
PROCESS_CUSTOMER_SCRIPT="${ALGOS_DIR}/customers/processCustomer.sh"

# Check if customers.json exists
if [ ! -f "$CUSTOMERS_JSON" ]; then
    log_message "Error: Customers file not found at $CUSTOMERS_JSON"
    exit 1
fi

# Check if processCustomer.sh exists
if [ ! -f "$PROCESS_CUSTOMER_SCRIPT" ]; then
    log_message "Error: processCustomer.sh not found at $PROCESS_CUSTOMER_SCRIPT"
    exit 1
fi

log_message "Reading customers from $CUSTOMERS_JSON"

# Parse JSON and extract active customers
# Using jq to parse JSON safely
if ! command -v jq &> /dev/null; then
    log_message "Error: jq is required but not installed"
    exit 1
fi

# Get active customers using jq
active_customers=$(jq -r '.customers | to_entries[] | select(.value.status == "active") | "\(.value.id),\(.value.pubkey),\(.value.name)"' "$CUSTOMERS_JSON")

if [ -z "$active_customers" ]; then
    log_message "No active customers found"
    exit 0
fi

# Count active customers
customer_count=$(echo "$active_customers" | wc -l)
log_message "Found $customer_count active customers"

# Emit structured event for customer discovery
emit_task_event "PROGRESS" "processAllActiveCustomers" "" '{
    "step": "customer_discovery",
    "active_customers_found": '$customer_count',
    "message": "Discovered active customers from customers.json",
    "data_source": "customers.json",
    "operation": "customer_enumeration"
}'

# Process each active customer
processed_count=0
failed_count=0

# Emit structured event for processing start
emit_task_event "PROGRESS" "processAllActiveCustomers" "" '{
    "step": "customer_processing_start",
    "total_customers": '$customer_count',
    "message": "Starting individual customer processing",
    "operation": "batch_processing_initialization"
}'

while IFS=',' read -r customer_id customer_pubkey customer_name; do
    log_message "Processing customer: $customer_name (id: $customer_id) with pubkey $customer_pubkey"
    
    # Emit structured event for child task start
    emit_task_event "CHILD_TASK_START" "processAllActiveCustomers" "" '{
        "child_task": "processCustomer",
        "customer_id": "'$customer_id'",
        "customer_pubkey": "'$customer_pubkey'",
        "customer_name": "'$customer_name'",
        "message": "Starting processing for customer '$customer_name'",
        "operation": "individual_customer_processing"
    }'
    
    # Construct and execute the command
    command="sudo bash $PROCESS_CUSTOMER_SCRIPT $customer_pubkey $customer_id $customer_name"
    log_message "Executing: $command"
    
    if $command; then
        log_message "Successfully completed processing for customer: $customer_name"
        ((processed_count++))
        
        # Emit structured event for child task success
        emit_task_event "CHILD_TASK_END" "processAllActiveCustomers" "" '{
            "child_task": "processCustomer",
            "customer_id": "'$customer_id'",
            "customer_name": "'$customer_name'",
            "status": "success",
            "message": "Successfully completed processing for customer '$customer_name'",
            "operation": "individual_customer_processing"
        }'
    else
        log_message "Error processing customer $customer_name"
        ((failed_count++))
        
        # Emit structured event for child task error
        emit_task_event "CHILD_TASK_ERROR" "processAllActiveCustomers" "" '{
            "child_task": "processCustomer",
            "customer_id": "'$customer_id'",
            "customer_name": "'$customer_name'",
            "status": "error",
            "message": "Error processing customer '$customer_name'",
            "operation": "individual_customer_processing"
        }'
        
        # Continue with other customers even if one fails
    fi
done <<< "$active_customers"

log_message "Processing summary: $processed_count successful, $failed_count failed out of $customer_count total"

# Emit structured event for processing summary
emit_task_event "PROGRESS" "processAllActiveCustomers" "" '{
    "step": "processing_summary",
    "total_customers": '$customer_count',
    "successful_customers": '$processed_count',
    "failed_customers": '$failed_count',
    "message": "Completed processing all customers",
    "operation": "batch_processing_summary",
    "success_rate": "'$(echo "scale=2; $processed_count * 100 / $customer_count" | bc)'"
}'

# Clean up personalizedGrapeRank tmp files
log_message "Cleaning up personalizedGrapeRank tmp files"

# Emit structured event for cleanup start
emit_task_event "PROGRESS" "processAllActiveCustomers" "" '{
    "step": "cleanup_start",
    "message": "Starting cleanup of personalizedGrapeRank tmp files",
    "operation": "temporary_file_cleanup",
    "cleanup_target": "/var/lib/brainstorm/algos/personalizedGrapeRank/tmp"
}'

sudo rm -rf /var/lib/brainstorm/algos/personalizedGrapeRank/tmp

# Emit structured event for cleanup completion
emit_task_event "PROGRESS" "processAllActiveCustomers" "" '{
    "step": "cleanup_complete",
    "message": "Completed cleanup of personalizedGrapeRank tmp files",
    "operation": "temporary_file_cleanup",
    "cleanup_target": "/var/lib/brainstorm/algos/personalizedGrapeRank/tmp"
}'

log_message "Finished processAllActiveCustomers"

# Emit structured event for task completion
if [ $failed_count -gt 0 ]; then
    emit_task_event "TASK_END" "processAllActiveCustomers" "" '{
        "status": "partial_success",
        "total_customers": '$customer_count',
        "successful_customers": '$processed_count',
        "failed_customers": '$failed_count',
        "orchestrator_type": "customer_iteration",
        "message": "Completed processing all active customers with some failures",
        "success_rate": "'$(echo "scale=2; $processed_count * 100 / $customer_count" | bc)'"
    }'
    exit 1
else
    emit_task_event "TASK_END" "processAllActiveCustomers" "" '{
        "status": "success",
        "total_customers": '$customer_count',
        "successful_customers": '$processed_count',
        "failed_customers": '$failed_count',
        "orchestrator_type": "customer_iteration",
        "message": "Successfully completed processing all active customers",
        "success_rate": "100.00"
    }'
    exit 0
fi

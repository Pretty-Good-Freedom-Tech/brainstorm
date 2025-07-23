#!/bin/bash

# processAllActiveCustomers.sh
# Consolidated script to process all active customers
# Replaces the processAllActiveCustomers.sh (deprecated) + processAllActiveCustomers.js combination

# Source configuration
source /etc/brainstorm.conf # BRAINSTORM_MODULE_ALGOS_DIR, BRAINSTORM_LOG_DIR

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

# Process each active customer
processed_count=0
failed_count=0

while IFS=',' read -r customer_id customer_pubkey customer_name; do
    log_message "Processing customer: $customer_name (id: $customer_id) with pubkey $customer_pubkey"
    
    # Construct and execute the command
    command="sudo bash $PROCESS_CUSTOMER_SCRIPT $customer_pubkey $customer_id $customer_name"
    log_message "Executing: $command"
    
    if $command; then
        log_message "Successfully completed processing for customer: $customer_name"
        ((processed_count++))
    else
        log_message "Error processing customer $customer_name"
        ((failed_count++))
        # Continue with other customers even if one fails
    fi
done <<< "$active_customers"

log_message "Processing summary: $processed_count successful, $failed_count failed out of $customer_count total"

# Clean up personalizedGrapeRank tmp files
log_message "Cleaning up personalizedGrapeRank tmp files"
sudo rm -rf /var/lib/brainstorm/algos/personalizedGrapeRank/tmp

log_message "Finished processAllActiveCustomers"

# Exit with error if any customers failed
if [ $failed_count -gt 0 ]; then
    exit 1
fi

exit 0

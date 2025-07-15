#!/bin/bash

CONFIG_FILE="/etc/brainstorm.conf"
source "$CONFIG_FILE" # BRAINSTORM_MODULE_ALGOS_DIR

SCRIPTS_DIR="$BRAINSTORM_MODULE_ALGOS_DIR/customers/"

CUSTOMERS_DIR="/var/lib/brainstorm/customers"

# Check if customer_pubkey is provided
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

# Create log directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Log file
LOG_FILE="$LOG_DIR/processCustomer.log"

touch ${LOG_FILE}
sudo chown brainstorm:brainstorm ${LOG_FILE}

# Log start time
echo "$(date): Starting processCustomer for customer_name $CUSTOMER_NAME customer_pubkey $CUSTOMER_PUBKEY and customer_id $CUSTOMER_ID"
echo "$(date): Starting processCustomer for customer_name $CUSTOMER_NAME customer_pubkey $CUSTOMER_PUBKEY and customer_id $CUSTOMER_ID" >> "$LOG_FILE"

echo "$(date): Continuing processCustomer; starting prepareNeo4jForCustomerData.sh"
echo "$(date): Continuing processCustomer; starting prepareNeo4jForCustomerData.sh" >> "$LOG_FILE"

sudo bash $BRAINSTORM_MODULE_BASE_DIR/src/cns/prepareNeo4jForCustomerData.sh $CUSTOMER_PUBKEY $CUSTOMER_ID $CUSTOMER_NAME# do preliminary steps for GrapeRank that are common to all customers, i.e. generate all ratings

echo "$(date): Continuing processCustomer; starting updateAllScoresForSingleCustomer.sh"
echo "$(date): Continuing processCustomer; starting updateAllScoresForSingleCustomer.sh" >> "$LOG_FILE"

# Set the timeout in seconds (25 minutes = 1500 seconds)
TIMEOUT=1500
# Maximum number of retry attempts
MAX_RETRIES=3
# Current retry count
RETRY_COUNT=0

# Function to run the script with a timeout
run_with_timeout() {
    # Create a unique marker file to detect completion
    COMPLETION_MARKER="/tmp/scores_completed_${CUSTOMER_ID}_$(date +%s)"
    
    # Run the script in background
    {
        sudo bash $BRAINSTORM_MODULE_ALGOS_DIR/customers/updateAllScoresForSingleCustomer.sh $CUSTOMER_PUBKEY $CUSTOMER_ID $CUSTOMER_NAME
        # Create marker file upon successful completion
        touch "$COMPLETION_MARKER"
    } &
    
    # Get the background process ID
    BG_PID=$!
    
    # Wait for either completion or timeout
    ELAPSED=0
    SLEEP_INTERVAL=10
    
    while [ $ELAPSED -lt $TIMEOUT ]; do
        # Check if the process is still running
        if ! ps -p $BG_PID > /dev/null; then
            # Process has finished, check if it completed successfully
            if [ -f "$COMPLETION_MARKER" ]; then
                echo "$(date): updateAllScoresForSingleCustomer.sh completed successfully after $ELAPSED seconds"
                echo "$(date): updateAllScoresForSingleCustomer.sh completed successfully after $ELAPSED seconds" >> "$LOG_FILE"
                rm -f "$COMPLETION_MARKER"
                return 0
            else
                echo "$(date): updateAllScoresForSingleCustomer.sh exited prematurely without completion marker"
                echo "$(date): updateAllScoresForSingleCustomer.sh exited prematurely without completion marker" >> "$LOG_FILE"
                return 1
            fi
        fi
        
        # Sleep for interval and update elapsed time
        sleep $SLEEP_INTERVAL
        ELAPSED=$((ELAPSED + SLEEP_INTERVAL))
        
        # Optional: log progress
        if [ $((ELAPSED % 60)) -eq 0 ]; then
            echo "$(date): updateAllScoresForSingleCustomer.sh still running after $ELAPSED seconds"
            echo "$(date): updateAllScoresForSingleCustomer.sh still running after $ELAPSED seconds" >> "$LOG_FILE"
        fi
    done
    
    # If we get here, we've timed out
    echo "$(date): updateAllScoresForSingleCustomer.sh timed out after $TIMEOUT seconds"
    echo "$(date): updateAllScoresForSingleCustomer.sh timed out after $TIMEOUT seconds" >> "$LOG_FILE"
    
    # Kill the background process and its children
    sudo pkill -P $BG_PID 2>/dev/null
    sudo kill -9 $BG_PID 2>/dev/null
    
    # Clean up marker file if it exists
    rm -f "$COMPLETION_MARKER"
    
    return 1
}

# Run with retries
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    echo "$(date): Attempt $(($RETRY_COUNT + 1)) of $MAX_RETRIES to run updateAllScoresForSingleCustomer.sh"
    echo "$(date): Attempt $(($RETRY_COUNT + 1)) of $MAX_RETRIES to run updateAllScoresForSingleCustomer.sh" >> "$LOG_FILE"
    
    # Run the script with timeout
    run_with_timeout
    
    # Check if it was successful
    if [ $? -eq 0 ]; then
        break
    fi
    
    # Increment retry count
    RETRY_COUNT=$((RETRY_COUNT + 1))
    
    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
        echo "$(date): Retrying updateAllScoresForSingleCustomer.sh in 30 seconds..."
        echo "$(date): Retrying updateAllScoresForSingleCustomer.sh in 30 seconds..." >> "$LOG_FILE"
        sleep 30
    else
        echo "$(date): Maximum retry attempts ($MAX_RETRIES) reached. Giving up."
        echo "$(date): Maximum retry attempts ($MAX_RETRIES) reached. Giving up." >> "$LOG_FILE"
    fi
done

# Log end time
echo "$(date): Finished processCustomer for customer_name $CUSTOMER_NAME customer_pubkey $CUSTOMER_PUBKEY and customer_id $CUSTOMER_ID"
echo "$(date): Finished processCustomer for customer_name $CUSTOMER_NAME customer_pubkey $CUSTOMER_PUBKEY and customer_id $CUSTOMER_ID" >> "$LOG_FILE"

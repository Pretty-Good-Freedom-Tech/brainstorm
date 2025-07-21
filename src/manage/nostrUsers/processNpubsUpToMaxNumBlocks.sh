#!/bin/bash

# processNpubsUpToMaxNumBlocks.sh - Repeatedly run processNpubsOneBlock.sh until all NostrUser nodes have npub property
# This script ensures complete coverage by running processNpubsOneBlock in a loop until no more npubs need to be generated

# Source configuration
source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR, NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Log file for complete npubs operations
LOG_FILE="$BRAINSTORM_LOG_DIR/processNpubsUpToMaxNumBlocks.log"

# Default MAX_ITERATIONS
MAX_ITERATIONS=50

# allow MAX_ITERATIONS as an optional parameter
if [ "$1" ]; then
    MAX_ITERATIONS=$1
fi

# Create log directory if it doesn't exist
mkdir -p "$(dirname "$LOG_FILE")"
touch "$LOG_FILE"

# Function to log messages
log_message() {
    local message="$1"
    echo "$(date): $message"
    echo "$(date): $message" >> "$LOG_FILE"
}

# Function to count NostrUsers missing npub property
count_missing_npubs() {
    local count_query="
    MATCH (u:NostrUser) 
    WHERE u.pubkey IS NOT NULL 
      AND (u.npub IS NULL OR u.npub = '') 
    RETURN count(u) as missing_count
    "
    
    local result=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" \
        "$count_query" 2>/dev/null | tail -n 1 | tr -d '"' || echo "0")
    
    echo "$result"
}

# Function to count total NostrUsers with pubkey
count_total_users() {
    local count_query="
    MATCH (u:NostrUser) 
    WHERE u.pubkey IS NOT NULL 
    RETURN count(u) as total_count
    "
    
    local result=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" \
        "$count_query" 2>/dev/null | tail -n 1 | tr -d '"' || echo "0")
    
    echo "$result"
}

# Start processing
log_message "Starting processNpubsUpToMaxNumBlocks workflow"

# Get initial counts
TOTAL_USERS=$(count_total_users)
MISSING_NPUBS=$(count_missing_npubs)

log_message "Initial status: $MISSING_NPUBS of $TOTAL_USERS NostrUsers missing npub property"

if [ "$MISSING_NPUBS" -eq 0 ]; then
    log_message "All NostrUsers already have npub property. Nothing to do."
    exit 0
fi

# Initialize iteration counter
ITERATION=1

# Main processing loop
while [ "$MISSING_NPUBS" -gt 0 ] && [ "$ITERATION" -le "$MAX_ITERATIONS" ]; do
    log_message "=== Iteration $ITERATION of $MAX_ITERATIONS ==="
    log_message "Processing $MISSING_NPUBS remaining NostrUsers missing npub property"
    
    # Run processNpubsOneBlock.sh
    log_message "Running processNpubsOneBlock.sh (iteration $ITERATION)"
    
    if "$SCRIPT_DIR/processNpubsOneBlock.sh"; then
        log_message "processNpubsOneBlock.sh completed successfully (iteration $ITERATION)"
    else
        log_message "ERROR: processNpubsOneBlock.sh failed on iteration $ITERATION"
        exit 1
    fi
    
    # Wait a moment for Neo4j to process updates
    sleep 2
    
    # Check how many are still missing
    PREVIOUS_MISSING=$MISSING_NPUBS
    MISSING_NPUBS=$(count_missing_npubs)
    PROCESSED_THIS_ITERATION=$((PREVIOUS_MISSING - MISSING_NPUBS))
    
    log_message "Iteration $ITERATION results: processed $PROCESSED_THIS_ITERATION npubs, $MISSING_NPUBS remaining"
    
    # Check for progress
    if [ "$PROCESSED_THIS_ITERATION" -eq 0 ]; then
        log_message "WARNING: No progress made in iteration $ITERATION. This may indicate an issue."
        
        # If no progress for 2 consecutive iterations, exit to prevent infinite loop
        if [ "$ITERATION" -gt 1 ]; then
            log_message "ERROR: No progress made. Exiting to prevent infinite loop."
            exit 1
        fi
    fi
    
    # Increment iteration counter
    ITERATION=$((ITERATION + 1))
    
    # Brief pause between iterations
    if [ "$MISSING_NPUBS" -gt 0 ]; then
        sleep 1
    fi
done

# Final status check
FINAL_MISSING=$(count_missing_npubs)
FINAL_TOTAL=$(count_total_users)
COMPLETED_NPUBS=$((TOTAL_USERS - FINAL_MISSING))

log_message "=== Final Results ==="
log_message "Total iterations completed: $((ITERATION - 1))"
log_message "Total NostrUsers with pubkey: $FINAL_TOTAL"
log_message "NostrUsers with npub property: $COMPLETED_NPUBS"
log_message "NostrUsers still missing npub: $FINAL_MISSING"

if [ "$FINAL_MISSING" -eq 0 ]; then
    log_message "SUCCESS: All NostrUsers now have npub property!"
    COMPLETION_PERCENTAGE="100"
else
    COMPLETION_PERCENTAGE=$(echo "scale=2; $COMPLETED_NPUBS * 100 / $FINAL_TOTAL" | bc -l 2>/dev/null || echo "N/A")
    
    if [ "$ITERATION" -gt "$MAX_ITERATIONS" ]; then
        log_message "WARNING: Reached maximum iterations ($MAX_ITERATIONS). $FINAL_MISSING npubs still missing."
        log_message "Completion: $COMPLETION_PERCENTAGE% ($COMPLETED_NPUBS of $FINAL_TOTAL)"
    else
        log_message "WARNING: Process stopped with $FINAL_MISSING npubs still missing."
        log_message "Completion: $COMPLETION_PERCENTAGE% ($COMPLETED_NPUBS of $FINAL_TOTAL)"
    fi
fi

log_message "processNpubsUpToMaxNumBlocks workflow finished"

# Exit with appropriate code
if [ "$FINAL_MISSING" -eq 0 ]; then
    exit 0
else
    exit 1
fi

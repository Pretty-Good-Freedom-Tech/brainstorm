#!/bin/bash

# Hasenpfeffr Strfry Stats Script
# This script retrieves event statistics from the strfry database

# Function to get event count for a specific filter
get_event_count() {
    local filter="$1"
    local filter_json
    
    if [ -z "$filter" ]; then
        filter_json="{}"
    else
        filter_json="{ \"kinds\": [$filter]}"
    fi
    
    # Try to run strfry scan with sudo
    output=$(sudo strfry scan --count "$filter_json" 2>&1)
    
    # Extract the count from the output
    count=$(echo "$output" | grep -o "Found [0-9]* events" | grep -o "[0-9]*")
    
    # If count is empty, set it to 0
    if [ -z "$count" ]; then
        count=0
    fi
    
    echo "$count"
}

# Get total event count
total=$(get_event_count "")
kind3=$(get_event_count "3")
kind1984=$(get_event_count "1984")
kind10000=$(get_event_count "10000")

# Output as JSON
echo "{"
echo "  \"total\": $total,"
echo "  \"kind3\": $kind3,"
echo "  \"kind1984\": $kind1984,"
echo "  \"kind10000\": $kind10000"
echo "}"

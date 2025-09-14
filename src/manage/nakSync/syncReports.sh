#!/bin/bash

# echo '{"kinds":[1984]}' | ./nakk req relay.nostr.band | ./nakk event wot.grapevine.network
# echo '{"kinds":[1984]}' | ./nakk req relay.nostr.band >> kind1984.jsonl

TARGET_DIR="kind1984Events_noslol"

mkdir -p "$TARGET_DIR"

create_local_event_store() {
    RELAY_SOURCE="$1"
    SINCE_TIMESTAMP="$2"
    UNTIL_TIMESTAMP="$3"
    DESTINATION_DIR="$4"
    SUFFIX="$5"
    FILTER="{\"kinds\":[1984], \"since\": $SINCE_TIMESTAMP, \"until\": $UNTIL_TIMESTAMP}"
    echo $FILTER
    echo $FILTER | ./nakk req $RELAY_SOURCE >> "$DESTINATION_DIR$SUFFIX/kind1984_${RELAY_SOURCE}_${SINCE_TIMESTAMP}_${UNTIL_TIMESTAMP}${SUFFIX}.jsonl"
    cat "$DESTINATION_DIR$SUFFIX/kind1984_${RELAY_SOURCE}_${SINCE_TIMESTAMP}_${UNTIL_TIMESTAMP}${SUFFIX}.jsonl" | wc -l
}

TIMESTAMP_2022_09_01="1662004800" # 2022-09-01
TIMESTAMP_2023_01_01="1672549200" # 2023-01-01 # none through here on nostrudel for nos.lol
TIMESTAMP_2023_01_15="1673758800" # 2023-01-15
TIMESTAMP_2023_02_01="1675227600" # 2023-02-01
TIMESTAMP_2023_02_07="1675746000" # 2023-02-07
TIMESTAMP_2023_02_15="1676437200" # 2023-02-15
TIMESTAMP_2023_03_01="1677646800" # 2023-03-01
TIMESTAMP_2023_06_01="1685592000" # 2023-06-01
TIMESTAMP_2023_09_01="1693540800" # 2023-09-01
TIMESTAMP_2024_01_01="1704085200" # 2024-01-01
TIMESTAMP_2024_03_01="1709269200" # 2024-03-01
TIMESTAMP_2024_06_01="1717214400" # 2024-06-01
TIMESTAMP_2024_09_01="1725163200" # 2024-09-01
TIMESTAMP_2024_09_15="1726372800" # 2024-09-15
TIMESTAMP_2024_10_01="1727755200" # 2024-10-01
TIMESTAMP_2024_11_01="1730433600" # 2024-11-01
TIMESTAMP_2024_12_01="1733029200" # 2024-12-01
TIMESTAMP_2025_01_01="1735707600" # 2025-01-01
RELAY_SOURCE="nos.lol"
# RELAY_SOURCE="relay.primal.net"
# RELAY_SOURCE="relay.damus.io"
# RELAY_SOURCE="relay.nostr.band"

# create_local_event_store "$RELAY_SOURCE" "$TIMESTAMP_2023_02_01" "$TIMESTAMP_2023_02_15" "$TARGET_DIR"

determine_time_intervals_then_send_to_local_event_store() {
    START_TIMESTAMP="$1"
    INCREMENT="$2"
    END_TIMESTAMP="$3"
    SUFFIX="$4"
    for timestamp_unix in $(seq "$START_TIMESTAMP" "$INCREMENT" "$END_TIMESTAMP"); do
        # echo a blank line
        echo ""
        # also determine date from timestamp and echo it
        timestamp_unix_next=$((timestamp_unix + "$INCREMENT"))
        date -d "@${timestamp_unix}"
        echo $timestamp_unix"-"$timestamp_unix_next
        create_local_event_store "$RELAY_SOURCE" "$timestamp_unix" "$timestamp_unix_next" "$TARGET_DIR" "$SUFFIX"
        # wait 5 seconds
        sleep 5
    done
}

# nos.lol
# TIMESTAMP_2023_01_01 to TIMESTAMP_2023_02_01: 54 kind1984_nos.lol_1672549200_1675227600.jsonl

# relay.damus.io
# TIMESTAMP_2022_09_01 to TIMESTAMP_2023_01_01: 4 (nostrudel; not reproducible)

# relay.primal.net:
# TIMESTAMP_2022_09_01 to TIMESTAMP_2023_01_01:
# TIMESTAMP_2023_01_01 to TIMESTAMP_2023_03_01: 411 kind1984_relay.primal.net_1672549200_1677646800.jsonl
# TIMESTAMP_2023_03_01 to TIMESTAMP_2023_06_01: 215 kind1984_relay.primal.net_1677646800_1685592000.jsonl
# TIMESTAMP_2023_06_01 to TIMESTAMP_2023_09_01: 228 kind1984_relay.primal.net_1685592000_1693540800.jsonl
# TIMESTAMP_2023_09_01 to TIMESTAMP_2024_01_01: 159 kind1984_relay.primal.net_1693540800_1704085200.jsonl
# TIMESTAMP_2024_01_01 to TIMESTAMP_2024_03_01: 52  kind1984_relay.primal.net_1704085200_1709269200.jsonl
# TIMESTAMP_2024_03_01 to TIMESTAMP_2024_06_01: 166 kind1984_relay.primal.net_1709269200_1717214400.jsonl
# TIMESTAMP_2024_06_01 to TIMESTAMP_2024_09_01: 209 kind1984_relay.primal.net_1717214400_1725163200.jsonl
# TIMESTAMP_2024_09_01 to TIMESTAMP_2024_09_15: 380 kind1984_relay.primal.net_1725163200_1726372800.jsonl
# TIMESTAMP_2024_09_15 to TIMESTAMP_2024_10_01: 283 kind1984_relay.primal.net_1726372800_1727755200.jsonl
# TIMESTAMP_2024_10_01 to TIMESTAMP_2024_11_01: 
# TIMESTAMP_2024_11_01 to TIMESTAMP_2024_12_01: 
# TIMESTAMP_2024_12_01 to TIMESTAMP_2025_01_01: 

# relay.nostr.band

# iterate through each file in kind1984Events directory
send_events_to_remote_repo() {
    REPO="$1"
    EVENT_STORE_DIR="$2"
    for file in "$EVENT_STORE_DIR"/*; do
        echo $file
        # iterate through each line in $file
        while IFS= read -r event; do
            echo "$event"
            # use $event as stdin for ./nakk event
            ./nakk event "$REPO" <<< "$event"
        done < "$file"
    done
}

num_files_with_500_or_more_events=0
num_files_with_1000_or_more_events=0
num_files_total=0
send_events_to_local_repo() {
    EVENT_STORE_DIR="$1"
    for file in "$EVENT_STORE_DIR"/*; do
        num_files_total=$((num_files_total + 1))
        # calculate number of events in each file
        NUM_EVENTS=$(cat "$file" | wc -l)
        echo "$NUM_EVENTS events in $file"
        if [ "$NUM_EVENTS" -ge 1000 ]; then
            num_files_with_1000_or_more_events=$((num_files_with_1000_or_more_events + 1))
            # process_dat_with_many_events "$EVENT_STORE_DIR" "$file" 
        fi
        cat "$file" | sudo strfry import
    done
    echo "$num_files_with_1000_or_more_events files have 1000 or more events out of $num_files_total files"
}

process_dat_with_many_events() {
    EVENT_STORE_DIR="$1"
    FILE="$2"
    # extract TIMESTAMP_START and TIMESTAMP_END from filename
    # example filename: kind1984_nos.lol_1735707600_1735794000.jsonl
    TIMESTAMP_START=$(echo "$FILE" | cut -d '_' -f 4)
    TIMESTAMP_END=$(echo "$FILE" | cut -d '_' -f 5 | cut -d '.' -f 1)
    echo "Processing $FILE with TIMESTAMP_START=$TIMESTAMP_START and TIMESTAMP_END=$TIMESTAMP_END"
    # break the 24 day into 6 parts and search each one at a time; add suffix: 4hours
    determine_time_intervals_then_send_to_local_event_store "$TIMESTAMP_START" 14400 "$TIMESTAMP_END" "_brokenUpDay"
}

TARGET_REPO="wot.grapevine.network"

###################################################
# STEP 1
# Iterate one day at a time starting Feb 1, 2023 ending Feb 15, 2023
# determine_time_intervals_then_send_to_local_event_store 1675227600 86400 1676437200

# Iterate one day at a time starting Feb 1, 2023 ending Jan 1, 2024
# determine_time_intervals_then_send_to_local_event_store 1675227600 86400 1704085200

# Iterate one day at a time starting Jan 1, 2024 ending Jan 1, 2025
# determine_time_intervals_then_send_to_local_event_store 1704085200 86400 1735707600

###################################################
# STEP 2

# either use send_events_to_remote_repo (if not local to repo relay), or use strfry command (if local to repo relay)
# send_events_to_remote_repo "$TARGET_REPO" "$TARGET_DIR"

# send_events_to_local_repo "$TARGET_DIR"
send_events_to_local_repo "kind1984Events_noslol_brokenUpDay"


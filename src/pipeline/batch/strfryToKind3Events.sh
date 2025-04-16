#!/bin/bash

SINCE_TIMESTAMP=0

if [[ "$1" == "--recent" ]]; then
    CURRENT_TIME_UNIX=$(date +"%s")
    HOW_LONG_AGO="$2"
    SINCE_TIMESTAMP=$((CURRENT_TIME_UNIX - HOW_LONG_AGO))
fi

filter="{ \"kinds\": [3], \"since\": $SINCE_TIMESTAMP }"

command1="sudo strfry scan --count '$filter'"
eval "$command1"

command2="sudo strfry scan '$filter' | jq -cr 'del(.content)' > /usr/local/lib/node_modules/brainstorm/src/pipeline/batch/allKind3EventsStripped.json"
eval "$command2"
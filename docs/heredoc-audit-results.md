# Heredoc Block Audit Results

## Scripts Using Heredoc Blocks for emit_task_event Metadata

### Category 1: Scripts with emit_task_event heredoc blocks (NEED CONVERSION)

1. **src/algos/calculateHops.sh** - 8 heredoc blocks
   - Lines 18-26: TASK_START metadata
   - Lines 35-42: PROGRESS metadata (initialization)
   - Lines 46-54: PROGRESS metadata (set owner zero)
   - Lines 59-65: PROGRESS metadata (start iterations)
   - Lines 71-80: PROGRESS metadata (iteration tracking)
   - Lines 92-101: PROGRESS metadata (iteration loop)
   - Lines 112-122: PROGRESS metadata (completion)
   - Lines 128-135: TASK_END metadata

2. **src/algos/customers/calculateHops.sh** - 6 heredoc blocks
   - Lines 50-58: TASK_START metadata
   - Lines 62-70: PROGRESS metadata (initialization)
   - Lines 82-92: PROGRESS metadata (iteration tracking)
   - Lines 104-115: PROGRESS metadata (iteration loop)
   - Lines 127-137: PROGRESS metadata (completion)
   - Lines 143-150: TASK_END metadata

3. **src/algos/reports/calculateReportScores.sh** - 4 heredoc blocks
   - Lines 50-59: PROGRESS metadata (phase transitions)
   - Lines 87-97: PROGRESS metadata (per-type processing)
   - Lines 108-117: PROGRESS metadata (phase transitions)
   - Lines 157-167: PROGRESS metadata (completion)

4. **src/manage/taskQueue/launchChildTask.sh** - 6 heredoc blocks
   - Lines 225-235: CHILD_TASK_START event metadata
   - Lines 270-280: Process replacement event metadata
   - Lines 302-312: Launch prevention event metadata
   - Lines 384-394: Timeout event metadata
   - Lines 406-418: Success completion metadata
   - Lines 431-443: Failure completion metadata

5. **src/pipeline/reconciliation/reconciliation.sh** - 1 heredoc block
   - Lines 63-72: TASK_ERROR metadata (error handling)

6. **src/manage/healthMonitor/systemResourceMonitor.sh** - 1 heredoc block
   - Lines 69-79: TASK_START metadata (PARTIALLY CONVERTED - rest uses jq)

### Category 2: Scripts with heredoc blocks for Cypher queries (NO CONVERSION NEEDED)

7. **src/algos/follows-mutes-reports/calculateFollowerMuterReporterInputs.sh** - 4 heredoc blocks
   - All are Cypher query definitions, not emit_task_event metadata

8. **src/algos/personalizedBlacklist/calculatePersonalizedBlacklist.sh** - 6 heredoc blocks
   - All are Cypher query definitions, not emit_task_event metadata

### Category 3: Scripts with mixed usage (PARTIAL CONVERSION NEEDED)

9. **src/manage/taskQueue/taskExecutor.sh** - 1 heredoc block
   - Lines 62-70: Task status file creation (not emit_task_event)

10. **src/utils/structuredLogging.sh** - 2 heredoc blocks
    - Lines 304-312: System context object creation
    - Lines 419-422: Metadata creation with timing
    - These are utility functions that may need review

## Summary

**Priority 1 (High): Scripts needing full conversion**
- src/algos/calculateHops.sh (8 heredoc blocks)
- src/algos/customers/calculateHops.sh (6 heredoc blocks)
- src/algos/reports/calculateReportScores.sh (4 heredoc blocks)
- src/manage/taskQueue/launchChildTask.sh (6 heredoc blocks)
- src/pipeline/reconciliation/reconciliation.sh (1 heredoc block)

**Priority 2 (Medium): Scripts needing partial conversion**
- src/manage/healthMonitor/systemResourceMonitor.sh (1 remaining heredoc block)

**Priority 3 (Low): Scripts that may need review**
- src/utils/structuredLogging.sh (utility functions)
- src/manage/taskQueue/taskExecutor.sh (status file creation)

**No Action Needed:**
- Scripts using heredoc only for Cypher queries (legitimate use case)

## Conversion Pattern

Replace heredoc blocks like:
```bash
metadata=$(cat <<EOF
{
    "key": "value",
    "number": 123
}
EOF
)
```

With jq approach like:
```bash
metadata=$(jq -n \
    --arg key "value" \
    --argjson number 123 \
    '{
        key: $key,
        number: $number
    }')
```

More complex example:

```bash
param_string="This is a string"
param_integer=123
param_boolean=false
param_array='[1, 2, 3]'
param_object='{"key": "value"}'

oMetadata=$(jq -n \
   --arg hardcoded_string "This is a hardcoded message" \
   --argjson hardcoded_integer 123 \
   --argjson hardcoded_boolean false \
   --argjson hardcoded_array '[1, 2, 3]' \
   --argjson hardcoded_object '{"key": "value"}' \
   --arg param_string "$param_string" \
   --argjson param_integer "$param_integer" \
   --argjson param_boolean "$param_boolean" \
   --argjson param_array "$param_array" \
   --argjson param_object "$param_object" \
   '{
      key_hardcoded_string: $hardcoded_string,
      key_hardcoded_integer: $hardcoded_integer,
      key_hardcoded_boolean: $hardcoded_boolean,
      key_hardcoded_array: $hardcoded_array,
      key_hardcoded_object: $hardcoded_object,
      key_param_boolean: $param_boolean,
      key_param_integer: $param_integer,
      key_param_string: $param_string,
      key_param_array: $param_array,
      key_param_object: $param_object
   }')
emit_task_event "EVENT_TYPE" "TASK_NAME" "TARGET" "$oMetadata"

# or

EVENT_TYPE="eventType"
TASK_NAME="taskName"
TARGET="target"
emit_task_event "$EVENT_TYPE" "$TASK_NAME" "$TARGET" "$oMetadata"
```

## Benefits of Conversion
- Prevents empty JSON metadata issues
- Better variable escaping and quoting
- More robust JSON construction
- Consistent with systemResourceMonitor.sh pattern

# Brainstorm Task Queue System

## Overview

The Brainstorm Task Queue System is a modern, priority-based background task management system designed to replace the sequential, timer-based approach of `processAllTasks.sh`. This system provides:

- **Dynamic Priority-Based Scheduling**: Tasks are prioritized based on urgency and importance
- **Resilient Execution**: Better crash recovery and failure handling
- **Scalable Architecture**: Responds quickly to new customers and changing workloads
- **Comprehensive Monitoring**: Real-time visibility into system state and task progress
- **Hybrid Approach**: Maintains systemd reliability while adding intelligent task management

## Architecture

```
systemd timer (every 5-15 minutes)
    ↓
taskQueueManager.sh (Main Orchestrator)
    ↓
┌─────────────────────────────────────────────────┐
│ 1. taskScheduler.js (Evaluate & Queue Tasks)   │
│ 2. taskExecutor.sh (Execute Highest Priority)  │
│ 3. systemStateGatherer.js (Update Dashboard)   │
└─────────────────────────────────────────────────┘
    ↓
Priority Queue (JSON) → Task Execution → Status Updates
```

## Components

### 1. taskQueueManager.sh
**Main orchestrator script** - Coordinates all components and handles the execution flow.

- Called by systemd timer every 5-15 minutes
- Runs task scheduler, executor, and state gatherer in sequence
- Provides logging and error handling
- Can run components individually for testing

**Usage:**
```bash
# Full cycle (default)
./taskQueueManager.sh

# Run individual components
./taskQueueManager.sh scheduler-only
./taskQueueManager.sh executor-only  
./taskQueueManager.sh state-only
```

### 2. taskScheduler.js
**System state evaluator and task prioritizer** - Determines what tasks need to run.

**Responsibilities:**
- Gathers current system state (customers, completion times, failures)
- Calculates task priorities based on business rules
- Updates the priority queue with new tasks
- Removes duplicate tasks

**Priority Levels:**
- **High Priority (1-100)**: New customers, failed tasks, critical maintenance
- **Medium Priority (101-500)**: Stale customer data, routine sync
- **Low Priority (501+)**: System optimization, cleanup

### 3. taskExecutor.sh
**Task execution engine** - Processes the highest priority task from the queue.

**Responsibilities:**
- Reads priority queue and selects next task
- Executes appropriate script based on task type
- Updates task status and logs results
- Removes completed tasks from queue
- Handles task failures and retries

**Supported Task Types:**
- `processCustomer`: Full customer score calculation
- `syncWoT`: Web of Trust synchronization
- `calculatePersonalizedGrapeRank`: GrapeRank calculation
- `calculatePersonalizedPageRank`: PageRank calculation
- `systemMaintenance`: Neo4j indexes, cleanup, etc.

### 4. systemStateGatherer.js
**Comprehensive state collector** - Provides visibility into system health and task status.

**Collects:**
- Customer processing states and timestamps
- Task completion history from logs
- System health (Neo4j, strfry, disk, memory)
- Failed/stalled task detection
- Priority queue status

**Output:** JSON state file used by the dashboard

## Data Files

All task queue data is stored in `${BRAINSTORM_LOG_DIR}/taskQueue/`:

- `priorityQueue.json`: Current task queue sorted by priority
- `systemState.json`: Basic system state (used by scheduler)
- `fullSystemState.json`: Comprehensive state (used by dashboard)
- `taskStatus.json`: Task execution history and status
- `scheduler.log`: Task scheduler logs
- `executor.log`: Task executor logs
- `stateGatherer.log`: State gatherer logs
- `manager.log`: Main orchestrator logs

## Owner Dashboard

**Location:** `/pages/manage/task-dashboard.html`
**API Endpoint:** `/api/task-dashboard/state`

The dashboard provides real-time monitoring of:

- **System Health**: Neo4j, strfry, disk space, memory usage
- **Customer Overview**: Total customers, processing status, stale data
- **Priority Queue**: Current tasks waiting to be executed
- **Task History**: Recent completions and execution times
- **Failed Tasks**: Stalled or failed task detection

**Features:**
- Auto-refresh every 30 seconds
- Manual refresh button
- Color-coded status indicators
- Detailed metrics and task information

## Migration from processAllTasks.sh

### Current State (processAllTasks.sh)
- Sequential execution of all tasks
- Fixed 12-hour timer
- No prioritization
- Limited failure recovery
- Log-based monitoring only

### New State (Task Queue System)
- Priority-based task selection
- Frequent execution cycles (5-15 minutes)
- Dynamic response to system state
- Better failure handling and retry logic
- Structured state tracking + dashboard

### Migration Strategy

**Phase 1: Parallel Operation** (Current)
- Task queue system runs alongside processAllTasks.sh
- Both systems operate independently
- Compare results and validate functionality

**Phase 2: Gradual Migration**
- Migrate individual task types to queue system
- Reduce processAllTasks.sh frequency
- Monitor performance and reliability

**Phase 3: Full Migration**
- Disable processAllTasks.sh timer
- Task queue system handles all background processing
- Remove legacy scripts and dependencies

## Configuration

### systemd Integration

**Service File:** `systemd/taskQueue.service`
```ini
[Unit]
Description=Brainstorm Task Queue Manager
After=network.target neo4j.service

[Service]
Type=simple
User=brainstorm
EnvironmentFile=/etc/brainstorm.conf
ExecStart=/usr/local/lib/node_modules/brainstorm/src/manage/taskQueue/taskQueueManager.sh
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
```

**Timer File:** `systemd/taskQueue.timer`
```ini
[Unit]
Description=Run Brainstorm Task Queue Manager
Requires=taskQueue.service

[Timer]
OnBootSec=2min
OnUnitActiveSec=10min
RandomizedDelaySec=2min

[Install]
WantedBy=timers.target
```

### Environment Variables

The system uses standard Brainstorm configuration from `/etc/brainstorm.conf`:

- `BRAINSTORM_LOG_DIR`: Log and state file directory
- `BRAINSTORM_MODULE_MANAGE_DIR`: Script locations
- `BRAINSTORM_MODULE_ALGOS_DIR`: Algorithm script locations

## Development and Testing

### Running Components Individually

```bash
# Test task scheduler
node src/manage/taskQueue/taskScheduler.js

# Test task executor
bash src/manage/taskQueue/taskExecutor.sh

# Test state gatherer
node src/manage/taskQueue/systemStateGatherer.js

# Test full manager
bash src/manage/taskQueue/taskQueueManager.sh
```

### Debugging

**Log Files:**
- Check individual component logs in `${BRAINSTORM_LOG_DIR}/taskQueue/`
- Monitor systemd service: `journalctl -u taskQueue.service -f`
- View dashboard for real-time status

**Common Issues:**
- Missing `jq` dependency for JSON processing
- Permission issues with log directory creation
- Neo4j connectivity problems affecting state gathering

### Adding New Task Types

1. **Add task type to taskExecutor.sh:**
   ```bash
   "newTaskType")
       log_message "Running new task type for $task_target"
       # Call your script here
       "$BRAINSTORM_MODULE_DIR/path/to/newScript.sh" "$task_target"
       ;;
   ```

2. **Update taskScheduler.js priority logic:**
   ```javascript
   // Add conditions for when to queue the new task type
   if (shouldRunNewTask(systemState)) {
       tasks.push({
           type: 'newTaskType',
           target: targetValue,
           priority: calculatePriority(),
           timestamp: new Date().toISOString()
       });
   }
   ```

3. **Update dashboard display** in `task-dashboard.html` if needed

## Future Enhancements

### Planned Features
- **Event-Driven Triggers**: React to customer sign-ups, data changes
- **Parallel Task Execution**: Run multiple compatible tasks simultaneously  
- **Advanced Retry Logic**: Exponential backoff, failure categorization
- **Performance Metrics**: Task duration tracking, bottleneck identification
- **Alert System**: Notifications for critical failures or delays

### Scalability Improvements
- **Database Backend**: Replace JSON files with SQLite for better concurrency
- **Distributed Processing**: Support multiple worker nodes
- **Load Balancing**: Intelligent task distribution based on system resources

## Log File Analysis vs. Structured State

### Current Approach (Log Files)
**Pros:**
- ✅ Immediate compatibility with existing scripts
- ✅ Human-readable debugging information
- ✅ No additional infrastructure needed

**Cons:**
- ❌ Parsing fragility (format changes break things)
- ❌ Race conditions with concurrent writes
- ❌ Delayed state updates (only when parsed)
- ❌ No structured querying capabilities

### Recommended Hybrid Approach
- **Keep logs** for debugging and human inspection
- **Add structured state** (JSON/SQLite) for task management
- **Parse logs periodically** to update structured state
- **Use structured state** for dashboard and decision-making

This provides the best of both worlds: compatibility with existing systems while enabling modern task management capabilities.

## Support and Troubleshooting

### Getting Help
- Check component logs in `${BRAINSTORM_LOG_DIR}/taskQueue/`
- View dashboard at `/pages/manage/task-dashboard.html`
- Monitor systemd service status
- Review this README for configuration details

### Common Solutions
- **Tasks not executing**: Check priority queue file and executor logs
- **Dashboard not loading**: Verify API endpoint and state file generation
- **High resource usage**: Review task priorities and execution frequency
- **State data missing**: Run systemStateGatherer.js manually to regenerate

---

*This system represents a significant evolution in Brainstorm's background task management, providing the foundation for scalable, reliable, and intelligent task processing as the platform grows.*

const fs = require('fs');
const path = require('path');

/**
 * Stuck Tasks Handler
 * Returns detailed information about tasks that are running longer than expected
 */
async function handleStuckTasks(req, res) {
    try {
        const eventsLogPath = path.join(process.env.BRAINSTORM_LOG_DIR || '/var/log/brainstorm', 'taskQueue', 'events.jsonl');
        
        if (!fs.existsSync(eventsLogPath)) {
            return res.json({
                timestamp: new Date().toISOString(),
                status: 'success',
                data: {
                    stuckTasks: [],
                    totalStuckTasks: 0
                },
                metadata: {
                    dataSource: 'events.jsonl',
                    lastUpdated: new Date().toISOString(),
                    recordCount: 0
                }
            });
        }

        // Read and parse events log
        const eventsData = fs.readFileSync(eventsLogPath, 'utf8');
        const events = eventsData.trim().split('\n')
            .filter(line => line.trim())
            .map(line => {
                try {
                    return JSON.parse(line);
                } catch (e) {
                    return null;
                }
            })
            .filter(event => event !== null);

        // Get recent events (last 24 hours)
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentEvents = events.filter(event => {
            const eventTime = new Date(event.timestamp);
            return eventTime > twentyFourHoursAgo;
        });

        // Build task state map
        const taskStates = new Map();
        const currentTime = new Date();

        recentEvents.forEach(event => {
            const taskKey = `${event.taskName}_${event.target}`;
            
            if (!taskStates.has(taskKey)) {
                taskStates.set(taskKey, {
                    taskName: event.taskName,
                    target: event.target,
                    status: 'unknown',
                    startTime: null,
                    endTime: null,
                    lastEvent: null,
                    pid: null,
                    expectedDuration: null
                });
            }

            const taskState = taskStates.get(taskKey);
            taskState.lastEvent = event;

            switch (event.eventType) {
                case 'TASK_START':
                    taskState.status = 'running';
                    taskState.startTime = new Date(event.timestamp);
                    taskState.endTime = null;
                    // Extract PID if available in metadata
                    if (event.metadata && event.metadata.pid) {
                        taskState.pid = event.metadata.pid;
                    }
                    break;
                case 'TASK_END':
                case 'TASK_ERROR':
                    taskState.status = event.eventType === 'TASK_END' ? 'completed' : 'failed';
                    taskState.endTime = new Date(event.timestamp);
                    break;
                case 'CHILD_TASK_START':
                    if (event.metadata && event.metadata.child_pid) {
                        taskState.pid = event.metadata.child_pid;
                    }
                    break;
            }
        });

        // Define expected durations for different task types (in minutes)
        const expectedDurations = {
            'calculateOwnerHops': 15,
            'calculateCustomerHops': 10,
            'calculateReportScores': 20,
            'processCustomer': 30,
            'syncWoT': 45,
            'reconciliation': 60,
            'systemResourceMonitor': 5,
            'taskWatchdog': 10,
            'neo4jStabilityMonitor': 15,
            'default': 30
        };

        // Identify stuck tasks
        const stuckTasks = [];
        const stuckThresholdMinutes = 30; // Default threshold

        taskStates.forEach(taskState => {
            if (taskState.status === 'running' && taskState.startTime) {
                const runningTimeMs = currentTime - taskState.startTime;
                const runningTimeMinutes = Math.floor(runningTimeMs / (1000 * 60));
                
                const expectedDuration = expectedDurations[taskState.taskName] || expectedDurations.default;
                const isStuck = runningTimeMinutes > Math.max(expectedDuration, stuckThresholdMinutes);

                if (isStuck) {
                    stuckTasks.push({
                        taskName: taskState.taskName,
                        target: taskState.target,
                        startTime: taskState.startTime.toISOString(),
                        runningTimeMinutes,
                        expectedDurationMinutes: expectedDuration,
                        pid: taskState.pid,
                        status: 'stuck',
                        severity: runningTimeMinutes > (expectedDuration * 2) ? 'critical' : 'warning',
                        lastEventType: taskState.lastEvent?.eventType,
                        lastEventTime: taskState.lastEvent?.timestamp,
                        actions: [
                            'Check process status',
                            'Review task logs',
                            'Consider manual intervention'
                        ]
                    });
                }
            }
        });

        // Sort by running time (longest first)
        stuckTasks.sort((a, b) => b.runningTimeMinutes - a.runningTimeMinutes);

        const responseData = {
            stuckTasks,
            totalStuckTasks: stuckTasks.length,
            criticalStuckTasks: stuckTasks.filter(t => t.severity === 'critical').length,
            warningStuckTasks: stuckTasks.filter(t => t.severity === 'warning').length,
            analysisTimeframe: '24 hours',
            stuckThresholdMinutes
        };

        res.json({
            timestamp: new Date().toISOString(),
            status: 'success',
            data: responseData,
            metadata: {
                dataSource: 'events.jsonl',
                lastUpdated: new Date().toISOString(),
                recordCount: stuckTasks.length
            }
        });

    } catch (error) {
        console.error('Error in handleStuckTasks:', error);
        res.status(500).json({
            timestamp: new Date().toISOString(),
            status: 'error',
            error: 'Failed to get stuck tasks',
            message: error.message
        });
    }
}

module.exports = { handleStuckTasks };

const fs = require('fs');
const path = require('path');

/**
 * Task Watchdog Status Handler
 * Provides overall status of task monitoring including active tasks, stuck tasks, and health metrics
 */
async function handleTaskWatchdogStatus(req, res) {
    try {
        const eventsLogPath = path.join(process.env.BRAINSTORM_LOG_DIR || '/var/log/brainstorm', 'taskQueue', 'events.jsonl');
        
        if (!fs.existsSync(eventsLogPath)) {
            return res.json({
                timestamp: new Date().toISOString(),
                status: 'success',
                data: {
                    activeTasks: 0,
                    stuckTasks: 0,
                    orphanedProcesses: 0,
                    taskCompletionRate: 100,
                    healthStatus: 'unknown',
                    message: 'No events log found'
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

        // Analyze task states
        const taskStates = new Map();
        const currentTime = new Date();

        // Process events to build task state map
        recentEvents.forEach(event => {
            const taskKey = `${event.taskName}_${event.target}`;
            
            if (!taskStates.has(taskKey)) {
                taskStates.set(taskKey, {
                    taskName: event.taskName,
                    target: event.target,
                    status: 'unknown',
                    startTime: null,
                    endTime: null,
                    duration: null,
                    isStuck: false
                });
            }

            const taskState = taskStates.get(taskKey);

            switch (event.eventType) {
                case 'TASK_START':
                    taskState.status = 'running';
                    taskState.startTime = new Date(event.timestamp);
                    taskState.endTime = null;
                    break;
                case 'TASK_END':
                    taskState.status = 'completed';
                    taskState.endTime = new Date(event.timestamp);
                    if (taskState.startTime) {
                        taskState.duration = taskState.endTime - taskState.startTime;
                    }
                    break;
                case 'TASK_ERROR':
                    taskState.status = 'failed';
                    taskState.endTime = new Date(event.timestamp);
                    if (taskState.startTime) {
                        taskState.duration = taskState.endTime - taskState.startTime;
                    }
                    break;
            }
        });

        // Identify stuck tasks (running for more than 30 minutes)
        const thirtyMinutesMs = 30 * 60 * 1000;
        let activeTasks = 0;
        let stuckTasks = 0;
        let completedTasks = 0;
        let failedTasks = 0;

        taskStates.forEach(taskState => {
            if (taskState.status === 'running') {
                activeTasks++;
                if (taskState.startTime && (currentTime - taskState.startTime) > thirtyMinutesMs) {
                    taskState.isStuck = true;
                    stuckTasks++;
                }
            } else if (taskState.status === 'completed') {
                completedTasks++;
            } else if (taskState.status === 'failed') {
                failedTasks++;
            }
        });

        // Calculate completion rate
        const totalTasks = completedTasks + failedTasks;
        const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 100;

        // Determine health status
        let healthStatus = 'healthy';
        if (stuckTasks > 0) {
            healthStatus = 'critical';
        } else if (activeTasks > 10) {
            healthStatus = 'warning';
        } else if (taskCompletionRate < 90) {
            healthStatus = 'warning';
        }

        // Get orphaned processes count (simplified - would need process analysis)
        const orphanedProcesses = 0; // TODO: Implement process analysis

        const responseData = {
            activeTasks,
            stuckTasks,
            orphanedProcesses,
            taskCompletionRate,
            healthStatus,
            totalTasksAnalyzed: taskStates.size,
            completedTasks,
            failedTasks,
            analysisTimeframe: '24 hours'
        };

        res.json({
            timestamp: new Date().toISOString(),
            status: 'success',
            data: responseData,
            metadata: {
                dataSource: 'events.jsonl',
                lastUpdated: new Date().toISOString(),
                recordCount: recentEvents.length
            }
        });

    } catch (error) {
        console.error('Error in handleTaskWatchdogStatus:', error);
        res.status(500).json({
            timestamp: new Date().toISOString(),
            status: 'error',
            error: 'Failed to get task watchdog status',
            message: error.message
        });
    }
}

module.exports = { handleTaskWatchdogStatus };

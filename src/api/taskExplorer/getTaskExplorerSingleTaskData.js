const fs = require('fs');
const path = require('path');
const StructuredEventsAnalyzer = require('../taskDashboard/structuredEventsAnalyzer');

/**
 * API endpoint to serve detailed single task data for the task explorer
 * GET /api/task-explorer/single-task/data?taskName=...
 */
async function getTaskExplorerSingleTaskData(req, res) {
    try {
        const { taskName } = req.query;
        
        if (!taskName) {
            return res.status(400).json({ 
                error: 'Missing required parameter: taskName',
                usage: '/api/task-explorer/single-task/data?taskName=calculateOwnerHops'
            });
        }

        const taskRegistryPath = path.join(__dirname, '../../manage/taskQueue/taskRegistry.json');
        
        // Check if task registry exists
        if (!fs.existsSync(taskRegistryPath)) {
            return res.status(404).json({ 
                error: 'Task registry not found',
                path: taskRegistryPath
            });
        }

        // Read and parse task registry
        const taskRegistryData = fs.readFileSync(taskRegistryPath, 'utf8');
        const taskRegistry = JSON.parse(taskRegistryData);

        // Find the specific task
        const task = taskRegistry.tasks[taskName];
        if (!task) {
            return res.status(404).json({ 
                error: `Task not found: ${taskName}`,
                availableTasks: Object.keys(taskRegistry.tasks)
            });
        }

        // Initialize structured events analyzer
        const config = {
            BRAINSTORM_LOG_DIR: process.env.BRAINSTORM_LOG_DIR || '/var/log/brainstorm',
            BRAINSTORM_MODULE_BASE_DIR: process.env.BRAINSTORM_MODULE_BASE_DIR || '/usr/local/lib/node_modules/brainstorm/'
        };
        const eventsAnalyzer = new StructuredEventsAnalyzer(config);

        // Load all events and filter for this specific task
        const allEvents = eventsAnalyzer.loadEvents();
        const taskEvents = allEvents.filter(event => event.taskName === taskName);

        // Analyze task execution sessions (group by PID/timestamp)
        const executionSessions = analyzeTaskExecutionSessions(taskEvents);

        // Get raw events data for grep-like functionality
        const rawEventsData = getRawEventsData(taskName, config);

        // Enhance task with execution data from main analyzer
        const dashboardData = eventsAnalyzer.generateDashboardData();
        const enhancedTask = {
            ...task,
            name: taskName,
            execution: dashboardData.executionData[taskName] || null
        };

        // Prepare response
        const response = {
            task: enhancedTask,
            executionSessions: executionSessions,
            rawEvents: rawEventsData,
            statistics: {
                totalEvents: taskEvents.length,
                totalSessions: executionSessions.length,
                timeRange: taskEvents.length > 0 ? {
                    earliest: taskEvents[0].timestamp,
                    latest: taskEvents[taskEvents.length - 1].timestamp
                } : null
            },
            metadata: {
                taskName: taskName,
                timestamp: new Date().toISOString(),
                eventsAnalyzed: taskEvents.length
            }
        };

        res.json(response);

    } catch (error) {
        console.error('Error in getTaskExplorerSingleTaskData:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}

/**
 * Analyze task execution sessions by grouping events by execution runs
 */
function analyzeTaskExecutionSessions(taskEvents) {
    const sessions = new Map();
    
    // Group events by PID (each PID represents one execution session)
    taskEvents.forEach(event => {
        const sessionKey = `${event.pid}_${event.timestamp.split('T')[0]}`; // PID + date for uniqueness
        
        if (!sessions.has(sessionKey)) {
            sessions.set(sessionKey, {
                sessionId: sessionKey,
                pid: event.pid,
                events: [],
                startTime: null,
                endTime: null,
                duration: null,
                status: 'unknown',
                phases: [],
                errors: [],
                metadata: {}
            });
        }
        
        sessions.get(sessionKey).events.push(event);
    });

    // Analyze each session
    const analyzedSessions = Array.from(sessions.values()).map(session => {
        // Sort events by timestamp
        session.events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        // Find start and end events
        const startEvent = session.events.find(e => e.eventType === 'TASK_START');
        const endEvent = session.events.find(e => e.eventType === 'TASK_END' || e.eventType === 'TASK_COMPLETE');
        const errorEvent = session.events.find(e => e.eventType === 'TASK_ERROR');
        
        // Set session metadata
        if (startEvent) {
            session.startTime = startEvent.timestamp;
            session.metadata = { ...session.metadata, ...startEvent.metadata };
        }
        
        if (endEvent) {
            session.endTime = endEvent.timestamp;
            session.status = 'success';
        } else if (errorEvent) {
            session.endTime = errorEvent.timestamp;
            session.status = 'failed';
            session.errors.push({
                timestamp: errorEvent.timestamp,
                message: errorEvent.metadata?.message || 'Task failed',
                details: errorEvent.metadata
            });
        } else if (startEvent) {
            session.status = 'running';
        }
        
        // Calculate duration
        if (session.startTime && session.endTime) {
            session.duration = new Date(session.endTime) - new Date(session.startTime);
        }
        
        // Extract phases from PROGRESS events
        session.phases = session.events
            .filter(e => e.eventType === 'PROGRESS')
            .map(e => ({
                timestamp: e.timestamp,
                phase: e.metadata?.phase || 'unknown',
                step: e.metadata?.step || 'unknown',
                description: e.metadata?.description || '',
                metadata: e.metadata
            }));
        
        return session;
    });

    // Sort sessions by start time (most recent first)
    return analyzedSessions.sort((a, b) => {
        const aTime = new Date(a.startTime || 0);
        const bTime = new Date(b.startTime || 0);
        return bTime - aTime;
    });
}

/**
 * Get raw events data for grep-like functionality
 */
function getRawEventsData(taskName, config) {
    try {
        const eventsFile = path.join(config.BRAINSTORM_LOG_DIR, 'taskQueue', 'events.jsonl');
        
        if (!fs.existsSync(eventsFile)) {
            return {
                available: false,
                reason: 'events.jsonl file not found',
                path: eventsFile
            };
        }
        
        const content = fs.readFileSync(eventsFile, 'utf8');
        const lines = content.trim().split('\n').filter(line => line.trim());
        
        // Filter lines that contain the task name (grep-like functionality)
        const taskLines = lines.filter(line => {
            try {
                const event = JSON.parse(line);
                return event.taskName === taskName;
            } catch (error) {
                // If line is not valid JSON, check if it contains the task name as text
                return line.includes(taskName);
            }
        });
        
        return {
            available: true,
            totalLines: lines.length,
            taskLines: taskLines.length,
            events: taskLines.map(line => {
                try {
                    return {
                        raw: line,
                        parsed: JSON.parse(line),
                        valid: true
                    };
                } catch (error) {
                    return {
                        raw: line,
                        parsed: null,
                        valid: false,
                        error: error.message
                    };
                }
            })
        };
        
    } catch (error) {
        return {
            available: false,
            reason: error.message,
            error: error.message
        };
    }
}

module.exports = getTaskExplorerSingleTaskData;
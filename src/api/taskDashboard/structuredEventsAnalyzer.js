/**
 * Structured Events Analyzer
 * 
 * Analyzes events.jsonl to provide rich insights for the task dashboard:
 * - Task execution times and performance trends
 * - Success/failure rates and error analysis
 * - Real-time progress tracking
 * - Customer-specific processing status
 */

const fs = require('fs');
const path = require('path');

class StructuredEventsAnalyzer {
    constructor(config) {
        this.config = config;
        this.eventsFile = path.join(config.BRAINSTORM_LOG_DIR, 'taskQueue', 'events.jsonl');
        this.structuredLogFile = path.join(config.BRAINSTORM_LOG_DIR, 'structured.log');
        this.taskRegistry = this.loadTaskRegistry();
        this.diagnostics = {
            filesChecked: [],
            eventsFound: 0,
            parseErrors: 0,
            lastUpdate: new Date().toISOString()
        };
    }

    loadTaskRegistry() {
        try {
            const registryPath = path.join(this.config.BRAINSTORM_MODULE_SRC_DIR, 'manage', 'taskQueue', 'taskRegistry.json');
            return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
        } catch (error) {
            console.error('Error loading task registry:', error.message);
            return { tasks: {} };
        }
    }

    /**
     * Load and parse all structured events from available sources
     */
    loadEvents() {
        let events = [];
        this.diagnostics.filesChecked = [];
        this.diagnostics.eventsFound = 0;
        this.diagnostics.parseErrors = 0;

        // Try events.jsonl first (preferred format)
        if (fs.existsSync(this.eventsFile)) {
            this.diagnostics.filesChecked.push({ file: 'events.jsonl', exists: true, size: fs.statSync(this.eventsFile).size });
            events = this.loadJsonlEvents();
        } else {
            this.diagnostics.filesChecked.push({ file: 'events.jsonl', exists: false, size: 0 });
        }

        // If no events from JSONL, try structured.log as fallback
        if (events.length === 0 && fs.existsSync(this.structuredLogFile)) {
            this.diagnostics.filesChecked.push({ file: 'structured.log', exists: true, size: fs.statSync(this.structuredLogFile).size });
            console.log('No events found in events.jsonl, falling back to structured.log parsing');
            events = this.loadStructuredLogEvents();
        } else if (!fs.existsSync(this.structuredLogFile)) {
            this.diagnostics.filesChecked.push({ file: 'structured.log', exists: false, size: 0 });
        }

        this.diagnostics.eventsFound = events.length;
        console.log(`StructuredEventsAnalyzer: Loaded ${events.length} events from ${this.diagnostics.filesChecked.length} file(s)`);
        
        return events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }

    /**
     * Load events from events.jsonl (preferred format)
     */
    loadJsonlEvents() {
        try {
            const content = fs.readFileSync(this.eventsFile, 'utf8');
            return content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => {
                    try {
                        return JSON.parse(line);
                    } catch (error) {
                        this.diagnostics.parseErrors++;
                        console.error('Error parsing JSONL event line:', line.substring(0, 100), error.message);
                        return null;
                    }
                })
                .filter(event => event !== null);
        } catch (error) {
            console.error('Error loading events.jsonl:', error.message);
            return [];
        }
    }

    /**
     * Load events from structured.log (fallback format)
     * Parse human-readable log entries like:
     * [2025-08-08T20:36:20+00:00] [INFO] [structuredLogging.sh:176] Task event: TASK_START processAllActiveCustomers [target=message=Starting processing of all active customers pid=4176325]
     */
    loadStructuredLogEvents() {
        try {
            const content = fs.readFileSync(this.structuredLogFile, 'utf8');
            const events = [];
            
            const lines = content.split('\n').filter(line => line.includes('Task event:'));
            
            for (const line of lines) {
                try {
                    const event = this.parseStructuredLogLine(line);
                    if (event) {
                        events.push(event);
                    }
                } catch (error) {
                    this.diagnostics.parseErrors++;
                    console.error('Error parsing structured log line:', line.substring(0, 100), error.message);
                }
            }
            
            return events;
        } catch (error) {
            console.error('Error loading structured.log:', error.message);
            return [];
        }
    }

    /**
     * Parse a single structured log line into an event object
     */
    parseStructuredLogLine(line) {
        // Example: [2025-08-08T20:36:20+00:00] [INFO] [structuredLogging.sh:176] Task event: TASK_START processAllActiveCustomers [target=message=Starting processing of all active customers pid=4176325]
        const timestampMatch = line.match(/\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2})\]/);
        const eventMatch = line.match(/Task event: (\w+) ([\w-]+)/);
        const metadataMatch = line.match(/\[([^\]]+)\]$/);
        
        if (!timestampMatch || !eventMatch) {
            return null;
        }
        
        const timestamp = timestampMatch[1];
        const eventType = eventMatch[1];
        const taskName = eventMatch[2];
        
        // Parse metadata from the bracketed section
        const metadata = {};
        if (metadataMatch) {
            const metadataStr = metadataMatch[1];
            const pairs = metadataStr.split(' ');
            
            for (const pair of pairs) {
                const [key, ...valueParts] = pair.split('=');
                if (key && valueParts.length > 0) {
                    metadata[key] = valueParts.join('=');
                }
            }
        }
        
        return {
            timestamp,
            eventType,
            taskName,
            target: metadata.target || metadata.child_task || null,
            pid: metadata.pid || null,
            metadata,
            source: 'structured.log'
        };
    }

    /**
     * Analyze task execution status and history for each task
     */
    analyzeTaskExecution(events) {
        const taskExecutionData = {};
        const taskSessions = new Map();
        const now = new Date();

        // Initialize execution data for all registered tasks
        Object.keys(this.taskRegistry.tasks || {}).forEach(taskName => {
            taskExecutionData[taskName] = {
                hasExecutionData: false,
                isRunning: false,
                lastStatus: null,
                lastRun: null,
                lastRunFormatted: null,
                timeSinceLastRun: null,
                timeSinceLastRunMinutes: null,
                lastDuration: null,
                lastDurationFormatted: null,
                averageDuration: null,
                averageDurationFormatted: null,
                totalRuns: 0,
                successfulRuns: 0,
                failedRuns: 0,
                successRate: '0.0'
            };
        });

        // Group events by task sessions (taskName + pid)
        events.forEach(event => {
            const sessionKey = `${event.taskName}_${event.pid}`;
            
            if (!taskSessions.has(sessionKey)) {
                taskSessions.set(sessionKey, {
                    taskName: event.taskName,
                    pid: event.pid,
                    events: []
                });
            }
            
            taskSessions.get(sessionKey).events.push(event);
        });

        // Analyze each session
        taskSessions.forEach(session => {
            const taskName = session.taskName;
            
            // Skip if task not in registry
            if (!taskExecutionData[taskName]) {
                return;
            }

            const startEvent = session.events.find(e => e.eventType === 'TASK_START');
            const endEvent = session.events.find(e => e.eventType === 'TASK_END');
            const errorEvent = session.events.find(e => e.eventType === 'TASK_ERROR');

            if (startEvent) {
                taskExecutionData[taskName].hasExecutionData = true;

                // Check if task is currently running (has start but no end/error)
                if (!endEvent && !errorEvent) {
                    taskExecutionData[taskName].isRunning = true;
                    taskExecutionData[taskName].lastStatus = 'running';
                } else {
                    // Task completed
                    const finalEvent = endEvent || errorEvent;
                    const success = !!endEvent;
                    const duration = new Date(finalEvent.timestamp) - new Date(startEvent.timestamp);

                    taskExecutionData[taskName].isRunning = false;
                    taskExecutionData[taskName].lastStatus = success ? 'success' : 'failed';
                    taskExecutionData[taskName].lastRun = finalEvent.timestamp;
                    taskExecutionData[taskName].lastRunFormatted = new Date(finalEvent.timestamp).toLocaleString();
                    taskExecutionData[taskName].timeSinceLastRun = this.getTimeAgo(finalEvent.timestamp);
                    taskExecutionData[taskName].timeSinceLastRunMinutes = Math.floor((now - new Date(finalEvent.timestamp)) / (1000 * 60));
                    taskExecutionData[taskName].lastDuration = duration;
                    taskExecutionData[taskName].lastDurationFormatted = this.formatDuration(duration);
                    taskExecutionData[taskName].totalRuns += 1;

                    if (success) {
                        taskExecutionData[taskName].successfulRuns += 1;
                    } else {
                        taskExecutionData[taskName].failedRuns += 1;
                    }

                    // Calculate success rate
                    if (taskExecutionData[taskName].totalRuns > 0) {
                        const rate = (taskExecutionData[taskName].successfulRuns / taskExecutionData[taskName].totalRuns) * 100;
                        taskExecutionData[taskName].successRate = rate.toFixed(1);
                    }
                }
            }
        });

        // Calculate average durations for tasks with multiple runs
        Object.keys(taskExecutionData).forEach(taskName => {
            const taskData = taskExecutionData[taskName];
            if (taskData.totalRuns > 1) {
                // Get all completed sessions for this task
                const completedSessions = [];
                taskSessions.forEach(session => {
                    if (session.taskName === taskName) {
                        const startEvent = session.events.find(e => e.eventType === 'TASK_START');
                        const endEvent = session.events.find(e => e.eventType === 'TASK_END');
                        const errorEvent = session.events.find(e => e.eventType === 'TASK_ERROR');
                        
                        if (startEvent && (endEvent || errorEvent)) {
                            const finalEvent = endEvent || errorEvent;
                            const duration = new Date(finalEvent.timestamp) - new Date(startEvent.timestamp);
                            completedSessions.push(duration);
                        }
                    }
                });

                if (completedSessions.length > 0) {
                    const avgDuration = completedSessions.reduce((sum, duration) => sum + duration, 0) / completedSessions.length;
                    taskData.averageDuration = avgDuration;
                    taskData.averageDurationFormatted = this.formatDuration(avgDuration);
                }
            } else if (taskData.lastDuration) {
                // Single run - use last duration as average
                taskData.averageDuration = taskData.lastDuration;
                taskData.averageDurationFormatted = taskData.lastDurationFormatted;
            }
        });

        return taskExecutionData;
    }

    /**
     * Analyze task execution times and performance
     */
    analyzeTaskPerformance(events) {
        const taskSessions = new Map();
        const performance = {
            completedTasks: [],
            averageExecutionTimes: {},
            slowestTasks: [],
            fastestTasks: [],
            failureRates: {}
        };

        // Group events by task sessions
        events.forEach(event => {
            const sessionKey = `${event.taskName}_${event.target || 'global'}_${event.pid}`;
            
            if (!taskSessions.has(sessionKey)) {
                taskSessions.set(sessionKey, {
                    taskName: event.taskName,
                    target: event.target,
                    pid: event.pid,
                    events: []
                });
            }
            
            taskSessions.get(sessionKey).events.push(event);
        });

        // Analyze each task session
        taskSessions.forEach(session => {
            const startEvent = session.events.find(e => e.eventType === 'TASK_START');
            const endEvent = session.events.find(e => e.eventType === 'TASK_END');
            const errorEvent = session.events.find(e => e.eventType === 'TASK_ERROR');

            if (startEvent && (endEvent || errorEvent)) {
                const finalEvent = endEvent || errorEvent;
                const duration = new Date(finalEvent.timestamp) - new Date(startEvent.timestamp);
                const success = !!endEvent;

                const taskResult = {
                    taskName: session.taskName,
                    target: session.target,
                    startTime: startEvent.timestamp,
                    endTime: finalEvent.timestamp,
                    duration: duration,
                    durationFormatted: this.formatDuration(duration),
                    success: success,
                    status: success ? 'completed' : 'failed'
                };

                performance.completedTasks.push(taskResult);

                // Update averages
                if (!performance.averageExecutionTimes[session.taskName]) {
                    performance.averageExecutionTimes[session.taskName] = {
                        total: 0,
                        count: 0,
                        average: 0
                    };
                }
                
                const avg = performance.averageExecutionTimes[session.taskName];
                avg.total += duration;
                avg.count += 1;
                avg.average = avg.total / avg.count;

                // Update failure rates
                if (!performance.failureRates[session.taskName]) {
                    performance.failureRates[session.taskName] = {
                        total: 0,
                        failures: 0,
                        rate: 0
                    };
                }
                
                const failureRate = performance.failureRates[session.taskName];
                failureRate.total += 1;
                if (!success) failureRate.failures += 1;
                failureRate.rate = (failureRate.failures / failureRate.total) * 100;
            }
        });

        // Sort for fastest/slowest
        const sortedTasks = performance.completedTasks.sort((a, b) => b.duration - a.duration);
        performance.slowestTasks = sortedTasks.slice(0, 10);
        performance.fastestTasks = sortedTasks.slice(-10).reverse();

        return performance;
    }

    /**
     * Analyze real-time progress of running tasks
     */
    analyzeRealTimeProgress(events) {
        const now = new Date();
        const recentEvents = events.filter(event => 
            (now - new Date(event.timestamp)) < 24 * 60 * 60 * 1000 // Last 24 hours
        );

        const runningTasks = new Map();
        const recentActivity = [];

        recentEvents.forEach(event => {
            const sessionKey = `${event.taskName}_${event.target || 'global'}_${event.pid}`;

            if (event.eventType === 'TASK_START') {
                runningTasks.set(sessionKey, {
                    taskName: event.taskName,
                    target: event.target,
                    startTime: event.timestamp,
                    status: 'running',
                    progress: []
                });
            } else if (event.eventType === 'TASK_END' || event.eventType === 'TASK_ERROR') {
                if (runningTasks.has(sessionKey)) {
                    const task = runningTasks.get(sessionKey);
                    task.endTime = event.timestamp;
                    task.status = event.eventType === 'TASK_END' ? 'completed' : 'failed';
                    task.duration = new Date(event.timestamp) - new Date(task.startTime);
                    runningTasks.delete(sessionKey);
                }
            } else if (event.eventType === 'PROGRESS') {
                if (runningTasks.has(sessionKey)) {
                    runningTasks.get(sessionKey).progress.push({
                        timestamp: event.timestamp,
                        metadata: event.metadata
                    });
                }
            }

            // Add to recent activity
            recentActivity.push({
                timestamp: event.timestamp,
                eventType: event.eventType,
                taskName: event.taskName,
                target: event.target,
                timeAgo: this.getTimeAgo(event.timestamp)
            });
        });

        return {
            runningTasks: Array.from(runningTasks.values()),
            recentActivity: recentActivity.slice(-50).reverse() // Last 50 events, newest first
        };
    }

    /**
     * Analyze customer processing status
     */
    analyzeCustomerProcessing(events) {
        const customerEvents = events.filter(event => 
            event.target && event.target !== 'global' && 
            (event.eventType.includes('CUSTOMER') || event.taskName.includes('Customer'))
        );

        const customerStatus = new Map();

        customerEvents.forEach(event => {
            const customerId = event.target;
            
            if (!customerStatus.has(customerId)) {
                customerStatus.set(customerId, {
                    customerId: customerId,
                    tasks: [],
                    status: 'unknown',
                    lastActivity: null,
                    totalTasks: 0,
                    completedTasks: 0,
                    failedTasks: 0
                });
            }

            const customer = customerStatus.get(customerId);
            customer.lastActivity = event.timestamp;

            if (event.eventType === 'TASK_START') {
                customer.totalTasks += 1;
                customer.status = 'processing';
            } else if (event.eventType === 'TASK_END') {
                customer.completedTasks += 1;
                customer.status = 'completed';
            } else if (event.eventType === 'TASK_ERROR') {
                customer.failedTasks += 1;
                customer.status = 'failed';
            }

            customer.tasks.push({
                taskName: event.taskName,
                eventType: event.eventType,
                timestamp: event.timestamp
            });
        });

        return Array.from(customerStatus.values())
            .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
    }

    /**
     * Generate comprehensive dashboard data
     */
    generateDashboardData() {
        const events = this.loadEvents();
        
        if (events.length === 0) {
            return {
                summary: {
                    totalEvents: 0,
                    timeRange: null,
                    message: 'No structured events found'
                },
                performance: {},
                realTime: { runningTasks: [], recentActivity: [] },
                customers: []
            };
        }

        const executionData = this.analyzeTaskExecution(events);
        const performance = this.analyzeTaskPerformance(events);
        const realTimeProgress = this.analyzeRealTimeProgress(events);
        const customers = this.analyzeCustomerProcessing(events);

        return {
            analysis: {
                totalTasks: Object.keys(this.taskRegistry.tasks || {}).length,
                tasksWithExecutionData: Object.values(executionData).filter(task => task.hasExecutionData).length,
                currentlyRunning: Object.values(executionData).filter(task => task.isRunning).length,
                neverRun: Object.values(executionData).filter(task => !task.hasExecutionData && !task.isRunning).length,
                recentlySuccessful: Object.values(executionData).filter(task => 
                    task.lastStatus === 'success' && task.timeSinceLastRunMinutes < 60
                ).length,
                recentlyFailed: Object.values(executionData).filter(task => 
                    task.lastStatus === 'failed' && task.timeSinceLastRunMinutes < 60
                ).length
            },
            executionData,
            performance: this.analyzeTaskPerformance(events),
            realTimeProgress: this.analyzeRealTimeProgress(events),
            diagnostics: this.diagnostics
        };
    }

    /**
     * Helper methods
     */
    formatDuration(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    getTimeAgo(timestamp) {
        const now = new Date();
        const eventTime = new Date(timestamp);
        const diffMs = now - eventTime;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffDays > 0) return `${diffDays}d ago`;
        if (diffHours > 0) return `${diffHours}h ago`;
        if (diffMins > 0) return `${diffMins}m ago`;
        return 'just now';
    }
}

module.exports = StructuredEventsAnalyzer;

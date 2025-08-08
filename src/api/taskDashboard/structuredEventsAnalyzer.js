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
        this.taskRegistry = this.loadTaskRegistry();
    }

    loadTaskRegistry() {
        try {
            const registryPath = path.join(this.config.BRAINSTORM_MODULE_BASE_DIR, 'manage', 'taskQueue', 'taskRegistry.json');
            return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
        } catch (error) {
            console.error('Error loading task registry:', error.message);
            return { tasks: {} };
        }
    }

    /**
     * Load and parse all structured events
     */
    loadEvents() {
        if (!fs.existsSync(this.eventsFile)) {
            return [];
        }

        try {
            const content = fs.readFileSync(this.eventsFile, 'utf8');
            return content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => {
                    try {
                        return JSON.parse(line);
                    } catch (error) {
                        console.error('Error parsing event line:', line, error.message);
                        return null;
                    }
                })
                .filter(event => event !== null)
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        } catch (error) {
            console.error('Error loading events:', error.message);
            return [];
        }
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

        const performance = this.analyzeTaskPerformance(events);
        const realTime = this.analyzeRealTimeProgress(events);
        const customers = this.analyzeCustomerProcessing(events);

        return {
            summary: {
                totalEvents: events.length,
                timeRange: {
                    start: events[0].timestamp,
                    end: events[events.length - 1].timestamp
                },
                tasksCompleted: performance.completedTasks.length,
                tasksRunning: realTime.runningTasks.length,
                customersProcessed: customers.length
            },
            performance: performance,
            realTime: realTime,
            customers: customers,
            generatedAt: new Date().toISOString()
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

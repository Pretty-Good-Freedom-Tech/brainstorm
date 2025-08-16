const fs = require('fs');
const path = require('path');

/**
 * Task Analytics Handler
 * Provides comprehensive analytics on task execution patterns and behavior
 */
async function handleTaskAnalytics(req, res) {
    try {
        const timeRange = req.query.timeRange || '24h'; // 1h, 6h, 24h, 7d, 30d
        const taskName = req.query.taskName;
        const target = req.query.target;

        const eventsLogPath = path.join(process.env.BRAINSTORM_LOG_DIR || '/var/log/brainstorm', 'taskQueue', 'events.jsonl');
        
        if (!fs.existsSync(eventsLogPath)) {
            return res.json({
                timestamp: new Date().toISOString(),
                status: 'success',
                data: {
                    taskAnalytics: {},
                    executionPatterns: {},
                    failureAnalysis: {},
                    resourceUsage: {}
                },
                metadata: {
                    dataSource: 'events.jsonl',
                    lastUpdated: new Date().toISOString(),
                    recordCount: 0,
                    filters: { timeRange, taskName, target }
                }
            });
        }

        // Parse time range
        const timeRangeMs = parseTimeRange(timeRange);
        const cutoffTime = new Date(Date.now() - timeRangeMs);

        // Read and parse events
        const events = readAndParseEvents(eventsLogPath, cutoffTime, taskName, target);

        // Analyze task execution patterns
        const taskAnalytics = analyzeTaskExecution(events);
        const executionPatterns = analyzeExecutionPatterns(events);
        const failureAnalysis = analyzeFailures(events);
        const resourceUsage = analyzeResourceUsage(events);

        const responseData = {
            taskAnalytics,
            executionPatterns,
            failureAnalysis,
            resourceUsage,
            timeRange,
            analysisWindow: {
                start: cutoffTime.toISOString(),
                end: new Date().toISOString(),
                durationMs: timeRangeMs
            }
        };

        res.json({
            timestamp: new Date().toISOString(),
            status: 'success',
            data: responseData,
            metadata: {
                dataSource: 'events.jsonl',
                lastUpdated: new Date().toISOString(),
                recordCount: events.length,
                filters: { timeRange, taskName, target }
            }
        });

    } catch (error) {
        console.error('Error in handleTaskAnalytics:', error);
        res.status(500).json({
            timestamp: new Date().toISOString(),
            status: 'error',
            error: 'Failed to get task analytics',
            message: error.message
        });
    }
}

function parseTimeRange(timeRange) {
    const ranges = {
        '1h': 60 * 60 * 1000,
        '6h': 6 * 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000
    };
    return ranges[timeRange] || ranges['24h'];
}

function readAndParseEvents(eventsLogPath, cutoffTime, taskNameFilter, targetFilter) {
    const eventsData = fs.readFileSync(eventsLogPath, 'utf8');
    return eventsData.trim().split('\n')
        .filter(line => line.trim())
        .map(line => {
            try {
                return JSON.parse(line);
            } catch (e) {
                return null;
            }
        })
        .filter(event => {
            if (!event) return false;
            
            const eventTime = new Date(event.timestamp);
            if (eventTime < cutoffTime) return false;
            
            if (taskNameFilter && event.taskName !== taskNameFilter) return false;
            if (targetFilter && event.target !== targetFilter) return false;
            
            return true;
        });
}

function analyzeTaskExecution(events) {
    const taskStats = {};
    const taskSessions = {};

    events.forEach(event => {
        const taskKey = `${event.taskName}_${event.target}`;
        
        if (!taskStats[taskKey]) {
            taskStats[taskKey] = {
                taskName: event.taskName,
                target: event.target,
                totalExecutions: 0,
                successfulExecutions: 0,
                failedExecutions: 0,
                totalDuration: 0,
                averageDuration: 0,
                minDuration: Infinity,
                maxDuration: 0,
                lastExecution: null,
                firstExecution: null
            };
        }

        const stats = taskStats[taskKey];

        // Track execution sessions
        if (event.eventType === 'TASK_START') {
            taskSessions[taskKey] = {
                startTime: new Date(event.timestamp),
                startEvent: event
            };
            stats.firstExecution = stats.firstExecution || event.timestamp;
        } else if (event.eventType === 'TASK_END' || event.eventType === 'TASK_ERROR') {
            if (taskSessions[taskKey]) {
                const session = taskSessions[taskKey];
                const duration = new Date(event.timestamp) - session.startTime;
                
                stats.totalExecutions++;
                stats.totalDuration += duration;
                stats.minDuration = Math.min(stats.minDuration, duration);
                stats.maxDuration = Math.max(stats.maxDuration, duration);
                stats.lastExecution = event.timestamp;

                if (event.eventType === 'TASK_END') {
                    stats.successfulExecutions++;
                } else {
                    stats.failedExecutions++;
                }

                delete taskSessions[taskKey];
            }
        }
    });

    // Calculate averages and success rates
    Object.values(taskStats).forEach(stats => {
        if (stats.totalExecutions > 0) {
            stats.averageDuration = Math.round(stats.totalDuration / stats.totalExecutions);
            stats.successRate = Math.round((stats.successfulExecutions / stats.totalExecutions) * 100);
        }
        if (stats.minDuration === Infinity) stats.minDuration = 0;
    });

    return {
        taskBreakdown: Object.values(taskStats),
        totalTasks: Object.keys(taskStats).length,
        overallStats: calculateOverallStats(Object.values(taskStats))
    };
}

function analyzeExecutionPatterns(events) {
    const hourlyPattern = new Array(24).fill(0);
    const dailyPattern = {};
    const taskFrequency = {};

    events.forEach(event => {
        if (event.eventType === 'TASK_START') {
            const eventTime = new Date(event.timestamp);
            const hour = eventTime.getHours();
            const day = eventTime.toDateString();
            
            hourlyPattern[hour]++;
            dailyPattern[day] = (dailyPattern[day] || 0) + 1;
            taskFrequency[event.taskName] = (taskFrequency[event.taskName] || 0) + 1;
        }
    });

    // Find peak hours
    const peakHour = hourlyPattern.indexOf(Math.max(...hourlyPattern));
    const quietHour = hourlyPattern.indexOf(Math.min(...hourlyPattern));

    return {
        hourlyDistribution: hourlyPattern.map((count, hour) => ({ hour, count })),
        dailyDistribution: Object.entries(dailyPattern).map(([day, count]) => ({ day, count })),
        taskFrequency: Object.entries(taskFrequency)
            .map(([task, count]) => ({ task, count }))
            .sort((a, b) => b.count - a.count),
        patterns: {
            peakHour,
            quietHour,
            totalExecutions: hourlyPattern.reduce((sum, count) => sum + count, 0),
            averageExecutionsPerHour: Math.round(hourlyPattern.reduce((sum, count) => sum + count, 0) / 24)
        }
    };
}

function analyzeFailures(events) {
    const failuresByTask = {};
    const failuresByType = {};
    const failureTimeline = [];

    events.forEach(event => {
        if (event.eventType === 'TASK_ERROR' || event.eventType === 'HEALTH_ALERT') {
            const taskName = event.taskName;
            
            failuresByTask[taskName] = (failuresByTask[taskName] || 0) + 1;
            
            if (event.eventType === 'HEALTH_ALERT' && event.metadata?.alertType) {
                const alertType = event.metadata.alertType;
                failuresByType[alertType] = (failuresByType[alertType] || 0) + 1;
            }

            failureTimeline.push({
                timestamp: event.timestamp,
                taskName,
                type: event.eventType,
                message: event.message,
                alertType: event.metadata?.alertType,
                severity: event.metadata?.severity
            });
        }
    });

    // Calculate failure rates
    const taskFailureRates = Object.entries(failuresByTask).map(([task, failures]) => {
        const totalExecutions = events.filter(e => 
            e.taskName === task && (e.eventType === 'TASK_START')
        ).length;
        
        return {
            task,
            failures,
            totalExecutions,
            failureRate: totalExecutions > 0 ? Math.round((failures / totalExecutions) * 100) : 0
        };
    }).sort((a, b) => b.failureRate - a.failureRate);

    return {
        failuresByTask: Object.entries(failuresByTask)
            .map(([task, count]) => ({ task, count }))
            .sort((a, b) => b.count - a.count),
        failuresByType: Object.entries(failuresByType)
            .map(([type, count]) => ({ type, count }))
            .sort((a, b) => b.count - a.count),
        taskFailureRates,
        recentFailures: failureTimeline.slice(-10),
        totalFailures: failureTimeline.length
    };
}

function analyzeResourceUsage(events) {
    const resourceMetrics = {
        cpu: [],
        memory: [],
        heap: [],
        disk: []
    };

    events.forEach(event => {
        if (event.eventType === 'RESOURCE_REPORT' || event.eventType === 'DATABASE_METRICS') {
            const timestamp = event.timestamp;
            const metadata = event.metadata || {};

            // Extract CPU usage
            if (metadata.cpu?.cpuUsed) {
                resourceMetrics.cpu.push({
                    timestamp,
                    value: parseFloat(metadata.cpu.cpuUsed),
                    taskName: event.taskName
                });
            }

            // Extract memory usage
            if (metadata.memory?.percentUsed) {
                resourceMetrics.memory.push({
                    timestamp,
                    value: parseFloat(metadata.memory.percentUsed),
                    taskName: event.taskName
                });
            }

            // Extract heap usage
            if (metadata.database?.heapUtilization) {
                resourceMetrics.heap.push({
                    timestamp,
                    value: parseFloat(metadata.database.heapUtilization),
                    taskName: event.taskName
                });
            }

            // Extract disk usage
            if (metadata.disk?.percentUsed) {
                resourceMetrics.disk.push({
                    timestamp,
                    value: parseFloat(metadata.disk.percentUsed),
                    taskName: event.taskName
                });
            }
        }
    });

    // Calculate statistics for each resource type
    const resourceStats = {};
    Object.entries(resourceMetrics).forEach(([resource, data]) => {
        if (data.length > 0) {
            const values = data.map(d => d.value);
            resourceStats[resource] = {
                current: values[values.length - 1],
                average: Math.round(values.reduce((sum, val) => sum + val, 0) / values.length * 100) / 100,
                min: Math.min(...values),
                max: Math.max(...values),
                trend: calculateTrend(data),
                dataPoints: data.length
            };
        }
    });

    return {
        resourceStats,
        resourceTimeline: resourceMetrics,
        summary: {
            totalDataPoints: Object.values(resourceMetrics).reduce((sum, data) => sum + data.length, 0),
            monitoringCoverage: Object.keys(resourceStats).length
        }
    };
}

function calculateOverallStats(taskStats) {
    const totals = taskStats.reduce((acc, stats) => ({
        totalExecutions: acc.totalExecutions + stats.totalExecutions,
        successfulExecutions: acc.successfulExecutions + stats.successfulExecutions,
        failedExecutions: acc.failedExecutions + stats.failedExecutions,
        totalDuration: acc.totalDuration + stats.totalDuration
    }), { totalExecutions: 0, successfulExecutions: 0, failedExecutions: 0, totalDuration: 0 });

    return {
        ...totals,
        overallSuccessRate: totals.totalExecutions > 0 ? 
            Math.round((totals.successfulExecutions / totals.totalExecutions) * 100) : 100,
        averageExecutionTime: totals.totalExecutions > 0 ? 
            Math.round(totals.totalDuration / totals.totalExecutions) : 0
    };
}

function calculateTrend(data) {
    if (data.length < 2) return 'stable';
    
    const recent = data.slice(-5);
    const older = data.slice(-10, -5);
    
    if (recent.length === 0 || older.length === 0) return 'stable';
    
    const recentAvg = recent.reduce((sum, d) => sum + d.value, 0) / recent.length;
    const olderAvg = older.reduce((sum, d) => sum + d.value, 0) / older.length;
    
    const change = ((recentAvg - olderAvg) / olderAvg) * 100;
    
    if (change > 10) return 'increasing';
    if (change < -10) return 'decreasing';
    return 'stable';
}

module.exports = { handleTaskAnalytics };

const fs = require('fs');
const path = require('path');

/**
 * Task Performance Handler
 * Provides detailed performance analysis and optimization recommendations
 */
async function handleTaskPerformance(req, res) {
    try {
        const taskName = req.query.taskName;
        const timeRange = req.query.timeRange || '24h';
        const includeRecommendations = req.query.recommendations !== 'false';

        const eventsLogPath = path.join(process.env.BRAINSTORM_LOG_DIR || '/var/log/brainstorm', 'taskQueue', 'events.jsonl');
        
        if (!fs.existsSync(eventsLogPath)) {
            return res.json({
                timestamp: new Date().toISOString(),
                status: 'success',
                data: {
                    performanceMetrics: {},
                    bottlenecks: [],
                    recommendations: []
                },
                metadata: {
                    dataSource: 'events.jsonl',
                    lastUpdated: new Date().toISOString(),
                    recordCount: 0,
                    filters: { taskName, timeRange }
                }
            });
        }

        const timeRangeMs = parseTimeRange(timeRange);
        const cutoffTime = new Date(Date.now() - timeRangeMs);
        const events = readAndParseEvents(eventsLogPath, cutoffTime, taskName);

        // Analyze performance metrics
        const performanceMetrics = analyzePerformanceMetrics(events);
        const bottlenecks = identifyBottlenecks(events, performanceMetrics);
        const recommendations = includeRecommendations ? generateRecommendations(performanceMetrics, bottlenecks) : [];

        const responseData = {
            performanceMetrics,
            bottlenecks,
            recommendations,
            timeRange,
            analysisWindow: {
                start: cutoffTime.toISOString(),
                end: new Date().toISOString()
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
                filters: { taskName, timeRange }
            }
        });

    } catch (error) {
        console.error('Error in handleTaskPerformance:', error);
        res.status(500).json({
            timestamp: new Date().toISOString(),
            status: 'error',
            error: 'Failed to get task performance analysis',
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

function readAndParseEvents(eventsLogPath, cutoffTime, taskNameFilter) {
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
            
            return true;
        });
}

function analyzePerformanceMetrics(events) {
    const taskMetrics = {};
    const taskSessions = {};

    // Process events to build performance metrics
    events.forEach(event => {
        const taskKey = `${event.taskName}_${event.target}`;
        
        if (!taskMetrics[taskKey]) {
            taskMetrics[taskKey] = {
                taskName: event.taskName,
                target: event.target,
                executions: [],
                durations: [],
                resourceUsage: {
                    cpu: [],
                    memory: [],
                    heap: []
                },
                errors: [],
                concurrency: 0,
                maxConcurrency: 0
            };
        }

        const metrics = taskMetrics[taskKey];

        switch (event.eventType) {
            case 'TASK_START':
                taskSessions[taskKey] = {
                    startTime: new Date(event.timestamp),
                    event
                };
                metrics.concurrency++;
                metrics.maxConcurrency = Math.max(metrics.maxConcurrency, metrics.concurrency);
                break;

            case 'TASK_END':
            case 'TASK_ERROR':
                if (taskSessions[taskKey]) {
                    const session = taskSessions[taskKey];
                    const duration = new Date(event.timestamp) - session.startTime;
                    const success = event.eventType === 'TASK_END';

                    metrics.executions.push({
                        timestamp: event.timestamp,
                        duration,
                        success,
                        startTime: session.startTime,
                        endTime: new Date(event.timestamp)
                    });

                    metrics.durations.push(duration);
                    metrics.concurrency = Math.max(0, metrics.concurrency - 1);

                    if (!success) {
                        metrics.errors.push({
                            timestamp: event.timestamp,
                            message: event.message,
                            metadata: event.metadata
                        });
                    }

                    delete taskSessions[taskKey];
                }
                break;

            case 'RESOURCE_REPORT':
            case 'DATABASE_METRICS':
                const metadata = event.metadata || {};
                if (metadata.cpu?.cpuUsed) {
                    metrics.resourceUsage.cpu.push({
                        timestamp: event.timestamp,
                        value: parseFloat(metadata.cpu.cpuUsed)
                    });
                }
                if (metadata.memory?.percentUsed) {
                    metrics.resourceUsage.memory.push({
                        timestamp: event.timestamp,
                        value: parseFloat(metadata.memory.percentUsed)
                    });
                }
                if (metadata.database?.heapUtilization) {
                    metrics.resourceUsage.heap.push({
                        timestamp: event.timestamp,
                        value: parseFloat(metadata.database.heapUtilization)
                    });
                }
                break;
        }
    });

    // Calculate performance statistics
    const performanceStats = Object.values(taskMetrics).map(metrics => {
        const durations = metrics.durations;
        const executions = metrics.executions;

        if (durations.length === 0) {
            return {
                taskName: metrics.taskName,
                target: metrics.target,
                executionCount: 0,
                averageDuration: 0,
                medianDuration: 0,
                p95Duration: 0,
                minDuration: 0,
                maxDuration: 0,
                successRate: 100,
                throughput: 0,
                concurrencyStats: {
                    maxConcurrency: metrics.maxConcurrency,
                    averageConcurrency: 0
                },
                resourceStats: calculateResourceStats(metrics.resourceUsage)
            };
        }

        const sortedDurations = [...durations].sort((a, b) => a - b);
        const successCount = executions.filter(e => e.success).length;

        // Calculate throughput (executions per hour)
        const timeSpanHours = executions.length > 1 
            ? (new Date(executions[executions.length - 1].timestamp) - new Date(executions[0].timestamp)) / (1000 * 60 * 60)
            : 1;
        const throughput = executions.length / Math.max(timeSpanHours, 1);

        return {
            taskName: metrics.taskName,
            target: metrics.target,
            executionCount: executions.length,
            averageDuration: Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length),
            medianDuration: calculateMedian(sortedDurations),
            p95Duration: calculatePercentile(sortedDurations, 95),
            minDuration: Math.min(...durations),
            maxDuration: Math.max(...durations),
            successRate: Math.round((successCount / executions.length) * 100),
            throughput: Math.round(throughput * 100) / 100,
            concurrencyStats: {
                maxConcurrency: metrics.maxConcurrency,
                averageConcurrency: Math.round(metrics.maxConcurrency / 2) // Simplified estimate
            },
            resourceStats: calculateResourceStats(metrics.resourceUsage),
            errorCount: metrics.errors.length,
            recentErrors: metrics.errors.slice(-5)
        };
    });

    return {
        taskBreakdown: performanceStats,
        overallStats: calculateOverallPerformanceStats(performanceStats)
    };
}

function identifyBottlenecks(events, performanceMetrics) {
    const bottlenecks = [];

    // Analyze each task for bottlenecks
    performanceMetrics.taskBreakdown.forEach(taskStats => {
        // Duration bottlenecks
        if (taskStats.p95Duration > taskStats.averageDuration * 2) {
            bottlenecks.push({
                type: 'duration_variance',
                severity: 'high',
                taskName: taskStats.taskName,
                description: `High duration variance: P95 (${formatDuration(taskStats.p95Duration)}) is much higher than average (${formatDuration(taskStats.averageDuration)})`,
                impact: 'Unpredictable execution times',
                metrics: {
                    p95Duration: taskStats.p95Duration,
                    averageDuration: taskStats.averageDuration,
                    variance: taskStats.p95Duration / taskStats.averageDuration
                }
            });
        }

        // Throughput bottlenecks
        if (taskStats.throughput < 0.5 && taskStats.executionCount > 5) {
            bottlenecks.push({
                type: 'low_throughput',
                severity: 'medium',
                taskName: taskStats.taskName,
                description: `Low throughput: ${taskStats.throughput} executions per hour`,
                impact: 'Slow task processing rate',
                metrics: {
                    throughput: taskStats.throughput,
                    executionCount: taskStats.executionCount
                }
            });
        }

        // Error rate bottlenecks
        if (taskStats.successRate < 90) {
            bottlenecks.push({
                type: 'high_error_rate',
                severity: taskStats.successRate < 70 ? 'critical' : 'high',
                taskName: taskStats.taskName,
                description: `High error rate: ${100 - taskStats.successRate}% failure rate`,
                impact: 'Frequent task failures affecting reliability',
                metrics: {
                    successRate: taskStats.successRate,
                    errorCount: taskStats.errorCount,
                    executionCount: taskStats.executionCount
                }
            });
        }

        // Resource bottlenecks
        Object.entries(taskStats.resourceStats).forEach(([resource, stats]) => {
            if (stats.average > 80) {
                bottlenecks.push({
                    type: 'resource_constraint',
                    severity: stats.average > 90 ? 'critical' : 'high',
                    taskName: taskStats.taskName,
                    description: `High ${resource} usage: ${stats.average}% average`,
                    impact: `${resource.toUpperCase()} resource constraint may slow task execution`,
                    metrics: {
                        resource,
                        average: stats.average,
                        max: stats.max,
                        trend: stats.trend
                    }
                });
            }
        });
    });

    // System-wide bottlenecks
    const overallStats = performanceMetrics.overallStats;
    if (overallStats.averageSuccessRate < 85) {
        bottlenecks.push({
            type: 'system_reliability',
            severity: 'critical',
            taskName: 'system',
            description: `Overall system success rate is low: ${overallStats.averageSuccessRate}%`,
            impact: 'System-wide reliability issues affecting multiple tasks',
            metrics: {
                overallSuccessRate: overallStats.averageSuccessRate,
                totalTasks: overallStats.totalTasks
            }
        });
    }

    return bottlenecks.sort((a, b) => {
        const severityOrder = { critical: 3, high: 2, medium: 1, low: 0 };
        return severityOrder[b.severity] - severityOrder[a.severity];
    });
}

function generateRecommendations(performanceMetrics, bottlenecks) {
    const recommendations = [];

    // Generate recommendations based on bottlenecks
    bottlenecks.forEach(bottleneck => {
        switch (bottleneck.type) {
            case 'duration_variance':
                recommendations.push({
                    priority: 'high',
                    category: 'performance',
                    title: `Optimize ${bottleneck.taskName} execution consistency`,
                    description: 'High duration variance indicates inconsistent performance',
                    actions: [
                        'Review task implementation for inefficient code paths',
                        'Check for resource contention during peak times',
                        'Consider breaking down large tasks into smaller chunks',
                        'Add performance monitoring within the task'
                    ],
                    expectedImpact: 'More predictable execution times'
                });
                break;

            case 'low_throughput':
                recommendations.push({
                    priority: 'medium',
                    category: 'scalability',
                    title: `Improve ${bottleneck.taskName} throughput`,
                    description: 'Task execution rate is below optimal levels',
                    actions: [
                        'Analyze task dependencies and remove unnecessary waits',
                        'Consider parallel execution where possible',
                        'Optimize database queries and external API calls',
                        'Review task scheduling frequency'
                    ],
                    expectedImpact: 'Faster task completion and higher system throughput'
                });
                break;

            case 'high_error_rate':
                recommendations.push({
                    priority: 'critical',
                    category: 'reliability',
                    title: `Fix reliability issues in ${bottleneck.taskName}`,
                    description: 'High failure rate requires immediate attention',
                    actions: [
                        'Review recent error logs for common failure patterns',
                        'Implement better error handling and retry logic',
                        'Add input validation and defensive programming',
                        'Consider circuit breaker pattern for external dependencies'
                    ],
                    expectedImpact: 'Improved system reliability and reduced manual intervention'
                });
                break;

            case 'resource_constraint':
                recommendations.push({
                    priority: 'high',
                    category: 'resources',
                    title: `Address ${bottleneck.metrics.resource} constraints for ${bottleneck.taskName}`,
                    description: `High ${bottleneck.metrics.resource} usage may impact performance`,
                    actions: [
                        `Monitor ${bottleneck.metrics.resource} usage patterns`,
                        'Consider resource limits and quotas',
                        'Optimize resource-intensive operations',
                        'Scale resources if consistently high usage is expected'
                    ],
                    expectedImpact: 'Better resource utilization and improved performance'
                });
                break;
        }
    });

    // General performance recommendations
    const overallStats = performanceMetrics.overallStats;
    
    if (overallStats.totalExecutions > 100) {
        recommendations.push({
            priority: 'low',
            category: 'monitoring',
            title: 'Implement advanced performance monitoring',
            description: 'High task volume justifies enhanced monitoring',
            actions: [
                'Set up performance dashboards with key metrics',
                'Implement alerting for performance degradation',
                'Create performance baselines and SLAs',
                'Regular performance review meetings'
            ],
            expectedImpact: 'Proactive performance management and early issue detection'
        });
    }

    return recommendations.sort((a, b) => {
        const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
}

// Helper functions
function calculateResourceStats(resourceUsage) {
    const stats = {};
    
    Object.entries(resourceUsage).forEach(([resource, data]) => {
        if (data.length > 0) {
            const values = data.map(d => d.value);
            stats[resource] = {
                average: Math.round(values.reduce((sum, val) => sum + val, 0) / values.length * 100) / 100,
                min: Math.min(...values),
                max: Math.max(...values),
                trend: calculateTrend(data),
                dataPoints: data.length
            };
        }
    });
    
    return stats;
}

function calculateOverallPerformanceStats(taskStats) {
    if (taskStats.length === 0) {
        return {
            totalTasks: 0,
            totalExecutions: 0,
            averageSuccessRate: 100,
            averageThroughput: 0,
            averageDuration: 0
        };
    }

    const totals = taskStats.reduce((acc, stats) => ({
        totalExecutions: acc.totalExecutions + stats.executionCount,
        totalSuccessful: acc.totalSuccessful + (stats.executionCount * stats.successRate / 100),
        totalThroughput: acc.totalThroughput + stats.throughput,
        totalDuration: acc.totalDuration + (stats.averageDuration * stats.executionCount)
    }), { totalExecutions: 0, totalSuccessful: 0, totalThroughput: 0, totalDuration: 0 });

    return {
        totalTasks: taskStats.length,
        totalExecutions: totals.totalExecutions,
        averageSuccessRate: totals.totalExecutions > 0 
            ? Math.round((totals.totalSuccessful / totals.totalExecutions) * 100)
            : 100,
        averageThroughput: Math.round(totals.totalThroughput / taskStats.length * 100) / 100,
        averageDuration: totals.totalExecutions > 0 
            ? Math.round(totals.totalDuration / totals.totalExecutions)
            : 0
    };
}

function calculateMedian(sortedArray) {
    const mid = Math.floor(sortedArray.length / 2);
    return sortedArray.length % 2 === 0
        ? Math.round((sortedArray[mid - 1] + sortedArray[mid]) / 2)
        : sortedArray[mid];
}

function calculatePercentile(sortedArray, percentile) {
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
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

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

module.exports = { handleTaskPerformance };

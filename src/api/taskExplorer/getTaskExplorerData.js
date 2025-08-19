const fs = require('fs');
const path = require('path');
const StructuredEventsAnalyzer = require('../taskDashboard/structuredEventsAnalyzer');

/**
 * API endpoint to serve task registry data for the Task Explorer dashboard
 * GET /api/task-explorer/data
 */
async function getTaskExplorerData(req, res) {
    try {
        // TODO: Add owner authentication check
        // if (!isOwner(req)) {
        //     return res.status(403).json({ error: 'Access denied. Owner privileges required.' });
        // }

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

        // Initialize structured events analyzer
        const config = {
            BRAINSTORM_LOG_DIR: process.env.BRAINSTORM_LOG_DIR || '/var/log/brainstorm',
            BRAINSTORM_MODULE_BASE_DIR: process.env.BRAINSTORM_MODULE_BASE_DIR || '/usr/local/lib/node_modules/brainstorm/'
        };
        const eventsAnalyzer = new StructuredEventsAnalyzer(config);
        
        // Load and analyze structured events using the correct analyzer method
        const events = eventsAnalyzer.loadEvents();
        const executionData = eventsAnalyzer.analyzeTaskExecution(events);

        // Load preserved task execution history for enhanced analytics
        const preservedHistoryPath = path.join(config.BRAINSTORM_LOG_DIR, 'preserved', 'system_metrics_history.jsonl');
        const preservedExecutionData = loadPreservedTaskHistory(preservedHistoryPath);

        // Transform tasks for the explorer - only process the 'tasks' section
        const tasks = Object.entries(taskRegistry.tasks || {}).map(([taskName, taskData]) => {
            const execData = executionData[taskName];
            const preservedData = preservedExecutionData[taskName];
            
            // Merge current execution data with preserved historical data
            const mergedExecution = mergeExecutionData(execData, preservedData);
            
            return {
                name: taskName,
                description: taskData.description || '',
                categories: taskData.categories || [],
                parent: taskData.parent || null,
                children: taskData.children || [],
                structuredLogging: taskData.structuredLogging === true,
                scriptPath: taskData.scriptPath || '',
                notes: taskData.notes || '',
                // Additional metadata for analysis
                hasParent: !!taskData.parent,
                hasChildren: !!(taskData.children && taskData.children.length > 0),
                isOrchestrator: !!(taskData.categories && taskData.categories.includes('orchestrator')),
                isCustomerTask: !!(taskData.categories && taskData.categories.includes('customer')),
                isOwnerTask: !!(taskData.categories && taskData.categories.includes('owner')),
                childCount: taskData.children ? taskData.children.length : 0,
                // Enhanced execution data combining current and historical data
                execution: mergedExecution,
                // Historical execution patterns from preserved data
                history: preservedData ? {
                    totalHistoricalRuns: preservedData.totalRuns,
                    historicalSuccessRate: preservedData.successRate,
                    historicalFailureRate: preservedData.failureRate,
                    averageHistoricalDuration: preservedData.averageDuration,
                    longestHistoricalDuration: preservedData.longestDuration,
                    shortestHistoricalDuration: preservedData.shortestDuration,
                    firstRecordedRun: preservedData.firstRun,
                    lastHistoricalRun: preservedData.lastRun,
                    executionTrend: preservedData.trend,
                    recentFailures: preservedData.recentFailures
                } : null
            };
        });

        // Generate analysis statistics including execution data
        const analysis = generateTaskAnalysis(tasks, performance, events);

        // Return the data
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            tasks: tasks,
            analysis: analysis,
            totalTasks: tasks.length
        });

    } catch (error) {
        console.error('Error in getTaskExplorerData:', error);
        res.status(500).json({ 
            error: 'Failed to load task explorer data',
            details: error.message 
        });
    }
}

/**
 * Load and analyze preserved task execution history from system_metrics_history.jsonl
 */
function loadPreservedTaskHistory(preservedHistoryPath) {
    if (!fs.existsSync(preservedHistoryPath)) {
        return {};
    }

    try {
        const historyData = fs.readFileSync(preservedHistoryPath, 'utf8');
        const historyLines = historyData.trim().split('\n').filter(line => line.trim());
        
        const taskHistory = {};
        
        // Process each execution record
        historyLines.forEach(line => {
            try {
                const record = JSON.parse(line);
                const taskName = record.taskName;
                
                if (!taskHistory[taskName]) {
                    taskHistory[taskName] = {
                        starts: [],
                        ends: [],
                        durations: [],
                        failures: [],
                        successes: []
                    };
                }
                
                if (record.eventType === 'TASK_START') {
                    taskHistory[taskName].starts.push({
                        timestamp: record.timestamp,
                        tier: record.tier,
                        priority: record.priority
                    });
                } else if (record.eventType === 'TASK_END') {
                    taskHistory[taskName].ends.push({
                        timestamp: record.timestamp,
                        duration: record.duration,
                        exitCode: record.exitCode,
                        failure: record.failure,
                        tier: record.tier,
                        priority: record.priority
                    });
                    
                    if (record.duration) {
                        taskHistory[taskName].durations.push(record.duration);
                    }
                    
                    if (record.failure) {
                        taskHistory[taskName].failures.push({
                            timestamp: record.timestamp,
                            exitCode: record.exitCode
                        });
                    } else {
                        taskHistory[taskName].successes.push({
                            timestamp: record.timestamp,
                            duration: record.duration
                        });
                    }
                }
            } catch (parseError) {
                // Skip malformed lines
                console.warn('Skipping malformed history line:', parseError.message);
            }
        });
        
        // Calculate analytics for each task
        const analyzedHistory = {};
        Object.entries(taskHistory).forEach(([taskName, history]) => {
            analyzedHistory[taskName] = analyzeTaskHistory(history);
        });
        
        return analyzedHistory;
    } catch (error) {
        console.error('Error loading preserved task history:', error);
        return {};
    }
}

/**
 * Analyze historical execution data for a single task
 */
function analyzeTaskHistory(history) {
    const totalRuns = history.ends.length;
    const totalFailures = history.failures.length;
    const totalSuccesses = history.successes.length;
    
    if (totalRuns === 0) {
        return null;
    }
    
    const successRate = ((totalSuccesses / totalRuns) * 100).toFixed(1);
    const failureRate = ((totalFailures / totalRuns) * 100).toFixed(1);
    
    // Duration analysis
    const durations = history.durations.filter(d => d > 0);
    let averageDuration = 0;
    let longestDuration = 0;
    let shortestDuration = 0;
    
    if (durations.length > 0) {
        averageDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
        longestDuration = Math.max(...durations);
        shortestDuration = Math.min(...durations);
    }
    
    // Time range analysis
    const allTimestamps = [...history.starts, ...history.ends].map(e => new Date(e.timestamp));
    const firstRun = allTimestamps.length > 0 ? new Date(Math.min(...allTimestamps)) : null;
    const lastRun = allTimestamps.length > 0 ? new Date(Math.max(...allTimestamps)) : null;
    
    // Recent failure analysis (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentFailures = history.failures.filter(f => new Date(f.timestamp) > sevenDaysAgo);
    
    // Execution trend (comparing first half vs second half of data)
    let trend = 'stable';
    if (history.ends.length >= 10) {
        const midpoint = Math.floor(history.ends.length / 2);
        const firstHalf = history.ends.slice(0, midpoint);
        const secondHalf = history.ends.slice(midpoint);
        
        const firstHalfFailureRate = firstHalf.filter(e => e.failure).length / firstHalf.length;
        const secondHalfFailureRate = secondHalf.filter(e => e.failure).length / secondHalf.length;
        
        if (secondHalfFailureRate > firstHalfFailureRate + 0.1) {
            trend = 'degrading';
        } else if (secondHalfFailureRate < firstHalfFailureRate - 0.1) {
            trend = 'improving';
        }
    }
    
    return {
        totalRuns,
        successRate: parseFloat(successRate),
        failureRate: parseFloat(failureRate),
        averageDuration: Math.round(averageDuration * 100) / 100,
        longestDuration: Math.round(longestDuration * 100) / 100,
        shortestDuration: Math.round(shortestDuration * 100) / 100,
        firstRun: firstRun ? firstRun.toISOString() : null,
        lastRun: lastRun ? lastRun.toISOString() : null,
        trend,
        recentFailures: recentFailures.length
    };
}

/**
 * Merge current execution data with preserved historical data
 */
function mergeExecutionData(currentData, preservedData) {
    const defaultExecution = {
        hasExecutionData: false,
        isRunning: false,
        lastStatus: null,
        lastRun: null,
        lastRunFormatted: null,
        timeSinceLastRun: null,
        timeSinceLastRunMinutes: null,
        lastInitiated: null,
        lastInitiatedFormatted: null,
        timeSinceLastInitiated: null,
        timeSinceLastInitiatedFormatted: null,
        lastDuration: null,
        lastDurationFormatted: null,
        averageDuration: null,
        averageDurationFormatted: null,
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        successRate: '0.0'
    };
    
    // Start with current data or defaults
    const merged = currentData || defaultExecution;
    
    // Enhance with preserved historical data if available
    if (preservedData) {
        merged.hasHistoricalData = true;
        merged.totalHistoricalRuns = preservedData.totalRuns;
        merged.historicalSuccessRate = preservedData.successRate;
        merged.historicalAverageDuration = preservedData.averageDuration;
        
        // If no current data, use historical data as fallback
        if (!currentData || !currentData.hasExecutionData) {
            merged.hasExecutionData = true;
            merged.totalRuns = preservedData.totalRuns;
            merged.successRate = preservedData.successRate.toString();
            merged.averageDuration = preservedData.averageDuration;
            merged.averageDurationFormatted = `${preservedData.averageDuration}s`;
            
            if (preservedData.lastRun) {
                merged.lastRun = preservedData.lastRun;
                merged.lastRunFormatted = new Date(preservedData.lastRun).toLocaleString();
                merged.timeSinceLastRun = getTimeSinceLastRun(preservedData.lastRun);
            }
        }
    }
    
    return merged;
}

/**
 * Helper function to calculate time since last run
 */
function getTimeSinceLastRun(lastRunTimestamp) {
    const now = new Date();
    const lastRun = new Date(lastRunTimestamp);
    const diffMs = now - lastRun;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return 'just now';
}

/**
 * Generate comprehensive analysis of the task registry
 */
function generateTaskAnalysis(tasks, performance, events) {
    const analysis = {
        totals: {
            all: tasks.length,
            withStructuredLogging: tasks.filter(t => t.structuredLogging).length,
            withoutStructuredLogging: tasks.filter(t => !t.structuredLogging).length,
            orchestrators: tasks.filter(t => t.isOrchestrator).length,
            customerTasks: tasks.filter(t => t.isCustomerTask).length,
            ownerTasks: tasks.filter(t => t.isOwnerTask).length,
            rootTasks: tasks.filter(t => !t.hasParent).length,
            leafTasks: tasks.filter(t => !t.hasChildren).length,
            // Execution statistics
            withExecutionData: tasks.filter(t => t.execution.hasExecutionData).length,
            currentlyRunning: tasks.filter(t => t.execution.isRunning).length,
            neverRun: tasks.filter(t => !t.execution.hasExecutionData && !t.execution.isRunning).length,
            recentlySuccessful: tasks.filter(t => t.execution.lastStatus === 'success').length,
            recentlyFailed: tasks.filter(t => t.execution.lastStatus === 'failed').length
        },
        categories: {},
        hierarchy: {
            maxDepth: 0,
            orphanTasks: [],
            circularReferences: []
        },
        structuredLogging: {
            implementationRate: 0,
            byCategory: {}
        }
    };

    // Category analysis
    const categoryMap = new Map();
    tasks.forEach(task => {
        if (task.categories) {
            task.categories.forEach(category => {
                if (!categoryMap.has(category)) {
                    categoryMap.set(category, {
                        name: category,
                        count: 0,
                        structuredCount: 0,
                        tasks: []
                    });
                }
                const catData = categoryMap.get(category);
                catData.count++;
                catData.tasks.push(task.name);
                if (task.structuredLogging) {
                    catData.structuredCount++;
                }
            });
        }
    });

    analysis.categories = Object.fromEntries(categoryMap);

    // Structured logging analysis
    analysis.structuredLogging.implementationRate = 
        (analysis.totals.withStructuredLogging / analysis.totals.all * 100).toFixed(1);

    // Per-category structured logging rates
    Object.entries(analysis.categories).forEach(([category, data]) => {
        analysis.structuredLogging.byCategory[category] = {
            total: data.count,
            implemented: data.structuredCount,
            rate: (data.structuredCount / data.count * 100).toFixed(1)
        };
    });

    // Hierarchy analysis
    analysis.hierarchy = analyzeHierarchy(tasks);

    return analysis;
}

/**
 * Analyze task hierarchy for depth, orphans, and circular references
 */
function analyzeHierarchy(tasks) {
    const taskMap = new Map(tasks.map(t => [t.name, t]));
    const hierarchy = {
        maxDepth: 0,
        orphanTasks: [],
        circularReferences: [],
        depths: new Map()
    };

    // Find orphan tasks (tasks with parents that don't exist)
    tasks.forEach(task => {
        if (task.parent && !taskMap.has(task.parent)) {
            hierarchy.orphanTasks.push({
                task: task.name,
                missingParent: task.parent
            });
        }
    });

    // Calculate depths and detect circular references
    const visited = new Set();
    const visiting = new Set();

    function calculateDepth(taskName, path = []) {
        if (visiting.has(taskName)) {
            // Circular reference detected
            hierarchy.circularReferences.push([...path, taskName]);
            return 0;
        }

        if (visited.has(taskName)) {
            return hierarchy.depths.get(taskName) || 0;
        }

        visiting.add(taskName);
        const task = taskMap.get(taskName);
        
        if (!task || !task.parent || !taskMap.has(task.parent)) {
            // Root task or orphan
            const depth = 0;
            hierarchy.depths.set(taskName, depth);
            hierarchy.maxDepth = Math.max(hierarchy.maxDepth, depth);
            visiting.delete(taskName);
            visited.add(taskName);
            return depth;
        }

        const parentDepth = calculateDepth(task.parent, [...path, taskName]);
        const depth = parentDepth + 1;
        hierarchy.depths.set(taskName, depth);
        hierarchy.maxDepth = Math.max(hierarchy.maxDepth, depth);
        
        visiting.delete(taskName);
        visited.add(taskName);
        return depth;
    }

    // Calculate depths for all tasks
    tasks.forEach(task => {
        if (!visited.has(task.name)) {
            calculateDepth(task.name);
        }
    });

    return hierarchy;
}

module.exports = getTaskExplorerData;

const fs = require('fs');
const path = require('path');

/**
 * API endpoint to serve task execution timeline data for Neo4j Health Dashboard
 * GET /api/neo4j-health/task-timeline?hours=24
 */
async function getTaskTimeline(req, res) {
    try {
        const hoursBack = parseInt(req.query.hours) || 24;
        const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
        
        // Database-intensive tasks to track on the timeline
        const DB_INTENSIVE_TASKS = {
            // Orchestrator tasks (high impact)
            'processCustomer': { color: '#ef4444', category: 'orchestrator', priority: 1 },
            
            // Graph calculation tasks (very high memory usage)
            'calculateOwnerHops': { color: '#3b82f6', category: 'graph-calc', priority: 2 },
            'calculateCustomerHops': { color: '#06b6d4', category: 'graph-calc', priority: 2 },
            'calculateOwnerGrapeRank': { color: '#8b5cf6', category: 'ranking', priority: 3 },
            'calculateCustomerGrapeRank': { color: '#a855f7', category: 'ranking', priority: 3 },
            'calculateOwnerPageRank': { color: '#10b981', category: 'ranking', priority: 3 },
            'calculateCustomerPageRank': { color: '#059669', category: 'ranking', priority: 3 },
            
            // Database maintenance tasks
            'neo4jStabilityMonitor': { color: '#f59e0b', category: 'monitoring', priority: 4 },
            'databasePerformanceMonitor': { color: '#d97706', category: 'monitoring', priority: 4 }
        };

        const config = {
            BRAINSTORM_LOG_DIR: process.env.BRAINSTORM_LOG_DIR || '/var/log/brainstorm'
        };

        // Load data from both current events and preserved history
        const timelineData = await loadTaskTimelineData(config, cutoffTime, DB_INTENSIVE_TASKS);

        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            timeRange: {
                start: cutoffTime.toISOString(),
                end: new Date().toISOString(),
                hours: hoursBack
            },
            taskDefinitions: DB_INTENSIVE_TASKS,
            timeline: timelineData,
            metadata: {
                totalExecutions: timelineData.length,
                taskTypes: [...new Set(timelineData.map(t => t.taskName))],
                dataSource: 'combined'
            }
        });

    } catch (error) {
        console.error('Error in getTaskTimeline:', error);
        res.status(500).json({ 
            error: 'Failed to load task timeline data',
            details: error.message 
        });
    }
}

/**
 * Load task timeline data from events and preserved history
 */
async function loadTaskTimelineData(config, cutoffTime, dbIntensiveTasks) {
    const timeline = [];
    
    // Load from current events.jsonl
    const eventsFile = path.join(config.BRAINSTORM_LOG_DIR, 'events.jsonl');
    if (fs.existsSync(eventsFile)) {
        const currentTimeline = await loadTimelineFromEvents(eventsFile, cutoffTime, dbIntensiveTasks);
        timeline.push(...currentTimeline);
    }
    
    // Load from preserved history
    const preservedFile = path.join(config.BRAINSTORM_LOG_DIR, 'preserved', 'system_metrics_history.jsonl');
    if (fs.existsSync(preservedFile)) {
        const preservedTimeline = await loadTimelineFromPreserved(preservedFile, cutoffTime, dbIntensiveTasks);
        timeline.push(...preservedTimeline);
    }
    
    // Sort by start time and merge overlapping executions
    timeline.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    
    return timeline;
}

/**
 * Load timeline data from current events.jsonl
 */
async function loadTimelineFromEvents(eventsFile, cutoffTime, dbIntensiveTasks) {
    const timeline = [];
    const pendingStarts = new Map(); // Track unmatched TASK_START events
    
    try {
        const eventsData = fs.readFileSync(eventsFile, 'utf8');
        const eventLines = eventsData.trim().split('\n').filter(line => line.trim());
        
        eventLines.forEach(line => {
            try {
                const event = JSON.parse(line);
                const eventTime = new Date(event.timestamp);
                
                // Only process events within our time range
                if (eventTime < cutoffTime) return;
                
                // Only process database-intensive tasks
                if (!dbIntensiveTasks[event.taskName]) return;
                
                if (event.eventType === 'TASK_START') {
                    pendingStarts.set(event.taskName, {
                        taskName: event.taskName,
                        startTime: event.timestamp,
                        tier: event.metadata?.tier,
                        priority: event.metadata?.priority,
                        source: 'current'
                    });
                } else if (event.eventType === 'TASK_END') {
                    const startEvent = pendingStarts.get(event.taskName);
                    if (startEvent) {
                        // Complete execution found
                        timeline.push({
                            ...startEvent,
                            endTime: event.timestamp,
                            duration: event.metadata?.duration || 0,
                            exitCode: event.metadata?.exitCode || 0,
                            success: (event.metadata?.exitCode === 0),
                            color: dbIntensiveTasks[event.taskName].color,
                            category: dbIntensiveTasks[event.taskName].category
                        });
                        pendingStarts.delete(event.taskName);
                    }
                }
            } catch (parseError) {
                // Skip malformed lines
            }
        });
        
        // Add any pending starts as ongoing executions
        pendingStarts.forEach(startEvent => {
            timeline.push({
                ...startEvent,
                endTime: null, // Still running
                duration: null,
                exitCode: null,
                success: null,
                ongoing: true,
                color: dbIntensiveTasks[startEvent.taskName].color,
                category: dbIntensiveTasks[startEvent.taskName].category
            });
        });
        
    } catch (error) {
        console.error('Error loading timeline from events:', error);
    }
    
    return timeline;
}

/**
 * Load timeline data from preserved system_metrics_history.jsonl
 */
async function loadTimelineFromPreserved(preservedFile, cutoffTime, dbIntensiveTasks) {
    const timeline = [];
    const pendingStarts = new Map();
    
    try {
        const preservedData = fs.readFileSync(preservedFile, 'utf8');
        const preservedLines = preservedData.trim().split('\n').filter(line => line.trim());
        
        preservedLines.forEach(line => {
            try {
                const record = JSON.parse(line);
                const recordTime = new Date(record.timestamp);
                
                // Only process records within our time range
                if (recordTime < cutoffTime) return;
                
                // Only process database-intensive tasks
                if (!dbIntensiveTasks[record.taskName]) return;
                
                if (record.eventType === 'TASK_START') {
                    pendingStarts.set(record.taskName + '_' + record.timestamp, {
                        taskName: record.taskName,
                        startTime: record.timestamp,
                        tier: record.tier,
                        priority: record.priority,
                        source: 'preserved'
                    });
                } else if (record.eventType === 'TASK_END') {
                    // Find matching start (most recent for this task)
                    let matchingStart = null;
                    let matchingKey = null;
                    
                    for (const [key, start] of pendingStarts.entries()) {
                        if (start.taskName === record.taskName && 
                            new Date(start.startTime) <= recordTime) {
                            if (!matchingStart || new Date(start.startTime) > new Date(matchingStart.startTime)) {
                                matchingStart = start;
                                matchingKey = key;
                            }
                        }
                    }
                    
                    if (matchingStart) {
                        timeline.push({
                            ...matchingStart,
                            endTime: record.timestamp,
                            duration: record.duration || 0,
                            exitCode: record.exitCode || 0,
                            success: !record.failure,
                            color: dbIntensiveTasks[record.taskName].color,
                            category: dbIntensiveTasks[record.taskName].category
                        });
                        pendingStarts.delete(matchingKey);
                    }
                }
            } catch (parseError) {
                // Skip malformed lines
            }
        });
        
    } catch (error) {
        console.error('Error loading timeline from preserved data:', error);
    }
    
    return timeline;
}

module.exports = getTaskTimeline;

const fs = require('fs');
const path = require('path');

/**
 * API endpoint to serve task execution timeline data for Neo4j Performance Metrics
 * GET /api/neo4j-health/task-timeline?hours=24
 */
async function getTaskTimeline(req, res) {
    try {
        const hoursBack = parseInt(req.query.hours) || 24;
        const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
        
        // Database-intensive tasks to track on the timeline
        const DB_INTENSIVE_TASKS = {
            'processAllTasks': { color: '#ef4444', category: 'orchestrator', priority: 1 },
            'syncWoT': { color: '#ef4444', category: 'orchestrator', priority: 1 },
            'syncProfiles': { color: '#ef4444', category: 'orchestrator', priority: 1 },
            'callBatchTransferIfNeeded': { color: '#ef4444', category: 'orchestrator', priority: 1 },
            'reconciliation': { color: '#ef4444', category: 'orchestrator', priority: 1 },
            'prepareNeo4jForCustomerData': { color: '#ef4444', category: 'orchestrator', priority: 1 },
            'processNpubsUpToMaxNumBlocks': { color: '#ef4444', category: 'orchestrator', priority: 1 },
            
            // owner-specific tasks
            'calculateOwnerHops': { color: '#3b82f6', category: 'graph-calc', priority: 2 },
            'calculateOwnerGrapeRank': { color: '#8b5cf6', category: 'ranking', priority: 3 },
            'calculateOwnerPageRank': { color: '#10b981', category: 'ranking', priority: 3 },
            'processOwnerFollowsMutesReports': { color: '#ef4444', category: 'orchestrator', priority: 1 },
            'calculateReportScores': { color: '#ef4444', category: 'orchestrator', priority: 1 },
            'exportOwnerKind30382': { color: '#ef4444', category: 'orchestrator', priority: 1 },

            // customer-specific tasks
            'processAllActiveCustomers': { color: '#ef4444', category: 'orchestrator', priority: 1 },
            'prepareNeo4jForCustomerData': { color: '#ef4444', category: 'orchestrator', priority: 1 },
            'updateAllScoresForSingleCustomer': { color: '#ef4444', category: 'orchestrator', priority: 1 },
            'processCustomer': { color: '#ef4444', category: 'orchestrator', priority: 1 },
            'calculateCustomerHops': { color: '#06b6d4', category: 'graph-calc', priority: 2 },
            'calculateCustomerGrapeRank': { color: '#a855f7', category: 'ranking', priority: 3 },
            'calculateCustomerPageRank': { color: '#059669', category: 'ranking', priority: 3 },
            'processCustomerFollowsMutesReports': { color: '#ef4444', category: 'orchestrator', priority: 1 },
            'exportCustomerKind30382': { color: '#ef4444', category: 'orchestrator', priority: 1 }

            // Database maintenance tasks
            // 'neo4jStabilityMonitor': { color: '#f59e0b', category: 'monitoring', priority: 4 },
            // 'neo4jPerformanceMonitor': { color: '#d97706', category: 'monitoring', priority: 4 }
        };

        const config = {
            BRAINSTORM_LOG_DIR: process.env.BRAINSTORM_LOG_DIR || '/var/log/brainstorm'
        };

        // Load data from both current events and preserved history
        const timelineData = await loadTaskTimelineData(config, cutoffTime, DB_INTENSIVE_TASKS);

        // Debug logging
        const currentData = timelineData.filter(t => t.source === 'current');
        const preservedData = timelineData.filter(t => t.source === 'preserved');
        console.log(`Timeline data loaded: ${currentData.length} current, ${preservedData.length} preserved`);

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
                currentExecutions: currentData.length,
                preservedExecutions: preservedData.length,
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
    const eventsFile = path.join(config.BRAINSTORM_LOG_DIR, 'taskQueue', 'events.jsonl');
    console.log(`Looking for events file at: ${eventsFile}`);
    console.log(`Events file exists: ${fs.existsSync(eventsFile)}`);
    
    if (fs.existsSync(eventsFile)) {
        const currentTimeline = await loadTimelineFromEvents(eventsFile, cutoffTime, dbIntensiveTasks);
        console.log(`Loaded ${currentTimeline.length} current timeline entries`);
        timeline.push(...currentTimeline);
    } else {
        console.log(`Events file not found at ${eventsFile}`);
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
        
        console.log(`Processing ${eventLines.length} event lines from ${eventsFile}`);
        console.log(`Cutoff time: ${cutoffTime.toISOString()}`);
        console.log(`Looking for tasks: ${Object.keys(dbIntensiveTasks).join(', ')}`);
        
        let processedEvents = 0;
        let filteredByTime = 0;
        let filteredByTask = 0;
        
        eventLines.forEach(line => {
            try {
                const event = JSON.parse(line);
                processedEvents++;
                
                // Log first few events for debugging
                if (processedEvents <= 5) {
                    console.log(`Sample event ${processedEvents}:`, {
                        taskName: event.taskName,
                        eventType: event.eventType,
                        timestamp: event.timestamp
                    });
                }
                
                const eventTime = new Date(event.timestamp);
                
                // Check time filter
                if (eventTime < cutoffTime) {
                    filteredByTime++;
                    return;
                }
                
                // Check task filter
                if (!dbIntensiveTasks[event.taskName]) {
                    filteredByTask++;
                    return;
                }
                
                console.log(`MATCHED event: ${event.taskName} ${event.eventType} at ${event.timestamp}`);
                
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
        
        console.log(`Event processing summary:`);
        console.log(`- Total events processed: ${processedEvents}`);
        console.log(`- Filtered by time (too old): ${filteredByTime}`);
        console.log(`- Filtered by task (not DB-intensive): ${filteredByTask}`);
        console.log(`- Pending starts: ${pendingStarts.size}`);
        console.log(`- Timeline entries created: ${timeline.length}`);
        
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
        
        console.log(`Processing ${preservedLines.length} preserved lines from ${preservedFile}`);
        
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

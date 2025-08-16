/**
 * Complete Neo4j Health Handler
 * Returns comprehensive Neo4j health data for the dashboard
 * Aggregates data from systemResourceMonitor, neo4jCrashPatternDetector, and neo4jStabilityMonitor
 * 
 * handles endpoint: /api/neo4j-health/complete
 */

const fs = require('fs');
const path = require('path');

class Neo4jHealthDataParser {
    constructor() {
        this.logDir = process.env.BRAINSTORM_LOG_DIR || '/var/log/brainstorm';
        this.eventsFile = path.join(this.logDir, 'taskQueue', 'events.jsonl');
    }

    // Get recent events for a specific task and target
    async getRecentEvents(taskName, target, limit = 10) {
        if (!fs.existsSync(this.eventsFile)) {
            return [];
        }

        const events = [];
        const lines = fs.readFileSync(this.eventsFile, 'utf8').split('\n');
        
        // Read events in reverse order (most recent first)
        for (let i = lines.length - 1; i >= 0 && events.length < limit * 10; i--) {
            const line = lines[i].trim();
            if (!line) continue;
            
            try {
                const event = JSON.parse(line);
                if (event.taskName === taskName && event.eventType === target) {
                    events.push(event);
                }
            } catch (error) {
                // Skip malformed lines
                continue;
            }
        }

        return events.slice(0, limit);
    }

    // Get health alerts
    async getHealthAlerts(cutoffTime = null, limit = 50) {
        if (!fs.existsSync(this.eventsFile)) {
            return [];
        }

        const alerts = [];
        const lines = fs.readFileSync(this.eventsFile, 'utf8').split('\n');
        
        // Read events in reverse order (most recent first)
        for (let i = lines.length - 1; i >= 0 && alerts.length < limit * 2; i--) {
            const line = lines[i].trim();
            if (!line) continue;
            
            try {
                const event = JSON.parse(line);
                
                if (event.eventType === 'HEALTH_ALERT') {
                    const eventTime = new Date(event.timestamp);
                    
                    if (!cutoffTime || eventTime >= cutoffTime) {
                        alerts.push({
                            timestamp: event.timestamp,
                            taskName: event.taskName,
                            target: event.target,
                            alertType: event.metadata?.alertType,
                            severity: event.metadata?.severity,
                            message: event.metadata?.message,
                            component: event.metadata?.component,
                            recommendedAction: event.metadata?.recommendedAction
                        });
                    }
                }
            } catch (error) {
                // Skip malformed lines
                continue;
            }
        }

        return alerts.slice(0, limit);
    }

    // Get response time from database performance monitor events
    async getResponseTimeFromEvents() {
        // Look for CONNECTION_CHECK events specifically, as that's where responseTime is stored
        const recentEvents = await this.getRecentEvents('databasePerformanceMonitor', 'CONNECTION_CHECK', 1);
        
        if (recentEvents.length === 0) {
            return null;
        }

        const latestEvent = recentEvents[0];
        
        // Look for response time in the CONNECTION_CHECK event metadata
        if (latestEvent.metadata && latestEvent.metadata.responseTime) {
            const responseTime = parseFloat(latestEvent.metadata.responseTime);
            return isNaN(responseTime) ? null : `${responseTime.toFixed(3)}s`;
        }
        
        return null;
    }

    // Get service status from enhanced metrics or fallback to events
    async getServiceStatus() {
        // Get response time from database performance monitor events
        const responseTime = await this.getResponseTimeFromEvents();
        
        // Try enhanced metrics first
        const enhancedMetrics = await this.getEnhancedMetrics();
        if (enhancedMetrics) {
            return {
                status: enhancedMetrics.status || 'unknown',
                pid: enhancedMetrics.pid || null,
                memoryMB: enhancedMetrics.memory ? Math.round(enhancedMetrics.memory.rssBytes / (1024 * 1024)) : 0,
                connectionTest: enhancedMetrics.status === 'running' ? 'success' : 'failed',
                responseTime: responseTime,
                source: 'enhanced'
            };
        }
        
        // Fallback to event-based data
        const recentEvents = await this.getRecentEvents('systemResourceMonitor', 'neo4j', 1);
        
        if (recentEvents.length === 0) {
            return {
                status: 'unknown',
                pid: null,
                memoryMB: 0,
                connectionTest: 'unknown',
                responseTime: responseTime,
                source: 'events'
            };
        }

        const latestEvent = recentEvents[0];
        const metadata = latestEvent.metadata || {};

        return {
            status: metadata.status || 'unknown',
            pid: metadata.pid || null,
            memoryMB: metadata.memoryUsageMB || 0,
            connectionTest: metadata.connectionTest || 'unknown',
            responseTime: responseTime,
            source: 'events'
        };
    }

    // Get enhanced metrics from neo4j-metrics-collector
    async getEnhancedMetrics() {
        const metricsFile = '/var/lib/brainstorm/monitoring/neo4j_metrics.json';
        
        try {
            if (!fs.existsSync(metricsFile)) {
                console.log('Enhanced metrics file not found:', metricsFile);
                return null;
            }
            
            const stats = fs.statSync(metricsFile);
            const fileAge = (Date.now() - stats.mtime.getTime()) / 1000;
            
            console.log(`Enhanced metrics file age: ${fileAge}s`);
            
            // Only use if file is fresh (less than 2 minutes old)
            if (fileAge > 120) {
                console.log('Enhanced metrics file too old, using fallback');
                return null;
            }
            
            const data = fs.readFileSync(metricsFile, 'utf8');
            const parsed = JSON.parse(data);
            console.log('Successfully loaded enhanced metrics');
            return parsed;
        } catch (error) {
            console.error('Failed to read enhanced metrics:', error);
            return null;
        }
    }

    // Get heap health from enhanced metrics or fallback to events
    async getHeapHealth() {
        // Try enhanced metrics first
        const enhancedMetrics = await this.getEnhancedMetrics();
        if (enhancedMetrics && enhancedMetrics.heap) {
            const heap = enhancedMetrics.heap;
            const gc = enhancedMetrics.gc || {};
            
            return {
                utilizationPercent: parseFloat(heap.percentUsed || 0),
                usedMB: Math.round((heap.usedBytes || 0) / (1024 * 1024)),
                totalMB: Math.round((heap.totalBytes || 0) / (1024 * 1024)),
                gcOverheadPercent: gc.totalGCTime ? parseFloat((gc.totalGCTime / 1000).toFixed(2)) : 0,
                fullGcCount: gc.fullGC || 0,
                source: 'enhanced'
            };
        }
        
        // Fallback to event-based data
        const recentEvents = await this.getRecentEvents('neo4jCrashPatternDetector', 'heap_gc_analysis', 1);
        
        if (recentEvents.length === 0) {
            return {
                utilizationPercent: 0,
                usedMB: 0,
                totalMB: 0,
                gcOverheadPercent: 0,
                fullGcCount: 0
            };
        }

        const latestEvent = recentEvents[0];
        const metrics = latestEvent.metadata?.metrics || {};

        return {
            utilizationPercent: metrics.heapUtilizationPercent || 0,
            usedMB: metrics.heapUsedMB || 0,
            totalMB: metrics.heapTotalMB || 0,
            gcOverheadPercent: parseFloat(metrics.gcOverheadPercent) || 0,
            fullGcCount: metrics.fullGcCount || 0
        };
    }

    // Get index health from neo4jStabilityMonitor events
    async getIndexHealth() {
        const recentEvents = await this.getRecentEvents('neo4jStabilityMonitor', 'index_health', 1);
        
        if (recentEvents.length === 0) {
            return {
                totalIndexes: 0,
                failedIndexes: 0,
                totalConstraints: 0,
                queryTimeout: false
            };
        }

        const latestEvent = recentEvents[0];
        const metrics = latestEvent.metadata?.metrics || {};

        return {
            totalIndexes: metrics.totalIndexes || 0,
            failedIndexes: metrics.failedIndexes || 0,
            totalConstraints: metrics.totalConstraints || 0,
            queryTimeout: latestEvent.metadata?.status === 'query_failed'
        };
    }

    // Get crash pattern statistics from health alerts
    async getCrashPatterns() {
        const cutoffTime = new Date(Date.now() - (24 * 60 * 60 * 1000)); // Last 24 hours
        const alertEvents = await this.getHealthAlerts(cutoffTime);

        const patterns = {
            heapSpaceOom: 0,
            gcOverheadOom: 0,
            apocStalling: 0,
            longTransactions: 0
        };

        for (const event of alertEvents) {
            const alertType = event.alertType;
            
            switch (alertType) {
                case 'HEAP_SPACE_OOM':
                    patterns.heapSpaceOom++;
                    break;
                case 'GC_OVERHEAD_OOM':
                    patterns.gcOverheadOom++;
                    break;
                case 'APOC_STALLING':
                    patterns.apocStalling++;
                    break;
                case 'LONG_RUNNING_TRANSACTIONS':
                    patterns.longTransactions++;
                    break;
            }
        }

        return patterns;
    }
}

async function handleCompleteNeo4jHealth(req, res) {
    try {
        console.log('Getting complete Neo4j health data');
        
        const parser = new Neo4jHealthDataParser();
        
        // Aggregate health data from all monitoring components
        const healthData = {
            service: await parser.getServiceStatus(),
            heap: await parser.getHeapHealth(),
            indexes: await parser.getIndexHealth(),
            crashPatterns: await parser.getCrashPatterns(),
            timestamp: new Date().toISOString()
        };

        res.json(healthData);
    } catch (error) {
        console.error('Complete Neo4j health API error:', error);
        res.status(500).json({
            error: 'Failed to get complete Neo4j health data',
            message: error.message
        });
    }
}

module.exports = {
    handleCompleteNeo4jHealth
};
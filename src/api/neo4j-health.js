#!/usr/bin/env node

/**
 * Neo4j Health API Endpoint
 * Provides comprehensive Neo4j health data for the dashboard
 * Aggregates data from systemResourceMonitor and neo4jStabilityMonitor
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

class Neo4jHealthAPI {
    constructor() {
        this.logDir = process.env.BRAINSTORM_LOG_DIR || '/var/log/brainstorm';
        this.eventsFile = path.join(this.logDir, 'taskQueue', 'events.jsonl');
    }

    // Get comprehensive Neo4j health data
    async getHealthData() {
        try {
            const healthData = {
                service: await this.getServiceStatus(),
                heap: await this.getHeapHealth(),
                indexes: await this.getIndexHealth(),
                crashPatterns: await this.getCrashPatterns(),
                timestamp: new Date().toISOString()
            };

            return healthData;
        } catch (error) {
            console.error('Error getting Neo4j health data:', error);
            throw error;
        }
    }

    // Get service status from recent events
    async getServiceStatus() {
        const recentEvents = await this.getRecentEvents('systemResourceMonitor', 'neo4j', 1);
        
        if (recentEvents.length === 0) {
            return {
                status: 'unknown',
                pid: null,
                memoryMB: 0,
                connectionTest: 'unknown',
                responseTime: null
            };
        }

        const latestEvent = recentEvents[0];
        const metadata = latestEvent.metadata || {};

        return {
            status: metadata.status || 'unknown',
            pid: metadata.pid || null,
            memoryMB: metadata.memoryUsageMB || 0,
            connectionTest: metadata.connectionTest || 'unknown',
            responseTime: metadata.responseTime || null
        };
    }

    // Get heap health from crash pattern detector events
    async getHeapHealth() {
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

    // Get index health from stability monitor events
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

    // Get crash pattern statistics
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
            const alertType = event.metadata?.alertType;
            
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
                if (event.taskName === taskName && event.target === target) {
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
}

// Initialize API instance
const neo4jHealthAPI = new Neo4jHealthAPI();

// Main health endpoint
router.get('/', async (req, res) => {
    try {
        const healthData = await neo4jHealthAPI.getHealthData();
        res.json(healthData);
    } catch (error) {
        console.error('Neo4j health API error:', error);
        res.status(500).json({
            error: 'Failed to get Neo4j health data',
            message: error.message
        });
    }
});

// Health alerts endpoint
router.get('/alerts', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const component = req.query.component;
        const hours = parseInt(req.query.hours) || 24;
        
        const cutoffTime = new Date(Date.now() - (hours * 60 * 60 * 1000));
        let alerts = await neo4jHealthAPI.getHealthAlerts(cutoffTime, limit * 2);
        
        // Filter by component if specified
        if (component) {
            alerts = alerts.filter(alert => alert.component === component);
        }
        
        res.json({
            alerts: alerts.slice(0, limit),
            totalCount: alerts.length,
            timeRange: `${hours} hours`
        });
    } catch (error) {
        console.error('Health alerts API error:', error);
        res.status(500).json({
            error: 'Failed to get health alerts',
            message: error.message
        });
    }
});

// Clear alerts endpoint (placeholder - would need implementation)
router.post('/alerts/clear', async (req, res) => {
    try {
        // In a real implementation, this might mark alerts as acknowledged
        // or move them to a separate acknowledged alerts file
        res.json({ success: true, message: 'Alerts cleared' });
    } catch (error) {
        console.error('Clear alerts API error:', error);
        res.status(500).json({
            error: 'Failed to clear alerts',
            message: error.message
        });
    }
});

// Service status endpoint
router.get('/service', async (req, res) => {
    try {
        const serviceStatus = await neo4jHealthAPI.getServiceStatus();
        res.json(serviceStatus);
    } catch (error) {
        console.error('Service status API error:', error);
        res.status(500).json({
            error: 'Failed to get service status',
            message: error.message
        });
    }
});

// Heap health endpoint
router.get('/heap', async (req, res) => {
    try {
        const heapHealth = await neo4jHealthAPI.getHeapHealth();
        res.json(heapHealth);
    } catch (error) {
        console.error('Heap health API error:', error);
        res.status(500).json({
            error: 'Failed to get heap health',
            message: error.message
        });
    }
});

module.exports = router;

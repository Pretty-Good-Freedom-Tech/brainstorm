/**
 * Neo4j Health Alerts Handler
 * Returns health alerts with filtering options
 * 
 * handles endpoint: /api/neo4j-health/alerts
 */

const fs = require('fs');
const path = require('path');

async function handleAlertsNeo4jHealth(req, res) {
    try {
        console.log('Getting Neo4j health alerts');
        
        const limit = parseInt(req.query.limit) || 20;
        const component = req.query.component;
        const hours = parseInt(req.query.hours) || 24;
        
        const logDir = process.env.BRAINSTORM_LOG_DIR || '/var/log/brainstorm';
        const eventsFile = path.join(logDir, 'taskQueue', 'events.jsonl');
        
        if (!fs.existsSync(eventsFile)) {
            return res.json({
                alerts: [],
                totalCount: 0,
                timeRange: `${hours} hours`
            });
        }

        const cutoffTime = new Date(Date.now() - (hours * 60 * 60 * 1000));
        const alerts = [];
        const lines = fs.readFileSync(eventsFile, 'utf8').split('\n');
        
        // Read events in reverse order (most recent first)
        for (let i = lines.length - 1; i >= 0 && alerts.length < limit * 2; i--) {
            const line = lines[i].trim();
            if (!line) continue;
            
            try {
                const event = JSON.parse(line);
                
                if (event.eventType === 'HEALTH_ALERT') {
                    const eventTime = new Date(event.timestamp);
                    
                    if (eventTime >= cutoffTime) {
                        const alert = {
                            timestamp: event.timestamp,
                            taskName: event.taskName,
                            target: event.target,
                            alertType: event.metadata?.alertType,
                            severity: event.metadata?.severity,
                            message: event.metadata?.message,
                            component: event.metadata?.component,
                            recommendedAction: event.metadata?.recommendedAction,
                            metrics: event.metadata?.metrics
                        };
                        
                        // Filter by component if specified
                        if (!component || alert.component === component) {
                            alerts.push(alert);
                        }
                    }
                }
            } catch (error) {
                // Skip malformed lines
                continue;
            }
        }

        const alertsData = {
            alerts: alerts.slice(0, limit),
            totalCount: alerts.length,
            timeRange: `${hours} hours`
        };

        res.json(alertsData);
    } catch (error) {
        console.error('Neo4j health alerts API error:', error);
        res.status(500).json({
            error: 'Failed to get Neo4j health alerts',
            message: error.message
        });
    }
}

module.exports = {
    handleAlertsNeo4jHealth
};
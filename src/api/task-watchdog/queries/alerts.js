const fs = require('fs');
const path = require('path');

/**
 * Task Watchdog Alerts Handler
 * Returns filtered health alerts from task monitoring with support for component and time range filtering
 */
async function handleTaskWatchdogAlerts(req, res) {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const component = req.query.component;
        const hours = parseInt(req.query.hours) || 24;
        const severity = req.query.severity; // critical, warning, info

        const eventsLogPath = path.join(process.env.BRAINSTORM_LOG_DIR || '/var/log/brainstorm', 'taskQueue', 'events.jsonl');
        
        if (!fs.existsSync(eventsLogPath)) {
            return res.json({
                timestamp: new Date().toISOString(),
                status: 'success',
                data: {
                    alerts: [],
                    totalAlerts: 0,
                    criticalAlerts: 0,
                    warningAlerts: 0,
                    infoAlerts: 0
                },
                metadata: {
                    dataSource: 'events.jsonl',
                    lastUpdated: new Date().toISOString(),
                    recordCount: 0,
                    filters: { limit, component, hours, severity }
                }
            });
        }

        // Read and parse events log
        const eventsData = fs.readFileSync(eventsLogPath, 'utf8');
        const events = eventsData.trim().split('\n')
            .filter(line => line.trim())
            .map(line => {
                try {
                    return JSON.parse(line);
                } catch (e) {
                    return null;
                }
            })
            .filter(event => event !== null);

        // Filter for HEALTH_ALERT events within time range
        const timeThreshold = new Date(Date.now() - hours * 60 * 60 * 1000);
        let healthAlerts = events.filter(event => {
            if (event.eventType !== 'HEALTH_ALERT') return false;
            
            const eventTime = new Date(event.timestamp);
            if (eventTime < timeThreshold) return false;
            
            // Filter by component if specified
            if (component && event.metadata && event.metadata.component !== component) {
                return false;
            }
            
            // Filter by severity if specified
            if (severity && event.metadata && event.metadata.severity !== severity) {
                return false;
            }
            
            return true;
        });

        // Sort by timestamp (most recent first) and limit
        healthAlerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const limitedAlerts = healthAlerts.slice(0, limit);

        // Count alerts by severity
        let criticalAlerts = 0;
        let warningAlerts = 0;
        let infoAlerts = 0;

        healthAlerts.forEach(alert => {
            const alertSeverity = alert.metadata?.severity || 'info';
            switch (alertSeverity) {
                case 'critical':
                    criticalAlerts++;
                    break;
                case 'warning':
                    warningAlerts++;
                    break;
                case 'info':
                    infoAlerts++;
                    break;
            }
        });

        // Transform alerts for frontend consumption
        const transformedAlerts = limitedAlerts.map(alert => {
            const metadata = alert.metadata || {};
            return {
                id: `${alert.timestamp}_${alert.taskName}`,
                timestamp: alert.timestamp,
                taskName: alert.taskName,
                target: alert.target,
                alertType: metadata.alertType || 'UNKNOWN',
                severity: metadata.severity || 'info',
                message: metadata.message || 'No message provided',
                component: metadata.component || 'unknown',
                recommendedAction: metadata.recommendedAction || 'No action specified',
                additionalData: {
                    ...metadata
                }
            };
        });

        const responseData = {
            alerts: transformedAlerts,
            totalAlerts: healthAlerts.length,
            criticalAlerts,
            warningAlerts,
            infoAlerts,
            timeRange: `${hours} hours`,
            alertTypes: [...new Set(transformedAlerts.map(a => a.alertType))],
            components: [...new Set(transformedAlerts.map(a => a.component))]
        };

        res.json({
            timestamp: new Date().toISOString(),
            status: 'success',
            data: responseData,
            metadata: {
                dataSource: 'events.jsonl',
                lastUpdated: new Date().toISOString(),
                recordCount: limitedAlerts.length,
                filters: { limit, component, hours, severity }
            }
        });

    } catch (error) {
        console.error('Error in handleTaskWatchdogAlerts:', error);
        res.status(500).json({
            timestamp: new Date().toISOString(),
            status: 'error',
            error: 'Failed to get task watchdog alerts',
            message: error.message
        });
    }
}

module.exports = { handleTaskWatchdogAlerts };

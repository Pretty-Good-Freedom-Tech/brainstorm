/**
 * Service Status Handler
 * Returns status information for monitoring services
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class ServiceStatusChecker {
    constructor() {
        this.metricsFile = '/var/lib/brainstorm/monitoring/neo4j_metrics.json';
        this.logDir = process.env.BRAINSTORM_LOG_DIR || '/var/log/brainstorm';
    }

    // Get systemd service status
    getSystemdStatus(serviceName) {
        try {
            const output = execSync(`systemctl show ${serviceName} --no-page`, { encoding: 'utf8' });
            const properties = {};
            
            output.split('\n').forEach(line => {
                const [key, value] = line.split('=');
                if (key && value !== undefined) {
                    properties[key] = value;
                }
            });

            return {
                status: properties.ActiveState || 'unknown',
                subState: properties.SubState || 'unknown',
                pid: properties.MainPID && properties.MainPID !== '0' ? properties.MainPID : null,
                uptime: this.calculateUptime(properties.ActiveEnterTimestamp),
                restartCount: parseInt(properties.NRestarts) || 0
            };
        } catch (error) {
            return {
                status: 'error',
                error: error.message
            };
        }
    }

    // Calculate service uptime
    calculateUptime(timestamp) {
        if (!timestamp || timestamp === '0') return null;
        
        try {
            const startTime = new Date(timestamp).getTime();
            const now = Date.now();
            const uptimeMs = now - startTime;
            
            if (uptimeMs < 0) return null;
            
            const seconds = Math.floor(uptimeMs / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);
            
            if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
            if (hours > 0) return `${hours}h ${minutes % 60}m`;
            if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
            return `${seconds}s`;
        } catch (error) {
            return null;
        }
    }

    // Check Neo4j metrics collector status
    async getNeo4jMetricsCollectorStatus() {
        const serviceStatus = this.getSystemdStatus('neo4j-metrics-collector.service');
        
        // Check metrics file status
        let metricsFileStatus = 'Not found';
        let lastCollection = null;
        
        try {
            if (fs.existsSync(this.metricsFile)) {
                const stats = fs.statSync(this.metricsFile);
                const fileAge = (Date.now() - stats.mtime.getTime()) / 1000;
                
                if (fileAge < 60) {
                    metricsFileStatus = 'Fresh';
                } else if (fileAge < 300) {
                    metricsFileStatus = 'Recent';
                } else {
                    metricsFileStatus = 'Stale';
                }
                
                lastCollection = stats.mtime.toISOString();
            }
        } catch (error) {
            metricsFileStatus = 'Error';
        }

        return {
            ...serviceStatus,
            metricsFileStatus,
            lastCollection
        };
    }

    // Check monitoring scheduler status
    async getMonitoringSchedulerStatus() {
        const timerStatus = this.getSystemdStatus('brainstorm-monitoring-scheduler.timer');
        const serviceStatus = this.getSystemdStatus('brainstorm-monitoring-scheduler.service');
        
        // Get timer information
        let nextExecution = null;
        let lastExecution = null;
        
        try {
            const timerOutput = execSync('systemctl list-timers brainstorm-monitoring-scheduler.timer --no-page', { encoding: 'utf8' });
            const lines = timerOutput.split('\n');
            
            for (const line of lines) {
                if (line.includes('brainstorm-monitoring-scheduler.timer')) {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length >= 2) {
                        nextExecution = parts[0] + ' ' + parts[1];
                        if (parts.length >= 4) {
                            lastExecution = parts[2] + ' ' + parts[3];
                        }
                    }
                    break;
                }
            }
        } catch (error) {
            // Timer info not available
        }

        // Check for active monitoring tasks
        let activeTasks = 0;
        try {
            const eventsFile = path.join(this.logDir, 'taskQueue', 'events.jsonl');
            if (fs.existsSync(eventsFile)) {
                const recentTime = new Date(Date.now() - 10 * 60 * 1000); // Last 10 minutes
                const events = fs.readFileSync(eventsFile, 'utf8')
                    .split('\n')
                    .filter(line => line.trim())
                    .map(line => {
                        try {
                            return JSON.parse(line);
                        } catch {
                            return null;
                        }
                    })
                    .filter(event => event && new Date(event.timestamp) > recentTime);
                
                // Count unique active monitoring tasks
                const activeTaskNames = new Set();
                events.forEach(event => {
                    if (event.eventType === 'TASK_START' && 
                        ['databasePerformanceMonitor', 'systemResourceMonitor', 'networkConnectivityMonitor', 'applicationHealthMonitor'].includes(event.taskName)) {
                        activeTaskNames.add(event.taskName);
                    }
                });
                
                activeTasks = activeTaskNames.size;
            }
        } catch (error) {
            // Unable to check active tasks
        }

        return {
            timerStatus: timerStatus.status,
            serviceStatus: serviceStatus.status,
            nextExecution,
            lastExecution,
            activeTasks
        };
    }
}

async function handleServiceStatus(req, res) {
    try {
        console.log('Getting service management status');
        
        const checker = new ServiceStatusChecker();
        
        const statusData = {
            neo4jMetricsCollector: await checker.getNeo4jMetricsCollectorStatus(),
            monitoringScheduler: await checker.getMonitoringSchedulerStatus(),
            timestamp: new Date().toISOString()
        };

        res.json(statusData);
    } catch (error) {
        console.error('Service status API error:', error);
        res.status(500).json({
            error: 'Failed to get service status',
            message: error.message
        });
    }
}

module.exports = {
    handleServiceStatus
};

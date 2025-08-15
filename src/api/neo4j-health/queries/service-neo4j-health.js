/**
 * Neo4j Service Health Handler
 * Returns Neo4j service status and connection information
 * 
 * handles endpoint: /api/neo4j-health/service
 */

const fs = require('fs');
const path = require('path');

async function handleServiceNeo4jHealth(req, res) {
    try {
        console.log('Getting Neo4j service health data');
        
        const logDir = process.env.BRAINSTORM_LOG_DIR || '/var/log/brainstorm';
        const eventsFile = path.join(logDir, 'taskQueue', 'events.jsonl');
        
        if (!fs.existsSync(eventsFile)) {
            return res.json({
                status: 'unknown',
                pid: null,
                memoryMB: 0,
                connectionTest: 'unknown',
                responseTime: null,
                timestamp: new Date().toISOString()
            });
        }

        // Find the most recent neo4j event from systemResourceMonitor
        const lines = fs.readFileSync(eventsFile, 'utf8').split('\n');
        let latestServiceEvent = null;
        
        // Read events in reverse order (most recent first)
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (!line) continue;
            
            try {
                const event = JSON.parse(line);
                if (event.taskName === 'systemResourceMonitor' && event.target === 'neo4j') {
                    latestServiceEvent = event;
                    break;
                }
            } catch (error) {
                // Skip malformed lines
                continue;
            }
        }

        if (!latestServiceEvent) {
            return res.json({
                status: 'unknown',
                pid: null,
                memoryMB: 0,
                connectionTest: 'unknown',
                responseTime: null,
                timestamp: new Date().toISOString()
            });
        }

        const metadata = latestServiceEvent.metadata || {};
        
        const serviceData = {
            status: metadata.status || 'unknown',
            pid: metadata.pid || null,
            memoryMB: metadata.memoryUsageMB || 0,
            connectionTest: metadata.connectionTest || 'unknown',
            responseTime: metadata.responseTime || null,
            timestamp: latestServiceEvent.timestamp || new Date().toISOString()
        };

        res.json(serviceData);
    } catch (error) {
        console.error('Neo4j service health API error:', error);
        res.status(500).json({
            error: 'Failed to get Neo4j service health data',
            message: error.message
        });
    }
}

module.exports = {
    handleServiceNeo4jHealth
};
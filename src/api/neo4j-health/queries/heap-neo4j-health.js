/**
 * Neo4j Heap Health Handler
 * Returns heap and GC metrics for Neo4j
 * 
 * handles endpoint: /api/neo4j-health/heap
 */

const fs = require('fs');
const path = require('path');

async function handleHeapNeo4jHealth(req, res) {
    try {
        console.log('Getting Neo4j heap health data');
        
        const logDir = process.env.BRAINSTORM_LOG_DIR || '/var/log/brainstorm';
        const eventsFile = path.join(logDir, 'taskQueue', 'events.jsonl');
        
        if (!fs.existsSync(eventsFile)) {
            return res.json({
                utilizationPercent: 0,
                usedMB: 0,
                totalMB: 0,
                gcOverheadPercent: 0,
                fullGcCount: 0,
                timestamp: new Date().toISOString()
            });
        }

        // Find the most recent heap_gc_analysis event from neo4jCrashPatternDetector
        const lines = fs.readFileSync(eventsFile, 'utf8').split('\n');
        let latestHeapEvent = null;
        
        // Read events in reverse order (most recent first)
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (!line) continue;
            
            try {
                const event = JSON.parse(line);
                if (event.taskName === 'neo4jCrashPatternDetector' && event.target === 'heap_gc_analysis') {
                    latestHeapEvent = event;
                    break;
                }
            } catch (error) {
                // Skip malformed lines
                continue;
            }
        }

        if (!latestHeapEvent) {
            return res.json({
                utilizationPercent: 0,
                usedMB: 0,
                totalMB: 0,
                gcOverheadPercent: 0,
                fullGcCount: 0,
                timestamp: new Date().toISOString()
            });
        }

        const metrics = latestHeapEvent.metadata?.metrics || {};
        
        const heapData = {
            utilizationPercent: metrics.heapUtilizationPercent || 0,
            usedMB: metrics.heapUsedMB || 0,
            totalMB: metrics.heapTotalMB || 0,
            gcOverheadPercent: parseFloat(metrics.gcOverheadPercent) || 0,
            fullGcCount: metrics.fullGcCount || 0,
            timestamp: latestHeapEvent.timestamp || new Date().toISOString()
        };

        res.json(heapData);
    } catch (error) {
        console.error('Neo4j heap health API error:', error);
        res.status(500).json({
            error: 'Failed to get Neo4j heap health data',
            message: error.message
        });
    }
}

module.exports = {
    handleHeapNeo4jHealth
};
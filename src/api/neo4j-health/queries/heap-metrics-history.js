/**
 * Neo4j Heap Metrics History Handler
 * Returns time-series data for heap utilization visualization
 * Parses PROGRESS events from neo4jCrashPatternDetector for heap_gc_analysis
 * 
 * handles endpoint: /api/neo4j-health/heap-metrics-history
 */

const fs = require('fs');
const path = require('path');

class HeapMetricsHistoryParser {
    constructor() {
        this.logDir = process.env.BRAINSTORM_LOG_DIR || '/var/log/brainstorm';
        this.eventsFile = path.join(this.logDir, 'taskQueue', 'events.jsonl');
    }

    // Get heap metrics history for time-series visualization
    async getHeapMetricsHistory(hoursBack = 24, maxPoints = 100) {
        if (!fs.existsSync(this.eventsFile)) {
            return [];
        }

        const cutoffTime = new Date(Date.now() - (hoursBack * 60 * 60 * 1000));
        const heapMetrics = [];
        const lines = fs.readFileSync(this.eventsFile, 'utf8').split('\n');
        
        // Read events in reverse order (most recent first)
        for (let i = lines.length - 1; i >= 0 && heapMetrics.length < maxPoints * 2; i--) {
            const line = lines[i].trim();
            if (!line) continue;
            
            try {
                const event = JSON.parse(line);
                const eventTime = new Date(event.timestamp);
                
                // Filter for neo4jCrashPatternDetector heap_gc_analysis events
                if (event.eventType === 'PROGRESS' && 
                    event.taskName === 'neo4jCrashPatternDetector' &&
                    event.target === 'heap_gc_analysis' &&
                    event.metadata?.metrics &&
                    eventTime >= cutoffTime) {
                    
                    const metrics = event.metadata.metrics;
                    
                    heapMetrics.push({
                        timestamp: event.timestamp,
                        heapUtilizationPercent: metrics.heapUtilizationPercent || 0,
                        heapUsedMB: metrics.heapUsedMB || 0,
                        heapTotalMB: metrics.heapTotalMB || 0,
                        youngGcCount: metrics.youngGcCount || 0,
                        fullGcCount: metrics.fullGcCount || 0,
                        gcOverheadPercent: parseFloat(metrics.gcOverheadPercent || 0)
                    });
                }
            } catch (error) {
                // Skip malformed lines
                continue;
            }
        }

        // Sort chronologically (oldest first for time-series)
        heapMetrics.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        // Limit to maxPoints if we have too many
        if (heapMetrics.length > maxPoints) {
            const step = Math.floor(heapMetrics.length / maxPoints);
            return heapMetrics.filter((_, index) => index % step === 0).slice(0, maxPoints);
        }
        
        return heapMetrics;
    }
}

async function handleHeapMetricsHistory(req, res) {
    try {
        const hoursBack = parseInt(req.query.hours) || 24;
        const maxPoints = parseInt(req.query.maxPoints) || 100;
        
        console.log(`Getting heap metrics history: ${hoursBack}h back, max ${maxPoints} points`);
        
        const parser = new HeapMetricsHistoryParser();
        const heapHistory = await parser.getHeapMetricsHistory(hoursBack, maxPoints);
        
        res.json({
            success: true,
            data: heapHistory,
            metadata: {
                hoursBack,
                maxPoints,
                actualPoints: heapHistory.length,
                timeRange: heapHistory.length > 0 ? {
                    start: heapHistory[0].timestamp,
                    end: heapHistory[heapHistory.length - 1].timestamp
                } : null
            }
        });
    } catch (error) {
        console.error('Heap metrics history API error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get heap metrics history',
            message: error.message
        });
    }
}

module.exports = { handleHeapMetricsHistory };

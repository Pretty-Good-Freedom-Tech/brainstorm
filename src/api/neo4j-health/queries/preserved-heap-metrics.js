/**
 * Preserved Heap Metrics Handler
 * Returns heap metrics from preserved data storage for long-term analysis
 * Complements heap-metrics-history.js by providing data beyond events.jsonl rotation
 * 
 * handles endpoint: /api/neo4j-health/preserved-heap-metrics
 */

const fs = require('fs');
const path = require('path');

class PreservedHeapMetricsParser {
    constructor() {
        this.logDir = process.env.BRAINSTORM_LOG_DIR || '/var/log/brainstorm';
        this.preservedDir = path.join(this.logDir, 'preserved');
        this.heapMetricsFile = path.join(this.preservedDir, 'heap_metrics_history.jsonl');
        this.eventsFile = path.join(this.logDir, 'taskQueue', 'events.jsonl');
    }

    // Get combined heap metrics from both preserved storage and current events
    async getCombinedHeapMetrics(hoursBack = 168, maxPoints = 500) { // Default 7 days
        const cutoffTime = new Date(Date.now() - (hoursBack * 60 * 60 * 1000));
        const heapMetrics = [];

        // First, get preserved data (older, beyond rotation)
        if (fs.existsSync(this.heapMetricsFile)) {
            const preservedLines = fs.readFileSync(this.heapMetricsFile, 'utf8').split('\n');
            
            for (const line of preservedLines) {
                if (!line.trim()) continue;
                
                try {
                    const event = JSON.parse(line);
                    const eventTime = new Date(event.timestamp);
                    
                    if (eventTime >= cutoffTime && event.metadata?.metrics) {
                        const metrics = event.metadata.metrics;
                        
                        heapMetrics.push({
                            timestamp: event.timestamp,
                            heapUtilizationPercent: metrics.heapUtilizationPercent || 0,
                            heapUsedMB: metrics.heapUsedMB || 0,
                            heapTotalMB: metrics.heapTotalMB || 0,
                            metaspaceUsedMB: metrics.metaspaceUsedMB || 0,
                            metaspaceTotalMB: metrics.metaspaceTotalMB || 0,
                            gcTimePercent: metrics.gcTimePercent || 0,
                            source: 'preserved'
                        });
                    }
                } catch (error) {
                    // Skip invalid JSON lines
                    continue;
                }
            }
        }

        // Then, get current events data (recent, within rotation window)
        if (fs.existsSync(this.eventsFile)) {
            const currentLines = fs.readFileSync(this.eventsFile, 'utf8').split('\n');
            
            for (const line of currentLines) {
                if (!line.trim()) continue;
                
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
                            metaspaceUsedMB: metrics.metaspaceUsedMB || 0,
                            metaspaceTotalMB: metrics.metaspaceTotalMB || 0,
                            gcTimePercent: metrics.gcTimePercent || 0,
                            source: 'current'
                        });
                    }
                } catch (error) {
                    // Skip invalid JSON lines
                    continue;
                }
            }
        }

        // Sort by timestamp and remove duplicates
        heapMetrics.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        // Remove duplicates based on timestamp (prefer current over preserved)
        const uniqueMetrics = [];
        const seenTimestamps = new Set();
        
        for (const metric of heapMetrics) {
            const timeKey = metric.timestamp;
            if (!seenTimestamps.has(timeKey)) {
                seenTimestamps.add(timeKey);
                uniqueMetrics.push(metric);
            } else if (metric.source === 'current') {
                // Replace preserved data with current data for same timestamp
                const existingIndex = uniqueMetrics.findIndex(m => m.timestamp === timeKey);
                if (existingIndex !== -1) {
                    uniqueMetrics[existingIndex] = metric;
                }
            }
        }

        // Downsample if too many points
        if (uniqueMetrics.length > maxPoints) {
            const step = Math.ceil(uniqueMetrics.length / maxPoints);
            return uniqueMetrics.filter((_, index) => index % step === 0);
        }

        return uniqueMetrics;
    }

    // Get preservation statistics
    async getPreservationStats() {
        const summaryFile = path.join(this.preservedDir, 'preservation_summary.json');
        
        if (!fs.existsSync(summaryFile)) {
            return {
                available: false,
                message: 'No preserved data available'
            };
        }

        try {
            const summary = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
            
            // Add file sizes and date ranges
            const stats = { ...summary, available: true };
            
            if (fs.existsSync(this.heapMetricsFile)) {
                const fileStats = fs.statSync(this.heapMetricsFile);
                stats.heapMetricsFileSize = fileStats.size;
                stats.heapMetricsLastModified = fileStats.mtime.toISOString();
                
                // Get date range of preserved data
                const lines = fs.readFileSync(this.heapMetricsFile, 'utf8').split('\n').filter(l => l.trim());
                if (lines.length > 0) {
                    try {
                        const firstEvent = JSON.parse(lines[0]);
                        const lastEvent = JSON.parse(lines[lines.length - 1]);
                        stats.preservedDataRange = {
                            oldest: firstEvent.timestamp,
                            newest: lastEvent.timestamp
                        };
                    } catch (error) {
                        // Skip if can't parse dates
                    }
                }
            }
            
            return stats;
        } catch (error) {
            return {
                available: false,
                error: error.message
            };
        }
    }
}

async function handlePreservedHeapMetrics(req, res) {
    try {
        const parser = new PreservedHeapMetricsParser();
        const hoursBack = parseInt(req.query.hours) || 168; // Default 7 days
        const maxPoints = parseInt(req.query.maxPoints) || 500;
        
        const metrics = await parser.getCombinedHeapMetrics(hoursBack, maxPoints);
        const stats = await parser.getPreservationStats();
        
        res.json({
            success: true,
            data: {
                metrics,
                preservationStats: stats,
                query: {
                    hoursBack,
                    maxPoints,
                    totalPoints: metrics.length
                }
            }
        });
        
    } catch (error) {
        console.error('Preserved heap metrics API error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get preserved heap metrics',
            message: error.message
        });
    }
}

module.exports = { handlePreservedHeapMetrics };

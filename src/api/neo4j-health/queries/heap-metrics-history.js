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
        this.preservedDir = path.join(this.logDir, 'preserved');
        this.heapMetricsFile = path.join(this.preservedDir, 'heap_metrics_history.jsonl');
    }

    // Get heap metrics history for time-series visualization
    // Always combines all available data from both current and preserved sources
    async getHeapMetricsHistory(hoursBack = 24, maxPoints = 100) {
        const cutoffTime = new Date(Date.now() - (hoursBack * 60 * 60 * 1000));
        const heapMetrics = [];

        // Always get ALL current data first
        if (fs.existsSync(this.eventsFile)) {
            const lines = fs.readFileSync(this.eventsFile, 'utf8').split('\n');
            
            for (const line of lines) {
                if (!line.trim()) continue;
                
                try {
                    const event = JSON.parse(line);
                    const eventTime = new Date(event.timestamp);
                    
                    // Filter for neo4jCrashPatternDetector heap_gc_analysis events
                    if (event.eventType === 'PROGRESS' && 
                        event.taskName === 'neo4jCrashPatternDetector' &&
                        event.target === 'heap_gc_analysis' &&
                        event.metadata?.metrics) {
                        
                        const metrics = event.metadata.metrics;
                        
                        heapMetrics.push({
                            timestamp: event.timestamp,
                            heapUtilizationPercent: metrics.heapUtilizationPercent || 0,
                            heapUsedMB: metrics.heapUsedMB || 0,
                            heapTotalMB: metrics.heapTotalMB || 0,
                            youngGcCount: metrics.youngGcCount || 0,
                            fullGcCount: metrics.fullGcCount || 0,
                            gcOverheadPercent: parseFloat(metrics.gcOverheadPercent || 0),
                            // New Metaspace and memory metrics
                            metaspaceUtilizationPercent: parseFloat(metrics.metaspaceUtilizationPercent || 0),
                            metaspaceUsedMB: parseFloat(metrics.metaspaceUsedMB || 0),
                            metaspaceCapacityMB: parseFloat(metrics.metaspaceCapacityMB || 0),
                            metaspaceMaxMB: parseFloat(metrics.metaspaceMaxMB || 0),
                            // Additional JVM memory areas
                            oldGenUsedMB: parseFloat(metrics.oldGenUsedMB || 0),
                            oldGenCapacityMB: parseFloat(metrics.oldGenCapacityMB || 0),
                            youngGenUsedMB: parseFloat(metrics.youngGenUsedMB || 0),
                            youngGenCapacityMB: parseFloat(metrics.youngGenCapacityMB || 0),
                            // Compressed class space
                            compressedClassUsedMB: parseFloat(metrics.compressedClassUsedMB || 0),
                            compressedClassCapacityMB: parseFloat(metrics.compressedClassCapacityMB || 0),
                            // Survivor spaces
                            survivorUsedMB: parseFloat(metrics.survivorUsedMB || 0),
                            survivorCapacityMB: parseFloat(metrics.survivorCapacityMB || 0),
                            s0UsedMB: parseFloat(metrics.s0UsedMB || 0),
                            s0CapacityMB: parseFloat(metrics.s0CapacityMB || 0),
                            s1UsedMB: parseFloat(metrics.s1UsedMB || 0),
                            s1CapacityMB: parseFloat(metrics.s1CapacityMB || 0),
                            // GC performance metrics
                            youngGcTimeSec: parseFloat(metrics.youngGcTimeSec || 0),
                            fullGcTimeSec: parseFloat(metrics.fullGcTimeSec || 0),
                            avgGcTimeMs: parseFloat(metrics.avgGcTimeMs || 0),
                            source: 'current'
                        });
                    }
                } catch (error) {
                    // Skip malformed lines
                    continue;
                }
            }
        }

        // Always get ALL preserved data
        if (fs.existsSync(this.heapMetricsFile)) {
            const preservedLines = fs.readFileSync(this.heapMetricsFile, 'utf8').split('\n');
            
            for (const line of preservedLines) {
                if (!line.trim()) continue;
                
                try {
                    const event = JSON.parse(line);
                    
                    if (event.metadata?.metrics) {
                        const metrics = event.metadata.metrics;
                        
                        heapMetrics.push({
                            timestamp: event.timestamp,
                            heapUtilizationPercent: metrics.heapUtilizationPercent || 0,
                            heapUsedMB: metrics.heapUsedMB || 0,
                            heapTotalMB: metrics.heapTotalMB || 0,
                            youngGcCount: metrics.youngGcCount || 0,
                            fullGcCount: metrics.fullGcCount || 0,
                            gcOverheadPercent: parseFloat(metrics.gcOverheadPercent || metrics.gcTimePercent || 0),
                            // Metaspace metrics (with fallback naming)
                            metaspaceUtilizationPercent: parseFloat(metrics.metaspaceUtilizationPercent || 0),
                            metaspaceUsedMB: parseFloat(metrics.metaspaceUsedMB || 0),
                            metaspaceCapacityMB: parseFloat(metrics.metaspaceCapacityMB || metrics.metaspaceTotalMB || 0),
                            metaspaceMaxMB: parseFloat(metrics.metaspaceMaxMB || 0),
                            // Additional JVM memory areas (may not be available in preserved data)
                            oldGenUsedMB: parseFloat(metrics.oldGenUsedMB || 0),
                            oldGenCapacityMB: parseFloat(metrics.oldGenCapacityMB || 0),
                            youngGenUsedMB: parseFloat(metrics.youngGenUsedMB || 0),
                            youngGenCapacityMB: parseFloat(metrics.youngGenCapacityMB || 0),
                            // Compressed class space (preserved data fallback)
                            compressedClassUsedMB: parseFloat(metrics.compressedClassUsedMB || 0),
                            compressedClassCapacityMB: parseFloat(metrics.compressedClassCapacityMB || 0),
                            // Survivor spaces (preserved data fallback)
                            survivorUsedMB: parseFloat(metrics.survivorUsedMB || 0),
                            survivorCapacityMB: parseFloat(metrics.survivorCapacityMB || 0),
                            s0UsedMB: parseFloat(metrics.s0UsedMB || 0),
                            s0CapacityMB: parseFloat(metrics.s0CapacityMB || 0),
                            s1UsedMB: parseFloat(metrics.s1UsedMB || 0),
                            s1CapacityMB: parseFloat(metrics.s1CapacityMB || 0),
                            // GC performance metrics
                            youngGcTimeSec: parseFloat(metrics.youngGcTimeSec || 0),
                            fullGcTimeSec: parseFloat(metrics.fullGcTimeSec || 0),
                            avgGcTimeMs: parseFloat(metrics.avgGcTimeMs || 0),
                            source: 'preserved'
                        });
                    }
                } catch (error) {
                    // Skip invalid JSON lines
                    continue;
                }
            }
        }

        // Sort chronologically (oldest first for time-series)
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

        // Now filter by the requested time range
        const filteredMetrics = uniqueMetrics.filter(metric => 
            new Date(metric.timestamp) >= cutoffTime
        );
        
        // Limit to maxPoints if we have too many
        if (filteredMetrics.length > maxPoints) {
            const step = Math.floor(filteredMetrics.length / maxPoints);
            return filteredMetrics.filter((_, index) => index % step === 0).slice(0, maxPoints);
        }
        
        return filteredMetrics;
    }

    // Get preservation statistics for metadata
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

async function handleHeapMetricsHistory(req, res) {
    try {
        const hoursBack = parseInt(req.query.hours) || 24;
        const maxPoints = parseInt(req.query.maxPoints) || 100;
        
        console.log(`Getting heap metrics history: ${hoursBack}h back, max ${maxPoints} points`);
        
        const parser = new HeapMetricsHistoryParser();
        const heapHistory = await parser.getHeapMetricsHistory(hoursBack, maxPoints);
        const preservationStats = await parser.getPreservationStats();
        
        // Count data sources
        const currentCount = heapHistory.filter(d => d.source === 'current').length;
        const preservedCount = heapHistory.filter(d => d.source === 'preserved').length;
        
        res.json({
            success: true,
            data: heapHistory,
            metadata: {
                hoursBack,
                maxPoints,
                actualPoints: heapHistory.length,
                dataSources: {
                    current: currentCount,
                    preserved: preservedCount,
                    total: heapHistory.length
                },
                preservationStats,
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

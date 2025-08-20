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

    // Get recent events for a specific task, with optional filtering by target or eventType
    async getRecentEvents(taskName, filter = null, limit = 10, filterType = 'target') {
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
                
                // Always match taskName
                if (event.taskName !== taskName) {
                    continue;
                }
                
                // Apply filter if provided
                if (filter !== null) {
                    if (filterType === 'eventType' && event.eventType !== filter) {
                        continue;
                    } else if (filterType === 'target' && event.target !== filter) {
                        continue;
                    }
                }
                
                events.push(event);
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
        const recentEvents = await this.getRecentEvents('databasePerformanceMonitor', 'CONNECTION_CHECK', 1, 'eventType');
        
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
        const recentEvents = await this.getRecentEvents('systemResourceMonitor', 'neo4j', 1, 'target');
        
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
        const recentEvents = await this.getRecentEvents('neo4jCrashPatternDetector', 'heap_gc_analysis', 1, 'target');
        
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
        const recentEvents = await this.getRecentEvents('neo4jStabilityMonitor', 'index_health', 1, 'target');
        
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

    // Get crash pattern statistics from health alerts and progress events
    async getCrashPatterns() {
        const cutoffTime = new Date(Date.now() - (24 * 60 * 60 * 1000)); // Last 24 hours
        const alertEvents = await this.getHealthAlerts(cutoffTime);

        const patterns = {
            heapSpaceOom: 0,
            gcOverheadOom: 0,
            metaspaceOom: 0,
            nativeThreadOom: 0,
            apocStalling: 0,
            longTransactions: 0
        };

        // Count HEALTH_ALERT events for crash patterns
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
                case 'METASPACE_OOM':
                    patterns.metaspaceOom++;
                    break;
                case 'NATIVE_THREAD_OOM':
                    patterns.nativeThreadOom++;
                    break;
            }
        }

        // Also get latest metrics from neo4jCrashPatternDetector PROGRESS events
        const progressEvents = await this.getProgressEvents('neo4jCrashPatternDetector', cutoffTime);
        // Find the most recent heap/GC analysis for current metrics
        const heapAnalysisEvent = progressEvents.find(event => 
            event.target === 'heap_gc_analysis' && 
            event.metadata?.metrics
        );
        
        if (heapAnalysisEvent) {
            const metrics = heapAnalysisEvent.metadata.metrics;
            
            // Add current heap utilization as a pattern indicator
            if (metrics.heapUtilizationPercent >= 95) {
                patterns.heapSpaceOom += 1;
            }
            
            // Add GC overhead as pattern indicator
            const gcOverhead = parseFloat(metrics.gcOverheadPercent || 0);
            if (gcOverhead >= 50) {
                patterns.gcOverheadOom += 1;
            }
        }

        return patterns;
    }

    // Get progress events for a specific task
    async getProgressEvents(taskName, cutoffTime) {
        // Use existing getRecentEvents with PROGRESS filter and higher limit
        const events = await this.getRecentEvents(taskName, 'PROGRESS', 100, 'eventType');
        // Apply time filter if provided
        if (cutoffTime) {
            return events.filter(event => {
                const eventTime = new Date(event.timestamp);
                return eventTime >= cutoffTime;
            });
        }
        
        return events;
    }

    // Get JVM metrics
    async getJvmMetrics() {
        try {
            const { execSync } = require('child_process');
            const pid = execSync('pgrep -f "org.neo4j.server.CommunityEntryPoint" || echo ""').toString().trim();
            
            if (!pid) {
                return { error: 'Neo4j process not found' };
            }
            
            // Get thread info
            const threadDump = execSync(`sudo -u neo4j jcmd ${pid} Thread.print`).toString();
            const threadCount = (threadDump.match(/^\s*java\.lang\.Thread\.State/gm) || []).length;
            
            // Get peak thread count from jstat
            let peakThreadCount = threadCount;
            try {
                const jstatOutput = execSync(`sudo -u neo4j jstat -gcutil ${pid} 1 1 | tail -n 1`).toString().trim();
                const fields = jstatOutput.split(/\s+/);
                if (fields.length >= 1) {
                    peakThreadCount = parseInt(fields[0], 10) || threadCount;
                }
            } catch (e) {
                console.error('Error getting thread stats:', e.message);
            }
            
            // Get safepoint info
            let safepointTime = 0;
            let safepointSyncTime = 0;
            let safepointOverhead = 0;
            
            try {
                const gcLogFile = '/var/log/neo4j/gc.log';
                if (require('fs').existsSync(gcLogFile)) {
                    const gcLog = execSync(`tail -n 100 ${gcLogFile} | grep -i safepoint || echo ""`).toString();
                    const lastSafepoint = gcLog.trim().split('\n').pop();
                    
                    // Extract safepoint timing info (simplified example)
                    const timeMatch = lastSafepoint.match(/total=([\d.]+)ms/);
                    const syncMatch = lastSafepoint.match(/synch=([\d.]+)ms/);
                    
                    safepointTime = timeMatch ? parseFloat(timeMatch[1]) : 0;
                    safepointSyncTime = syncMatch ? parseFloat(syncMatch[1]) : 0;
                    
                    // Calculate overhead (simplified - in a real system this would track over time)
                    safepointOverhead = Math.min(100, (safepointTime / 1000) * 100);
                }
            } catch (e) {
                console.error('Error getting safepoint info:', e.message);
            }
            
            return {
                threadCount,
                peakThreadCount,
                safepointTime: safepointTime.toFixed(1),
                safepointSyncTime: safepointSyncTime.toFixed(1),
                safepointOverhead: safepointOverhead.toFixed(1)
            };
            
        } catch (error) {
            console.error('Error getting JVM metrics:', error);
            return { error: error.message };
        }
    }

    // Get class loading metrics
    async getClassLoadingMetrics() {
        try {
            const { execSync } = require('child_process');
            const pid = execSync('pgrep -f "org.neo4j.server.CommunityEntryPoint" || echo ""').toString().trim();
            
            if (!pid) {
                return { error: 'Neo4j process not found' };
            }
            
            // Get detailed class loader statistics
            const jcmdOutput = execSync(`sudo -u neo4j jcmd ${pid} VM.classloader_stats`).toString();
            
            // Extract detailed class loader statistics
            const classLoaderMatches = jcmdOutput.match(/ClassLoader@[0-9a-f]+/g) || [];
            const classLoaderCount = classLoaderMatches.length;
            
            // Extract loaded and unloaded class counts from the summary section
            const loadedMatch = jcmdOutput.match(/Total loaded classes:\s*(\d+)/i);
            const unloadedMatch = jcmdOutput.match(/Total unloaded classes:\s*(\d+)/i);
            
            const loadedClassCount = loadedMatch ? loadedMatch[1] : '0';
            const unloadedClassCount = unloadedMatch ? unloadedMatch[1] : '0';
            
            // Extract additional metrics if available
            const instanceSizeMatch = jcmdOutput.match(/Instance class size:\s*(\d+)/i);
            const instanceSize = instanceSizeMatch ? instanceSizeMatch[1] : '0';
            
            // Get class loading time from jstat
            let classLoadingTime = 0;
            try {
                const jstatOutput = execSync(`sudo -u neo4j jstat -class ${pid} 1 1 | tail -n 1`).toString().trim();
                const fields = jstatOutput.split(/\s+/);
                if (fields.length >= 3) {
                    classLoadingTime = parseFloat(fields[2]) / 1000; // Convert to seconds
                }
            } catch (e) {
                console.error('Error getting class loading time:', e.message);
            }
            
            // Calculate metrics
            const overhead = Math.min(100, (classLoadingTime / 10) * 100); // Scale to 0-100%
            
            return {
                summary: {
                    classLoaderCount: parseInt(classLoaderCount, 10) || 0,
                    loadedClassCount: parseInt(loadedClassCount, 10) || 0,
                    unloadedClassCount: parseInt(unloadedClassCount, 10) || 0,
                    instanceSizeBytes: parseInt(instanceSize, 10) || 0,
                    classLoadingTime: classLoadingTime.toFixed(3),
                    overhead: overhead.toFixed(1)
                },
                raw: jcmdOutput // Include raw output for debugging
            };
            
        } catch (error) {
            console.error('Error getting class loading metrics:', error);
            return { error: error.message };
        }
    }
}

async function handleCompleteNeo4jHealth(req, res) {
    try {
        const parser = new Neo4jHealthDataParser();
        
        // Get all health data in parallel
        const [service, heap, indexes, crashPatterns, classLoading, jvm] = await Promise.all([
            parser.getServiceStatus(),
            parser.getHeapHealth(),
            parser.getIndexHealth(),
            parser.getCrashPatterns(),
            parser.getClassLoadingMetrics(),
            parser.getJvmMetrics()
        ]);

        res.json({
            status: 'success',
            data: {
                service,
                heap,
                indexes,
                crashPatterns,
                classLoading,
                jvm,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Error getting complete Neo4j health data:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to get complete Neo4j health data',
            error: error.message
        });
    }
}

module.exports = {
    handleCompleteNeo4jHealth
};
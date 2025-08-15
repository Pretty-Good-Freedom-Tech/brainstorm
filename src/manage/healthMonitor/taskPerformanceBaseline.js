#!/usr/bin/env node

/**
 * Task Performance Baseline Tracker
 * Analyzes task execution patterns to establish and maintain performance baselines
 * Part of the Brainstorm Health Monitor (BHM) Task Behavior Monitor system
 */

const fs = require('fs');
const path = require('path');

class TaskPerformanceBaseline {
    constructor(options = {}) {
        this.baselineWindowDays = options.baselineWindow || 7;
        this.minSamplesForBaseline = options.minSamples || 5;
        this.outlierThreshold = options.outlierThreshold || 2.5; // Standard deviations
        
        // Paths for structured logging data
        this.logDir = process.env.BRAINSTORM_LOG_DIR || '/var/log/brainstorm';
        this.taskDir = path.join(this.logDir, 'taskQueue');
        this.eventsFile = path.join(this.taskDir, 'events.jsonl');
        this.baselinesFile = path.join(this.taskDir, 'taskBaselines.json');
        this.stateFile = path.join(this.taskDir, 'taskBaselineState.json');
        
        this.baselines = new Map();
        this.taskExecutions = new Map();
    }

    async updateBaselines() {
        console.log('📊 Updating task performance baselines...');
        
        try {
            await this.loadExistingBaselines();
            await this.collectTaskExecutions();
            await this.calculateBaselines();
            await this.detectPerformanceDeviations();
            await this.saveBaselines();
            await this.saveState();
            
            console.log(`✅ Baseline update complete. Tracking ${this.baselines.size} task types.`);
            
        } catch (error) {
            console.error('❌ Error during baseline update:', error.message);
            this.emitErrorEvent('BASELINE_UPDATE_ERROR', error.message);
        }
    }

    async loadExistingBaselines() {
        try {
            if (fs.existsSync(this.baselinesFile)) {
                const data = JSON.parse(fs.readFileSync(this.baselinesFile, 'utf8'));
                this.baselines = new Map(Object.entries(data));
                console.log(`📈 Loaded ${this.baselines.size} existing baselines`);
            }
        } catch (error) {
            console.warn('⚠️ Could not load existing baselines:', error.message);
        }
    }

    async collectTaskExecutions() {
        if (!fs.existsSync(this.eventsFile)) {
            console.warn('⚠️ Events file not found:', this.eventsFile);
            return;
        }

        const cutoffTime = new Date(Date.now() - (this.baselineWindowDays * 24 * 60 * 60 * 1000));
        const events = this.readEventsInWindow(cutoffTime);
        
        // Group events by task execution
        const executions = new Map();
        
        for (const event of events) {
            if (event.eventType === 'TASK_START') {
                const executionKey = `${event.taskName}:${event.target}:${event.timestamp}`;
                executions.set(executionKey, {
                    taskName: event.taskName,
                    target: event.target,
                    startTime: new Date(event.timestamp),
                    metadata: event.metadata || {},
                    phases: []
                });
            } else if (event.eventType === 'TASK_END' || event.eventType === 'TASK_ERROR') {
                // Find matching start event
                const matchingKey = Array.from(executions.keys()).find(key => {
                    const exec = executions.get(key);
                    return exec.taskName === event.taskName && 
                           exec.target === event.target && 
                           !exec.endTime;
                });
                
                if (matchingKey) {
                    const execution = executions.get(matchingKey);
                    execution.endTime = new Date(event.timestamp);
                    execution.duration = execution.endTime - execution.startTime;
                    execution.status = event.eventType === 'TASK_END' ? 'completed' : 'failed';
                    execution.endMetadata = event.metadata || {};
                }
            } else if (event.eventType === 'PROGRESS') {
                // Find matching execution and add phase info
                const matchingKey = Array.from(executions.keys()).find(key => {
                    const exec = executions.get(key);
                    return exec.taskName === event.taskName && 
                           exec.target === event.target && 
                           !exec.endTime;
                });
                
                if (matchingKey) {
                    const execution = executions.get(matchingKey);
                    execution.phases.push({
                        phase: event.metadata?.phase || 'unknown',
                        timestamp: event.timestamp,
                        metadata: event.metadata || {}
                    });
                }
            }
        }

        // Group completed executions by task type
        for (const execution of executions.values()) {
            if (execution.endTime && execution.status === 'completed') {
                const taskType = execution.taskName;
                if (!this.taskExecutions.has(taskType)) {
                    this.taskExecutions.set(taskType, []);
                }
                this.taskExecutions.get(taskType).push(execution);
            }
        }

        console.log(`📋 Collected ${Array.from(this.taskExecutions.values()).flat().length} completed task executions`);
    }

    readEventsInWindow(cutoffTime) {
        const events = [];
        const lines = fs.readFileSync(this.eventsFile, 'utf8').split('\n');
        
        for (const line of lines) {
            if (!line.trim()) continue;
            
            try {
                const event = JSON.parse(line);
                const eventTime = new Date(event.timestamp);
                
                if (eventTime >= cutoffTime && 
                    ['TASK_START', 'TASK_END', 'TASK_ERROR', 'PROGRESS'].includes(event.eventType)) {
                    events.push(event);
                }
            } catch (error) {
                // Skip malformed lines
                continue;
            }
        }
        
        return events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }

    async calculateBaselines() {
        for (const [taskType, executions] of this.taskExecutions) {
            if (executions.length < this.minSamplesForBaseline) {
                console.log(`⚠️ Insufficient samples for ${taskType}: ${executions.length} < ${this.minSamplesForBaseline}`);
                continue;
            }

            // Filter out outliers for more stable baselines
            const durations = executions.map(e => e.duration);
            const filteredDurations = this.removeOutliers(durations);
            
            if (filteredDurations.length < this.minSamplesForBaseline) {
                console.log(`⚠️ Too many outliers in ${taskType}, using all samples`);
                filteredDurations.push(...durations);
            }

            const baseline = this.calculateStatistics(filteredDurations, executions);
            baseline.taskType = taskType;
            baseline.lastUpdated = new Date().toISOString();
            baseline.sampleCount = executions.length;
            baseline.filteredSampleCount = filteredDurations.length;
            
            this.baselines.set(taskType, baseline);
            
            console.log(`📊 Updated baseline for ${taskType}: avg=${Math.round(baseline.averageDuration/1000)}s, samples=${baseline.sampleCount}`);
        }
    }

    removeOutliers(durations) {
        if (durations.length < 3) return durations;
        
        const mean = durations.reduce((sum, d) => sum + d, 0) / durations.length;
        const variance = durations.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / durations.length;
        const stdDev = Math.sqrt(variance);
        
        return durations.filter(d => Math.abs(d - mean) <= this.outlierThreshold * stdDev);
    }

    calculateStatistics(durations, executions) {
        const sortedDurations = [...durations].sort((a, b) => a - b);
        const count = durations.length;
        
        const statistics = {
            averageDuration: durations.reduce((sum, d) => sum + d, 0) / count,
            medianDuration: count % 2 === 0 
                ? (sortedDurations[count/2 - 1] + sortedDurations[count/2]) / 2
                : sortedDurations[Math.floor(count/2)],
            minDuration: Math.min(...durations),
            maxDuration: Math.max(...durations),
            standardDeviation: Math.sqrt(durations.reduce((sum, d) => 
                sum + Math.pow(d - (durations.reduce((s, x) => s + x, 0) / count), 2), 0) / count),
            percentile95: sortedDurations[Math.floor(count * 0.95)],
            percentile99: sortedDurations[Math.floor(count * 0.99)]
        };

        // Calculate phase statistics if available
        const phaseStats = this.calculatePhaseStatistics(executions);
        if (Object.keys(phaseStats).length > 0) {
            statistics.phaseStatistics = phaseStats;
        }

        return statistics;
    }

    calculatePhaseStatistics(executions) {
        const phaseData = new Map();
        
        for (const execution of executions) {
            for (let i = 0; i < execution.phases.length; i++) {
                const phase = execution.phases[i];
                const nextPhase = execution.phases[i + 1];
                
                if (nextPhase) {
                    const phaseDuration = new Date(nextPhase.timestamp) - new Date(phase.timestamp);
                    const phaseName = phase.phase;
                    
                    if (!phaseData.has(phaseName)) {
                        phaseData.set(phaseName, []);
                    }
                    phaseData.get(phaseName).push(phaseDuration);
                }
            }
        }

        const phaseStats = {};
        for (const [phaseName, durations] of phaseData) {
            if (durations.length >= 3) {
                phaseStats[phaseName] = {
                    averageDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
                    medianDuration: durations.sort((a, b) => a - b)[Math.floor(durations.length / 2)],
                    sampleCount: durations.length
                };
            }
        }

        return phaseStats;
    }

    async detectPerformanceDeviations() {
        const recentExecutions = this.getRecentExecutions(24); // Last 24 hours
        
        for (const [taskType, executions] of recentExecutions) {
            const baseline = this.baselines.get(taskType);
            if (!baseline) continue;

            for (const execution of executions) {
                const deviation = this.calculateDeviation(execution.duration, baseline);
                
                if (Math.abs(deviation) > 2.0) { // More than 2 standard deviations
                    this.emitPerformanceAlert(taskType, execution, baseline, deviation);
                }
            }
        }
    }

    getRecentExecutions(hours) {
        const cutoffTime = new Date(Date.now() - (hours * 60 * 60 * 1000));
        const recentExecutions = new Map();
        
        for (const [taskType, executions] of this.taskExecutions) {
            const recent = executions.filter(e => e.endTime >= cutoffTime);
            if (recent.length > 0) {
                recentExecutions.set(taskType, recent);
            }
        }
        
        return recentExecutions;
    }

    calculateDeviation(duration, baseline) {
        if (baseline.standardDeviation === 0) return 0;
        return (duration - baseline.averageDuration) / baseline.standardDeviation;
    }

    emitPerformanceAlert(taskType, execution, baseline, deviation) {
        const severity = Math.abs(deviation) > 3.0 ? 'critical' : 'warning';
        const direction = deviation > 0 ? 'slower' : 'faster';
        
        const alertEvent = {
            timestamp: new Date().toISOString(),
            eventType: 'HEALTH_ALERT',
            taskName: 'taskBehaviorMonitor',
            target: 'performance_baseline',
            scriptName: 'taskPerformanceBaseline.js',
            pid: process.pid,
            metadata: {
                alertType: 'PERFORMANCE_DEVIATION',
                severity: severity,
                message: `Task ${taskType} running ${Math.abs(deviation).toFixed(1)}σ ${direction} than baseline`,
                component: 'taskPerformanceBaseline',
                taskType: taskType,
                target: execution.target,
                details: {
                    actualDurationSeconds: Math.round(execution.duration / 1000),
                    baselineAverageSeconds: Math.round(baseline.averageDuration / 1000),
                    standardDeviations: Math.round(deviation * 10) / 10,
                    direction: direction,
                    executionTime: execution.endTime.toISOString()
                },
                recommendedAction: this.getPerformanceRecommendation(deviation, taskType)
            }
        };

        this.writeEventToFile(alertEvent);
        console.log(`🚨 ${severity.toUpperCase()}: ${alertEvent.metadata.message}`);
    }

    getPerformanceRecommendation(deviation, taskType) {
        if (Math.abs(deviation) > 3.0) {
            return deviation > 0 
                ? `Investigate performance degradation in ${taskType} - check system resources and data size`
                : `Investigate unexpected performance improvement in ${taskType} - verify data integrity`;
        } else {
            return `Monitor ${taskType} performance trends for continued deviations`;
        }
    }

    emitErrorEvent(errorType, message) {
        const errorEvent = {
            timestamp: new Date().toISOString(),
            eventType: 'TASK_ERROR',
            taskName: 'taskBehaviorMonitor',
            target: 'performance_baseline',
            scriptName: 'taskPerformanceBaseline.js',
            pid: process.pid,
            metadata: {
                error_type: errorType,
                error_message: message,
                component: 'taskPerformanceBaseline'
            }
        };

        this.writeEventToFile(errorEvent);
    }

    writeEventToFile(event) {
        try {
            const eventLine = JSON.stringify(event) + '\n';
            fs.appendFileSync(this.eventsFile, eventLine);
        } catch (error) {
            console.error('Failed to write event to file:', error.message);
        }
    }

    async saveBaselines() {
        try {
            const baselinesObj = Object.fromEntries(this.baselines);
            fs.writeFileSync(this.baselinesFile, JSON.stringify(baselinesObj, null, 2));
            console.log(`💾 Saved ${this.baselines.size} baselines to ${this.baselinesFile}`);
        } catch (error) {
            console.error('Failed to save baselines:', error.message);
        }
    }

    async saveState() {
        try {
            const state = {
                lastRun: new Date().toISOString(),
                baselinesCount: this.baselines.size,
                executionsAnalyzed: Array.from(this.taskExecutions.values()).flat().length,
                baselineWindowDays: this.baselineWindowDays,
                taskTypes: Array.from(this.baselines.keys())
            };

            fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
        } catch (error) {
            console.warn('Could not save baseline state:', error.message);
        }
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const options = {};
    
    for (let i = 0; i < args.length; i += 2) {
        const flag = args[i];
        const value = args[i + 1];
        
        switch (flag) {
            case '--baseline-window':
                options.baselineWindow = parseInt(value);
                break;
            case '--min-samples':
                options.minSamples = parseInt(value);
                break;
            case '--outlier-threshold':
                options.outlierThreshold = parseFloat(value);
                break;
        }
    }
    
    const baseline = new TaskPerformanceBaseline(options);
    baseline.updateBaselines().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = TaskPerformanceBaseline;

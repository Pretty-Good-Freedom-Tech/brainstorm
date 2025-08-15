#!/usr/bin/env node

/**
 * Task Anomaly Detector
 * Analyzes structured logging events to detect task execution anomalies
 * Part of the Brainstorm Health Monitor (BHM) Task Behavior Monitor system
 */

const fs = require('fs');
const path = require('path');

class TaskAnomalyDetector {
    constructor(options = {}) {
        this.thresholdMultiplier = options.thresholdMultiplier || 3.0;
        this.stuckTimeoutMinutes = options.stuckTimeout || 60;
        this.checkIntervalMinutes = options.checkInterval || 5;
        
        // Paths for structured logging data
        this.logDir = process.env.BRAINSTORM_LOG_DIR || '/var/log/brainstorm';
        this.taskDir = path.join(this.logDir, 'taskQueue');
        this.eventsFile = path.join(this.taskDir, 'events.jsonl');
        this.stateFile = path.join(this.taskDir, 'taskAnomalyState.json');
        
        this.anomalies = [];
        this.runningTasks = new Map();
        this.taskBaselines = new Map();
    }

    async detectAnomalies() {
        console.log('🔍 Detecting task execution anomalies...');
        
        try {
            await this.loadTaskBaselines();
            await this.analyzeRecentEvents();
            await this.detectStuckTasks();
            await this.detectExcessiveRuntimes();
            await this.detectSilentFailures();
            await this.emitAnomalyAlerts();
            await this.saveState();
            
            console.log(`✅ Anomaly detection complete. Found ${this.anomalies.length} anomalies.`);
            
        } catch (error) {
            console.error('❌ Error during anomaly detection:', error.message);
            this.emitErrorEvent('ANOMALY_DETECTION_ERROR', error.message);
        }
    }

    async loadTaskBaselines() {
        try {
            const baselineFile = path.join(this.taskDir, 'taskBaselines.json');
            if (fs.existsSync(baselineFile)) {
                const data = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
                this.taskBaselines = new Map(Object.entries(data));
            }
        } catch (error) {
            console.warn('⚠️ Could not load task baselines:', error.message);
        }
    }

    async analyzeRecentEvents() {
        if (!fs.existsSync(this.eventsFile)) {
            console.warn('⚠️ Events file not found:', this.eventsFile);
            return;
        }

        const cutoffTime = new Date(Date.now() - (this.checkIntervalMinutes * 2 * 60 * 1000));
        const events = this.readRecentEvents(cutoffTime);
        
        // Track running tasks and their states
        for (const event of events) {
            this.processTaskEvent(event);
        }
    }

    readRecentEvents(cutoffTime) {
        const events = [];
        const lines = fs.readFileSync(this.eventsFile, 'utf8').split('\n');
        
        for (const line of lines) {
            if (!line.trim()) continue;
            
            try {
                const event = JSON.parse(line);
                const eventTime = new Date(event.timestamp);
                
                if (eventTime >= cutoffTime) {
                    events.push(event);
                }
            } catch (error) {
                // Skip malformed lines
                continue;
            }
        }
        
        return events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }

    processTaskEvent(event) {
        const { eventType, taskName, target, metadata } = event;
        const taskKey = `${taskName}:${target}`;
        
        switch (eventType) {
            case 'TASK_START':
                this.runningTasks.set(taskKey, {
                    taskName,
                    target,
                    startTime: new Date(event.timestamp),
                    lastActivity: new Date(event.timestamp),
                    phases: [],
                    metadata: metadata || {}
                });
                break;
                
            case 'PROGRESS':
                if (this.runningTasks.has(taskKey)) {
                    const task = this.runningTasks.get(taskKey);
                    task.lastActivity = new Date(event.timestamp);
                    task.phases.push({
                        phase: metadata?.phase || 'unknown',
                        timestamp: event.timestamp
                    });
                }
                break;
                
            case 'TASK_END':
            case 'TASK_ERROR':
                if (this.runningTasks.has(taskKey)) {
                    const task = this.runningTasks.get(taskKey);
                    task.endTime = new Date(event.timestamp);
                    task.status = eventType === 'TASK_END' ? 'completed' : 'failed';
                    task.duration = task.endTime - task.startTime;
                    
                    // Check for excessive runtime
                    this.checkExcessiveRuntime(task);
                    
                    this.runningTasks.delete(taskKey);
                }
                break;
        }
    }

    async detectStuckTasks() {
        const now = new Date();
        const stuckThreshold = this.stuckTimeoutMinutes * 60 * 1000;
        
        for (const [taskKey, task] of this.runningTasks) {
            const timeSinceStart = now - task.startTime;
            const timeSinceActivity = now - task.lastActivity;
            
            if (timeSinceStart > stuckThreshold) {
                this.anomalies.push({
                    type: 'STUCK_TASK',
                    severity: 'critical',
                    taskName: task.taskName,
                    target: task.target,
                    message: `Task stuck for ${Math.round(timeSinceStart / 60000)} minutes`,
                    details: {
                        startTime: task.startTime.toISOString(),
                        lastActivity: task.lastActivity.toISOString(),
                        timeSinceStartMinutes: Math.round(timeSinceStart / 60000),
                        timeSinceActivityMinutes: Math.round(timeSinceActivity / 60000),
                        phases: task.phases
                    }
                });
            }
        }
    }

    checkExcessiveRuntime(task) {
        const baseline = this.taskBaselines.get(task.taskName);
        if (!baseline || !baseline.averageDuration) return;
        
        const expectedDuration = baseline.averageDuration;
        const actualDuration = task.duration;
        const threshold = expectedDuration * this.thresholdMultiplier;
        
        if (actualDuration > threshold) {
            this.anomalies.push({
                type: 'EXCESSIVE_RUNTIME',
                severity: 'warning',
                taskName: task.taskName,
                target: task.target,
                message: `Task runtime ${Math.round(actualDuration / 1000)}s exceeds baseline by ${this.thresholdMultiplier}x`,
                details: {
                    actualDurationSeconds: Math.round(actualDuration / 1000),
                    expectedDurationSeconds: Math.round(expectedDuration / 1000),
                    thresholdSeconds: Math.round(threshold / 1000),
                    multiplier: Math.round((actualDuration / expectedDuration) * 10) / 10
                }
            });
        }
    }

    async detectExcessiveRuntimes() {
        // Already handled in checkExcessiveRuntime during event processing
    }

    async detectSilentFailures() {
        // Look for tasks that started but haven't had activity in a while
        const now = new Date();
        const silentThreshold = 30 * 60 * 1000; // 30 minutes
        
        for (const [taskKey, task] of this.runningTasks) {
            const timeSinceActivity = now - task.lastActivity;
            
            if (timeSinceActivity > silentThreshold && task.phases.length === 0) {
                this.anomalies.push({
                    type: 'SILENT_FAILURE',
                    severity: 'warning',
                    taskName: task.taskName,
                    target: task.target,
                    message: `Task silent for ${Math.round(timeSinceActivity / 60000)} minutes with no progress`,
                    details: {
                        startTime: task.startTime.toISOString(),
                        lastActivity: task.lastActivity.toISOString(),
                        timeSinceActivityMinutes: Math.round(timeSinceActivity / 60000),
                        phaseCount: task.phases.length
                    }
                });
            }
        }
    }

    async emitAnomalyAlerts() {
        for (const anomaly of this.anomalies) {
            this.emitHealthAlert(anomaly);
        }
    }

    emitHealthAlert(anomaly) {
        const alertEvent = {
            timestamp: new Date().toISOString(),
            eventType: 'HEALTH_ALERT',
            taskName: 'taskBehaviorMonitor',
            target: 'anomaly_detection',
            scriptName: 'taskAnomalyDetector.js',
            pid: process.pid,
            metadata: {
                alertType: anomaly.type,
                severity: anomaly.severity,
                message: anomaly.message,
                component: 'taskAnomalyDetector',
                taskName: anomaly.taskName,
                target: anomaly.target,
                details: anomaly.details,
                recommendedAction: this.getRecommendedAction(anomaly.type)
            }
        };

        this.writeEventToFile(alertEvent);
        console.log(`🚨 ${anomaly.severity.toUpperCase()}: ${anomaly.message}`);
    }

    getRecommendedAction(anomalyType) {
        const actions = {
            'STUCK_TASK': 'Investigate task execution, check for deadlocks or resource constraints',
            'EXCESSIVE_RUNTIME': 'Monitor task performance, check for resource bottlenecks or data size changes',
            'SILENT_FAILURE': 'Check task logs for errors, verify task is making progress'
        };
        
        return actions[anomalyType] || 'Investigate task execution patterns';
    }

    emitErrorEvent(errorType, message) {
        const errorEvent = {
            timestamp: new Date().toISOString(),
            eventType: 'TASK_ERROR',
            taskName: 'taskBehaviorMonitor',
            target: 'anomaly_detection',
            scriptName: 'taskAnomalyDetector.js',
            pid: process.pid,
            metadata: {
                error_type: errorType,
                error_message: message,
                component: 'taskAnomalyDetector'
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

    async saveState() {
        try {
            const state = {
                lastRun: new Date().toISOString(),
                runningTasksCount: this.runningTasks.size,
                anomaliesDetected: this.anomalies.length,
                runningTasks: Array.from(this.runningTasks.entries()).map(([key, task]) => ({
                    key,
                    taskName: task.taskName,
                    target: task.target,
                    startTime: task.startTime.toISOString(),
                    lastActivity: task.lastActivity.toISOString(),
                    phaseCount: task.phases.length
                }))
            };

            fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
        } catch (error) {
            console.warn('Could not save anomaly detector state:', error.message);
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
            case '--threshold-multiplier':
                options.thresholdMultiplier = parseFloat(value);
                break;
            case '--stuck-timeout':
                options.stuckTimeout = parseInt(value);
                break;
            case '--check-interval':
                options.checkInterval = parseInt(value);
                break;
        }
    }
    
    const detector = new TaskAnomalyDetector(options);
    detector.detectAnomalies().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = TaskAnomalyDetector;

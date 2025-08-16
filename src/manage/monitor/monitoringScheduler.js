#!/usr/bin/env node

/**
 * Monitoring Scheduler
 * Tier-based coordination system for Brainstorm Health Monitor components
 */

const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const brainstormConfig = require('../../utils/brainstormConfig');

// Load task registry for script paths
const TASK_REGISTRY_PATH = path.join(__dirname, '../taskQueue/taskRegistry.json');
let taskRegistry = {};
try {
    taskRegistry = JSON.parse(fs.readFileSync(TASK_REGISTRY_PATH, 'utf8'));
} catch (error) {
    console.error(`Failed to load task registry: ${error.message}`);
    process.exit(1);
}

// Configuration
const BRAINSTORM_LOG_DIR = process.env.BRAINSTORM_LOG_DIR || '/var/log/brainstorm';
const BRAINSTORM_DATA_DIR = process.env.BRAINSTORM_DATA_DIR || '/var/lib/brainstorm';
const SCRIPT_NAME = 'monitoringScheduler';
// Removed TARGET argument - not needed for single-instance monitoring

// Ensure log directories exist
const LOG_FILE = path.join(BRAINSTORM_LOG_DIR, `${SCRIPT_NAME}.log`);
const EVENTS_LOG = path.join(BRAINSTORM_LOG_DIR, 'taskQueue', 'events.jsonl');
const STATE_FILE = path.join(BRAINSTORM_LOG_DIR, 'taskQueue', 'monitoringState.json');

[path.dirname(LOG_FILE), path.dirname(EVENTS_LOG)].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Function to get script path from task registry
function getScriptPath(taskName) {
    const task = taskRegistry.tasks[taskName];
    if (!task || !task.script) {
        throw new Error(`Task '${taskName}' not found in registry or missing script path`);
    }
    
    // Resolve environment variables in the script path
    let scriptPath = task.script;
    
    // Replace common environment variables
    const envVars = {
        '$BRAINSTORM_MODULE_SRC_DIR': process.env.BRAINSTORM_MODULE_SRC_DIR || path.join(process.cwd(), 'src'),
        '$BRAINSTORM_MODULE_BASE_DIR': process.env.BRAINSTORM_MODULE_BASE_DIR || process.cwd()
    };
    
    for (const [envVar, value] of Object.entries(envVars)) {
        scriptPath = scriptPath.replace(envVar, value);
    }
    
    return scriptPath;
}

// Monitoring tiers configuration using task registry
const MONITORING_TIERS = {
    // Tier 1: Critical Infrastructure (every 2-5 minutes)
    tier1: {
        interval: 2 * 60 * 1000, // 2 minutes
        priority: 'critical',
        tasks: [
            {
                name: 'neo4jStabilityMonitor',
                script: getScriptPath('neo4jStabilityMonitor'),
                timeout: 15 * 60 * 1000, // 15 minutes
                description: 'Neo4j crash pattern detection and stability monitoring'
            },
            {
                name: 'systemResourceMonitor',
                script: getScriptPath('systemResourceMonitor'),
                timeout: 5 * 60 * 1000, // 5 minutes
                description: 'System resource monitoring (CPU, memory, disk)'
            }
        ]
    },
    
    // Tier 2: Application Health (every 5-10 minutes)
    tier2: {
        interval: 5 * 60 * 1000, // 5 minutes
        priority: 'high',
        tasks: [
            {
                name: 'applicationHealthMonitor',
                script: getScriptPath('applicationHealthMonitor'),
                timeout: 10 * 60 * 1000, // 10 minutes
                description: 'Brainstorm application component health monitoring'
            },
            {
                name: 'databasePerformanceMonitor',
                script: getScriptPath('databasePerformanceMonitor'),
                timeout: 10 * 60 * 1000, // 10 minutes
                description: 'Neo4j database performance monitoring'
            }
        ]
    },
    
    // Tier 3: Network and External Dependencies (every 10-15 minutes)
    tier3: {
        interval: 10 * 60 * 1000, // 10 minutes
        priority: 'medium',
        tasks: [
            {
                name: 'networkConnectivityMonitor',
                script: getScriptPath('networkConnectivityMonitor'),
                timeout: 10 * 60 * 1000, // 10 minutes
                description: 'Network connectivity and external service monitoring'
            }
        ]
    },
    
    // Tier 4: Task Watchdog (every 30 seconds - most frequent)
    tier4: {
        interval: 30 * 1000, // 30 seconds
        priority: 'critical',
        tasks: [
            {
                name: 'taskWatchdog',
                script: getScriptPath('taskWatchdog'),
                timeout: 10 * 60 * 1000, // 10 minutes
                description: 'Task monitoring and stuck task detection'
            }
        ]
    }
};

// State management
class MonitoringState {
    constructor() {
        this.state = this.loadState();
        this.runningTasks = new Map();
        this.tierTimers = new Map();
    }

    loadState() {
        try {
            if (fs.existsSync(STATE_FILE)) {
                const data = fs.readFileSync(STATE_FILE, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Error loading monitoring state:', error);
        }
        
        return {
            lastRun: {},
            taskHistory: [],
            failureCount: {},
            startTime: new Date().toISOString()
        };
    }

    saveState() {
        try {
            fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
        } catch (error) {
            console.error('Error saving monitoring state:', error);
        }
    }

    updateTaskHistory(taskName, status, duration, error = null) {
        const entry = {
            taskName,
            status,
            duration,
            timestamp: new Date().toISOString(),
            error
        };

        this.state.taskHistory.push(entry);
        
        // Keep only last 100 entries
        if (this.state.taskHistory.length > 100) {
            this.state.taskHistory = this.state.taskHistory.slice(-100);
        }

        this.state.lastRun[taskName] = entry.timestamp;
        
        if (status === 'failed') {
            this.state.failureCount[taskName] = (this.state.failureCount[taskName] || 0) + 1;
        } else if (status === 'completed') {
            this.state.failureCount[taskName] = 0;
        }

        this.saveState();
    }
}

// Logging functions
function logEvent(eventType, message, metadata = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        taskName: SCRIPT_NAME,
        target: 'system',
        eventType,
        message,
        metadata
    };

    // Write to events log
    try {
        fs.appendFileSync(EVENTS_LOG, JSON.stringify(logEntry) + '\n');
    } catch (error) {
        console.error('Error writing to events log:', error);
    }

    // Write to regular log
    try {
        const logMessage = `[${timestamp}] ${SCRIPT_NAME}: ${eventType} - ${message}\n`;
        fs.appendFileSync(LOG_FILE, logMessage);
    } catch (error) {
        console.error('Error writing to log file:', error);
    }

    console.log(`${eventType}: ${message}`);
}

function sendHealthAlert(alertType, severity, message, additionalData = {}) {
    const metadata = {
        alertType,
        severity,
        component: 'monitoring_scheduler',
        message,
        recommendedAction: 'Review monitoring scheduler configuration and task execution',
        additionalData
    };

    logEvent('HEALTH_ALERT', message, metadata);
}

// Task execution
class TaskExecutor {
    constructor(monitoringState) {
        this.state = monitoringState;
    }

    async executeTask(task, tier) {
        const taskKey = task.name;
        const startTime = Date.now();

        // Check if task is already running
        if (this.state.runningTasks.has(taskKey)) {
            logEvent('TASK_SKIP', `Task already running: ${task.name}`, { task: task.name, tier });
            return;
        }

        // Check failure count
        const failureCount = this.state.state.failureCount[task.name] || 0;
        if (failureCount >= 5) {
            logEvent('TASK_SKIP', `Task skipped due to repeated failures: ${task.name}`, { 
                task: task.name, 
                failureCount,
                tier 
            });
            return;
        }

        logEvent('TASK_START', `Starting monitoring task: ${task.name}`, { 
            task: task.name, 
            tier,
            timeout: task.timeout 
        });

        this.state.runningTasks.set(taskKey, {
            startTime,
            task,
            tier
        });

        try {
            const result = await this.runScript(task);
            const duration = Date.now() - startTime;

            this.state.runningTasks.delete(taskKey);
            this.state.updateTaskHistory(task.name, 'completed', duration);

            logEvent('TASK_END', `Completed monitoring task: ${task.name}`, {
                task: task.name,
                tier,
                duration,
                exitCode: result.exitCode
            });

        } catch (error) {
            const duration = Date.now() - startTime;
            
            this.state.runningTasks.delete(taskKey);
            this.state.updateTaskHistory(task.name, 'failed', duration, error.message);

            logEvent('TASK_ERROR', `Failed monitoring task: ${task.name}`, {
                task: task.name,
                tier,
                duration,
                error: error.message
            });

            // Send health alert for task failures
            sendHealthAlert('MONITORING_TASK_FAILED', 'warning', 
                `Monitoring task failed: ${task.name}`, {
                    task: task.name,
                    tier,
                    error: error.message,
                    failureCount: this.state.state.failureCount[task.name] || 0
                });
        }
    }

    runScript(task) {
        return new Promise((resolve, reject) => {
            // Use launchChildTask.sh for consistent execution environment like runTask.js
            const launchChildTaskPath = brainstormConfig.expandScriptPath('$BRAINSTORM_MODULE_MANAGE_DIR/taskQueue/launchChildTask.sh');
            
            // Log the resolved path for debugging
            logEvent('SCRIPT_EXECUTION', `Using launchChildTask for: ${task.name}`, {
                scriptPath: task.script,
                launchChildTaskPath,
                workingDirectory: process.cwd(),
                launchChildTaskExists: fs.existsSync(launchChildTaskPath),
                taskName: task.name
            });
            
            if (!fs.existsSync(launchChildTaskPath)) {
                const error = `launchChildTask.sh not found: ${launchChildTaskPath}`;
                logEvent('SCRIPT_ERROR', error, { launchChildTaskPath, taskName: task.name });
                reject(new Error(error));
                return;
            }

            // Build options JSON for launchChildTask
            const optionsJson = JSON.stringify({
                completion: {
                    failure: {
                        timeout: {
                            duration: task.timeout,
                            forceKill: false
                        }
                    }
                }
            });
            
            // Monitoring tasks don't need additional arguments
            const childArgs = '';
            
            logEvent('SCRIPT_EXECUTION', `Launching monitoring task via launchChildTask`, {
                taskName: task.name,
                options: optionsJson,
                childArgs
            });

            const child = spawn('bash', [launchChildTaskPath, task.name, 'monitoring-scheduler', optionsJson, childArgs], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: {
                    ...process.env,
                    BRAINSTORM_STRUCTURED_LOGGING: 'true'
                }
            });

            let stdout = '';
            let stderr = '';
            let launchResult = null;
            
            let jsonBuffer = '';
            let collectingJson = false;

            child.stdout.on('data', (data) => {
                const output = data.toString();
                stdout += output;
                
                // Parse structured output from launchChildTask
                const lines = output.split('\n');
                for (const line of lines) {
                    if (line.startsWith('LAUNCHCHILDTASK_RESULT:')) {
                        // Start collecting JSON
                        collectingJson = true;
                        const jsonStart = line.substring('LAUNCHCHILDTASK_RESULT:'.length).trim();
                        jsonBuffer = jsonStart;
                        
                        // Try to parse immediately in case it's a single line
                        if (jsonStart.startsWith('{') && jsonStart.endsWith('}')) {
                            try {
                                launchResult = JSON.parse(jsonStart);
                                collectingJson = false;
                                jsonBuffer = '';
                            } catch (error) {
                                // Continue collecting multi-line JSON
                            }
                        }
                    } else if (collectingJson) {
                        // Continue collecting JSON lines
                        jsonBuffer += '\n' + line;
                        
                        // Try to parse when we have what looks like complete JSON
                        if (line.trim() === '}' && jsonBuffer.includes('{')) {
                            try {
                                launchResult = JSON.parse(jsonBuffer);
                                collectingJson = false;
                                jsonBuffer = '';
                            } catch (error) {
                                // Continue collecting
                            }
                        }
                    }
                }
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            // Set timeout
            const timeout = setTimeout(() => {
                child.kill('SIGTERM');
                reject(new Error(`Task timeout after ${task.timeout}ms`));
            }, task.timeout);

            child.on('close', (code) => {
                clearTimeout(timeout);
                
                // Log launch result for debugging
                if (launchResult) {
                    logEvent('SCRIPT_EXECUTION', `Launch result received`, {
                        taskName: task.name,
                        launchAction: launchResult.launch_action,
                        exitCode: code
                    });
                }
                
                if (code === 0) {
                    resolve({ 
                        exitCode: code, 
                        stdout, 
                        stderr,
                        launchResult
                    });
                } else {
                    reject(new Error(`Script exited with code ${code}: ${stderr}`));
                }
            });

            child.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }
}

// Main scheduler class
class MonitoringScheduler {
    constructor() {
        this.state = new MonitoringState();
        this.executor = new TaskExecutor(this.state);
        this.isRunning = false;
    }

    start() {
        if (this.isRunning) {
            logEvent('SCHEDULER_WARNING', 'Monitoring scheduler already running');
            return;
        }

        this.isRunning = true;
        logEvent('SCHEDULER_START', 'Starting monitoring scheduler', {
            tiers: Object.keys(MONITORING_TIERS).length,
            totalTasks: Object.values(MONITORING_TIERS).reduce((sum, tier) => sum + tier.tasks.length, 0)
        });

        // Start each tier
        Object.entries(MONITORING_TIERS).forEach(([tierName, tierConfig]) => {
            this.startTier(tierName, tierConfig);
        });

        // Schedule periodic state saves
        setInterval(() => {
            this.state.saveState();
        }, 60 * 1000); // Save every minute

        // Schedule health check
        setInterval(() => {
            this.performHealthCheck();
        }, 5 * 60 * 1000); // Health check every 5 minutes
    }

    startTier(tierName, tierConfig) {
        logEvent('TIER_START', `Starting monitoring tier: ${tierName}`, {
            tier: tierName,
            interval: tierConfig.interval,
            taskCount: tierConfig.tasks.length
        });

        const executeAllTasks = async () => {
            for (const task of tierConfig.tasks) {
                // Execute tasks sequentially within a tier to avoid resource conflicts
                await this.executor.executeTask(task, tierName);
            }
        };

        // Execute immediately
        executeAllTasks();

        // Set up recurring execution
        const timer = setInterval(executeAllTasks, tierConfig.interval);
        this.state.tierTimers.set(tierName, timer);
    }

    performHealthCheck() {
        const runningTaskCount = this.state.runningTasks.size;
        const recentFailures = Object.values(this.state.state.failureCount)
            .reduce((sum, count) => sum + count, 0);

        logEvent('HEALTH_CHECK', 'Monitoring scheduler health check', {
            runningTasks: runningTaskCount,
            recentFailures,
            uptime: Date.now() - new Date(this.state.state.startTime).getTime()
        });

        // Check for stuck tasks
        const stuckTasks = [];
        const currentTime = Date.now();
        
        this.state.runningTasks.forEach((taskInfo, taskKey) => {
            const runningTime = currentTime - taskInfo.startTime;
            if (runningTime > taskInfo.task.timeout) {
                stuckTasks.push({
                    taskKey,
                    runningTime,
                    timeout: taskInfo.task.timeout
                });
            }
        });

        if (stuckTasks.length > 0) {
            sendHealthAlert('MONITORING_STUCK_TASKS', 'warning', 
                `Detected ${stuckTasks.length} stuck monitoring tasks`, {
                    stuckTasks
                });
        }

        if (recentFailures > 10) {
            sendHealthAlert('MONITORING_HIGH_FAILURES', 'critical', 
                `High failure count in monitoring tasks: ${recentFailures}`, {
                    recentFailures,
                    failureBreakdown: this.state.state.failureCount
                });
        }
    }

    stop() {
        if (!this.isRunning) {
            return;
        }

        logEvent('SCHEDULER_STOP', 'Stopping monitoring scheduler');
        
        this.isRunning = false;
        
        // Clear all timers
        this.state.tierTimers.forEach((timer, tierName) => {
            clearInterval(timer);
            logEvent('TIER_STOP', `Stopped monitoring tier: ${tierName}`);
        });
        
        this.state.tierTimers.clear();
        this.state.saveState();
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            runningTasks: Array.from(this.state.runningTasks.entries()).map(([key, info]) => ({
                taskKey: key,
                taskName: info.task.name,
                tier: info.tier,
                runningTime: Date.now() - info.startTime
            })),
            recentHistory: this.state.state.taskHistory.slice(-10),
            failureCounts: this.state.state.failureCount,
            uptime: Date.now() - new Date(this.state.state.startTime).getTime()
        };
    }
}

// Signal handling
function setupSignalHandlers(scheduler) {
    process.on('SIGINT', () => {
        logEvent('SCHEDULER_SHUTDOWN', 'Received SIGINT, shutting down gracefully');
        scheduler.stop();
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        logEvent('SCHEDULER_SHUTDOWN', 'Received SIGTERM, shutting down gracefully');
        scheduler.stop();
        process.exit(0);
    });

    process.on('uncaughtException', (error) => {
        logEvent('SCHEDULER_ERROR', 'Uncaught exception in monitoring scheduler', {
            error: error.message,
            stack: error.stack
        });
        scheduler.stop();
        process.exit(1);
    });
}

// Main execution
function main() {
    if (process.argv.length < 3) {
        console.error('Usage: node monitoringScheduler.js <target>');
        console.error('Example: node monitoringScheduler.js owner');
        process.exit(1);
    }

    const scheduler = new MonitoringScheduler();
    setupSignalHandlers(scheduler);
    
    scheduler.start();

    // Keep the process running
    process.stdin.resume();
}

// Export for testing
if (require.main === module) {
    main();
} else {
    module.exports = { MonitoringScheduler, MONITORING_TIERS };
}

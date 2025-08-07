#!/usr/bin/env node

/**
 * Task Scheduler - Evaluates system state and queues tasks by priority
 * 
 * This component:
 * 1. Gathers current system state (customers, task completion times, etc.)
 * 2. Determines which tasks need to be run
 * 3. Assigns priorities based on urgency and importance
 * 4. Updates the priority queue with new tasks
 */

const fs = require('fs');
const path = require('path');

class TaskScheduler {
    constructor() {
        this.configFile = '/etc/brainstorm.conf';
        this.config = this.loadConfig();
        this.stateFile = path.join(this.config.BRAINSTORM_LOG_DIR, 'taskQueue', 'systemState.json');
        this.queueFile = path.join(this.config.BRAINSTORM_LOG_DIR, 'taskQueue', 'priorityQueue.json');
        this.logFile = path.join(this.config.BRAINSTORM_LOG_DIR, 'taskQueue', 'scheduler.log');
        
        // Ensure directories exist
        this.ensureDirectories();
    }

    loadConfig() {
        // Parse brainstorm.conf file
        const configContent = fs.readFileSync(this.configFile, 'utf8');
        const config = {};
        
        configContent.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                const [key, value] = trimmed.split('=', 2);
                config[key.trim()] = value.trim().replace(/['"]/g, '');
            }
        });
        
        return config;
    }

    ensureDirectories() {
        const taskQueueDir = path.dirname(this.stateFile);
        if (!fs.existsSync(taskQueueDir)) {
            fs.mkdirSync(taskQueueDir, { recursive: true });
        }
    }

    log(message) {
        const timestamp = new Date().toISOString();
        const logMessage = `${timestamp}: ${message}\n`;
        fs.appendFileSync(this.logFile, logMessage);
        console.log(`[TaskScheduler] ${message}`);
    }

    async gatherSystemState() {
        this.log('Gathering system state...');
        
        const state = {
            timestamp: new Date().toISOString(),
            customers: await this.getCustomerStates(),
            taskCompletionTimes: await this.getTaskCompletionTimes(),
            failedTasks: await this.getFailedTasks(),
            systemHealth: await this.getSystemHealth()
        };

        // Save state to file
        fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
        
        return state;
    }

    async getCustomerStates() {
        // TODO: Implement customer state gathering
        // This should check:
        // - List of all customers from customers.json
        // - When each customer's scores were last calculated
        // - Which customers are new (never processed)
        // - Which customers have stale data
        
        this.log('TODO: Implement customer state gathering');
        return {
            total: 0,
            newCustomers: [],
            staleCustomers: [],
            upToDateCustomers: []
        };
    }

    async getTaskCompletionTimes() {
        // TODO: Parse log files to determine when tasks last completed
        // This should check logs for:
        // - processCustomer completions
        // - syncWoT completions  
        // - calculatePersonalizedGrapeRank completions
        // - etc.
        
        this.log('TODO: Implement task completion time parsing');
        return {};
    }

    async getFailedTasks() {
        // TODO: Detect failed or stalled tasks
        // Check for:
        // - Tasks that started but never finished
        // - Tasks with error messages in logs
        // - Tasks that exceeded expected runtime
        
        this.log('TODO: Implement failed task detection');
        return [];
    }

    async getSystemHealth() {
        // TODO: Check system health indicators
        // - Neo4j connectivity
        // - Disk space
        // - Memory usage
        // - strfry status
        
        this.log('TODO: Implement system health checks');
        return {
            neo4j: 'unknown',
            diskSpace: 'unknown',
            memory: 'unknown',
            strfry: 'unknown'
        };
    }

    calculateTaskPriorities(systemState) {
        this.log('Calculating task priorities...');
        
        const tasks = [];
        
        // TODO: Implement priority calculation logic
        // High Priority (1-100):
        // - New customers with no scores (priority 90-100)
        // - Failed/stalled tasks (priority 80-90)
        // - Critical system maintenance (priority 70-80)
        
        // Medium Priority (101-500):
        // - Customer scores older than 24 hours (priority 200-300)
        // - Routine data synchronization (priority 300-400)
        
        // Low Priority (501+):
        // - Full system maintenance (priority 600)
        // - Optimization tasks (priority 700)
        // - Cleanup operations (priority 800)
        
        this.log('TODO: Implement task priority calculation');
        
        return tasks;
    }

    updatePriorityQueue(tasks) {
        this.log(`Updating priority queue with ${tasks.length} tasks...`);
        
        // Load existing queue
        let queue = [];
        if (fs.existsSync(this.queueFile)) {
            try {
                queue = JSON.parse(fs.readFileSync(this.queueFile, 'utf8'));
            } catch (error) {
                this.log(`Error loading existing queue: ${error.message}`);
                queue = [];
            }
        }

        // Add new tasks and sort by priority
        queue.push(...tasks);
        queue.sort((a, b) => a.priority - b.priority);

        // Remove duplicates (same task type + target)
        const uniqueQueue = [];
        const seen = new Set();
        
        for (const task of queue) {
            const key = `${task.type}:${task.target || 'global'}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueQueue.push(task);
            }
        }

        // Save updated queue
        fs.writeFileSync(this.queueFile, JSON.stringify(uniqueQueue, null, 2));
        
        this.log(`Priority queue updated: ${uniqueQueue.length} unique tasks`);
    }

    async run() {
        try {
            this.log('Starting task scheduler run...');
            
            // Gather current system state
            const systemState = await this.gatherSystemState();
            
            // Calculate what tasks need to be run
            const tasks = this.calculateTaskPriorities(systemState);
            
            // Update the priority queue
            this.updatePriorityQueue(tasks);
            
            this.log('Task scheduler run completed successfully');
            
        } catch (error) {
            this.log(`Error in task scheduler: ${error.message}`);
            process.exit(1);
        }
    }
}

// Run if called directly
if (require.main === module) {
    const scheduler = new TaskScheduler();
    scheduler.run();
}

module.exports = TaskScheduler;

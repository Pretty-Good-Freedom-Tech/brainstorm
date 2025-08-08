#!/usr/bin/env node

/**
 * System State Gatherer - Independent component to collect all Brainstorm instance state
 * 
 * This component provides comprehensive visibility into:
 * 1. Customer states and processing status
 * 2. Task completion times and history
 * 3. Failed or stalled tasks
 * 4. System health indicators
 * 5. Resource usage and performance metrics
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class SystemStateGatherer {
    constructor() {
        this.configFile = '/etc/brainstorm.conf';
        this.config = this.loadConfig();
        this.stateFile = path.join(this.config.BRAINSTORM_LOG_DIR, 'taskQueue', 'fullSystemState.json');
        this.logFile = path.join(this.config.BRAINSTORM_LOG_DIR, 'taskQueue', 'stateGatherer.log');
        
        // Ensure directories exist
        this.ensureDirectories();
    }

    loadConfig() {
        const configContent = fs.readFileSync(this.configFile, 'utf8');
        const config = {};
        
        configContent.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                const [key, value] = trimmed.split('=', 2);
                config[key.trim()] = value.trim().replace(/['"]/g, '');
            }
        });
        
        // Override with environment variables if they exist (for test environments)
        Object.keys(process.env).forEach(key => {
            if (key.startsWith('BRAINSTORM_')) {
                config[key] = process.env[key];
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
        console.log(`[StateGatherer] ${message}`);
    }

    async gatherCustomerData() {
        this.log('Gathering customer data...');
        
        try {
            const customersFile = '/var/lib/brainstorm/customers/customers.json';
            let customers = [];
            
            if (fs.existsSync(customersFile)) {
                try {
                    const rawData = fs.readFileSync(customersFile, 'utf8');
                    const parsedData = JSON.parse(rawData);
                    
                    // Ensure customers is an array
                    if (Array.isArray(parsedData)) {
                        customers = parsedData;
                    } else if (parsedData && typeof parsedData === 'object' && parsedData.customers) {
                        // Handle case where data is wrapped in an object
                        if (Array.isArray(parsedData.customers)) {
                            // customers is already an array
                            customers = parsedData.customers;
                        } else if (typeof parsedData.customers === 'object') {
                            // customers is an object with named keys, convert to array
                            customers = Object.values(parsedData.customers);
                            this.log(`Info: Converted customers object to array (${customers.length} customers)`);
                        } else {
                            this.log(`Warning: customers.json customers property is not an object or array: ${typeof parsedData.customers}`);
                            customers = [];
                        }
                    } else {
                        this.log(`Warning: customers.json contains non-array data: ${typeof parsedData}`);
                        customers = [];
                    }
                } catch (parseError) {
                    this.log(`Warning: Failed to parse customers.json: ${parseError.message}`);
                    customers = [];
                }
            } else {
                this.log('Info: customers.json not found, using empty customer list');
            }
            
            const customerStates = [];
            
            // Ensure customers is iterable before attempting to iterate
            if (Array.isArray(customers)) {
                for (const customer of customers) {
                    const customerState = {
                        pubkey: customer.pubkey,
                        name: customer.name,
                        active: customer.active,
                        signupDate: customer.signupDate,
                        lastProcessed: await this.getCustomerLastProcessed(customer.pubkey),
                        scoreStatus: await this.getCustomerScoreStatus(customer.pubkey),
                        processingErrors: await this.getCustomerProcessingErrors(customer.pubkey)
                    };
                    
                    customerStates.push(customerState);
                }
            }
            
            return {
                totalCustomers: customers.length,
                activeCustomers: customers.filter(c => c.active).length,
                customers: customerStates
            };
            
        } catch (error) {
            this.log(`Error gathering customer data: ${error.message}`);
            return { error: error.message };
        }
    }

    async getCustomerLastProcessed(pubkey) {
        try {
            // Try structured events first (Phase 2: Prefer structured data)
            const structuredEvents = this.loadStructuredEvents();
            const customerEvents = structuredEvents.filter(event => 
                event.taskName === 'processCustomer' && 
                event.target === pubkey &&
                event.eventType === 'TASK_COMPLETE'
            );
            
            if (customerEvents.length > 0) {
                // Return most recent completion from structured events
                const latest = customerEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
                return {
                    timestamp: latest.timestamp,
                    source: 'structured_events',
                    duration: latest.metadata?.durationSeconds || null
                };
            }
            
            // Fallback to legacy log parsing (defensive parsing)
            return await this.parseCustomerLogForCompletion(pubkey);
            
        } catch (error) {
            this.log(`Error getting last processed time for customer ${pubkey}: ${error.message}`);
            return null;
        }
    }

    async getCustomerScoreStatus(pubkey) {
        // TODO: Check if customer has current scores in Neo4j or files
        // This should verify:
        // - PersonalizedPageRank scores exist and are recent
        // - PersonalizedGrapeRank scores exist and are recent
        // - Hops calculations are complete
        this.log(`TODO: Get score status for customer ${pubkey}`);
        return {
            personalizedPageRank: 'unknown',
            personalizedGrapeRank: 'unknown',
            hops: 'unknown'
        };
    }

    async getCustomerProcessingErrors(pubkey) {
        // TODO: Parse logs for errors related to this customer
        this.log(`TODO: Get processing errors for customer ${pubkey}`);
        return [];
    }

    async gatherTaskHistory() {
        this.log('Gathering task history...');
        
        try {
            const taskHistory = {
                processAllTasks: await this.parseProcessAllTasksLog(),
                syncWoT: await this.parseSyncWoTLog(),
                customerProcessing: await this.parseCustomerProcessingLogs(),
                grapeRank: await this.parseGrapeRankLogs(),
                pageRank: await this.parsePageRankLogs()
            };
            
            return taskHistory;
            
        } catch (error) {
            this.log(`Error gathering task history: ${error.message}`);
            return { error: error.message };
        }
    }

    async parseProcessAllTasksLog() {
        try {
            // Try structured events first
            const structuredEvents = this.loadStructuredEvents();
            const processAllTasksEvents = structuredEvents.filter(event => 
                event.taskName === 'processAllTasks'
            );
            
            if (processAllTasksEvents.length > 0) {
                const latest = processAllTasksEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
                return {
                    status: 'structured_data',
                    lastRun: latest.timestamp,
                    eventType: latest.eventType,
                    duration: latest.metadata?.durationSeconds || null
                };
            }
            
            // Fallback to legacy log parsing
            const logFile = path.join(this.config.BRAINSTORM_LOG_DIR, 'processAllTasks.log');
            
            if (!fs.existsSync(logFile)) {
                return { status: 'no_log_file' };
            }
            
            return await this.parseProcessAllTasksLogLegacy(logFile);
            
        } catch (error) {
            this.log(`Error parsing processAllTasks data: ${error.message}`);
            return { status: 'error', message: error.message };
        }
    }

    async parseSyncWoTLog() {
        // TODO: Parse syncWoT logs
        this.log('TODO: Parse syncWoT logs');
        return { status: 'not_implemented' };
    }

    async parseCustomerProcessingLogs() {
        // TODO: Parse customer processing logs
        this.log('TODO: Parse customer processing logs');
        return { status: 'not_implemented' };
    }

    async parseGrapeRankLogs() {
        // TODO: Parse GrapeRank calculation logs
        this.log('TODO: Parse GrapeRank logs');
        return { status: 'not_implemented' };
    }

    async parsePageRankLogs() {
        // TODO: Parse PageRank calculation logs
        this.log('TODO: Parse PageRank logs');
        return { status: 'not_implemented' };
    }

    async gatherSystemHealth() {
        this.log('Gathering system health...');
        
        try {
            const health = {
                timestamp: new Date().toISOString(),
                neo4j: await this.checkNeo4jHealth(),
                strfry: await this.checkStrfryHealth(),
                diskSpace: await this.checkDiskSpace(),
                memory: await this.checkMemoryUsage(),
                processes: await this.checkBrainstormProcesses()
            };
            
            return health;
            
        } catch (error) {
            this.log(`Error gathering system health: ${error.message}`);
            return { error: error.message };
        }
    }

    async checkNeo4jHealth() {
        try {
            // TODO: Check Neo4j connectivity and status
            // Could use cypher-shell or HTTP API
            this.log('TODO: Check Neo4j health');
            return { status: 'not_implemented' };
        } catch (error) {
            return { status: 'error', message: error.message };
        }
    }

    async checkStrfryHealth() {
        try {
            // TODO: Check strfry process and database status
            this.log('TODO: Check strfry health');
            return { status: 'not_implemented' };
        } catch (error) {
            return { status: 'error', message: error.message };
        }
    }

    async checkDiskSpace() {
        try {
            const output = execSync('df -h /', { encoding: 'utf8' });
            const lines = output.trim().split('\n');
            if (lines.length > 1) {
                const parts = lines[1].split(/\s+/);
                return {
                    filesystem: parts[0],
                    size: parts[1],
                    used: parts[2],
                    available: parts[3],
                    usePercent: parts[4],
                    mountPoint: parts[5]
                };
            }
            return { status: 'unknown' };
        } catch (error) {
            return { status: 'error', message: error.message };
        }
    }

    async checkMemoryUsage() {
        try {
            const output = execSync('free -h', { encoding: 'utf8' });
            const lines = output.trim().split('\n');
            if (lines.length > 1) {
                const memLine = lines[1].split(/\s+/);
                return {
                    total: memLine[1],
                    used: memLine[2],
                    free: memLine[3],
                    shared: memLine[4],
                    buffCache: memLine[5],
                    available: memLine[6]
                };
            }
            return { status: 'unknown' };
        } catch (error) {
            return { status: 'error', message: error.message };
        }
    }

    async checkBrainstormProcesses() {
        try {
            // Check for running Brainstorm-related processes
            const output = execSync('ps aux | grep -E "(brainstorm|neo4j|strfry)" | grep -v grep', { encoding: 'utf8' });
            const processes = output.trim().split('\n').filter(line => line.length > 0);
            
            return {
                count: processes.length,
                processes: processes.map(line => {
                    const parts = line.split(/\s+/);
                    return {
                        user: parts[0],
                        pid: parts[1],
                        cpu: parts[2],
                        mem: parts[3],
                        command: parts.slice(10).join(' ')
                    };
                })
            };
        } catch (error) {
            return { status: 'error', message: error.message };
        }
    }

    async gatherFailedTasks() {
        this.log('Gathering failed tasks...');
        
        try {
            // TODO: Detect failed or stalled tasks by analyzing logs
            // Look for:
            // - Tasks that started but never finished
            // - Error messages in logs
            // - Tasks that exceeded expected runtime
            // - Processes that are stuck or zombie
            
            this.log('TODO: Implement failed task detection');
            return [];
            
        } catch (error) {
            this.log(`Error gathering failed tasks: ${error.message}`);
            return { error: error.message };
        }
    }

    async gatherFullState() {
        this.log('Starting full system state gathering...');
        
        const fullState = {
            timestamp: new Date().toISOString(),
            customers: await this.gatherCustomerData(),
            taskHistory: await this.gatherTaskHistory(),
            systemHealth: await this.gatherSystemHealth(),
            failedTasks: await this.gatherFailedTasks(),
            priorityQueue: this.loadPriorityQueue(),
            taskStatus: this.loadTaskStatus()
        };
        
        // Save full state to file
        fs.writeFileSync(this.stateFile, JSON.stringify(fullState, null, 2));
        
        this.log('Full system state gathering completed');
        return fullState;
    }

    loadPriorityQueue() {
        const queueFile = path.join(this.config.BRAINSTORM_LOG_DIR, 'taskQueue', 'priorityQueue.json');
        
        if (fs.existsSync(queueFile)) {
            try {
                return JSON.parse(fs.readFileSync(queueFile, 'utf8'));
            } catch (error) {
                this.log(`Error loading priority queue: ${error.message}`);
                return [];
            }
        }
        
        return [];
    }

    loadStructuredEvents() {
        const eventsFile = path.join(this.config.BRAINSTORM_LOG_DIR, 'taskQueue', 'events.jsonl');
        
        if (fs.existsSync(eventsFile)) {
            try {
                const content = fs.readFileSync(eventsFile, 'utf8');
                return content.trim().split('\n').map(line => {
                    try {
                        return JSON.parse(line);
                    } catch {
                        return null;
                    }
                }).filter(event => event !== null);
            } catch (error) {
                this.log(`Error loading structured events: ${error.message}`);
                return [];
            }
        }
        
        return [];
    }

    async parseCustomerLogForCompletion(pubkey) {
        // Defensive legacy log parsing with multiple patterns
        const logFile = path.join(this.config.BRAINSTORM_LOG_DIR, 'processCustomer.log');
        
        if (!fs.existsSync(logFile)) {
            return null;
        }
        
        try {
            const content = fs.readFileSync(logFile, 'utf8');
            
            // Multiple patterns for resilience (defensive parsing)
            const patterns = [
                // Current format
                new RegExp(`(\\d{4}-\\d{2}-\\d{2}[T\\s]\\d{2}:\\d{2}:\\d{2}[^:]*): Finished processCustomer.*customer_pubkey ${pubkey}`, 'gi'),
                // Alternative formats
                new RegExp(`([^:]+): Finished processCustomer.*${pubkey}`, 'gi'),
                // Flexible timestamp matching
                new RegExp(`([^\\]]+): Finished processCustomer.*${pubkey.substring(0, 16)}`, 'gi')
            ];
            
            let latestMatch = null;
            let latestTime = null;
            
            for (const pattern of patterns) {
                const matches = [...content.matchAll(pattern)];
                for (const match of matches) {
                    try {
                        const timeStr = match[1].trim();
                        const parsedTime = new Date(timeStr);
                        
                        if (!isNaN(parsedTime.getTime()) && (!latestTime || parsedTime > latestTime)) {
                            latestTime = parsedTime;
                            latestMatch = {
                                timestamp: parsedTime.toISOString(),
                                source: 'legacy_log_parsing',
                                pattern: pattern.source
                            };
                        }
                    } catch (error) {
                        // Skip invalid timestamps
                        continue;
                    }
                }
                
                // If we found a match with this pattern, use it
                if (latestMatch) break;
            }
            
            return latestMatch;
            
        } catch (error) {
            this.log(`Error parsing customer log for ${pubkey}: ${error.message}`);
            return null;
        }
    }

    async parseProcessAllTasksLogLegacy(logFile) {
        try {
            const content = fs.readFileSync(logFile, 'utf8');
            const lines = content.trim().split('\n');
            
            // Look for start/finish patterns with defensive parsing
            const startPattern = /(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}[^:]*): Starting processAllTasks/gi;
            const finishPattern = /(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}[^:]*): Finished processAllTasks/gi;
            
            const startMatches = [...content.matchAll(startPattern)];
            const finishMatches = [...content.matchAll(finishPattern)];
            
            let lastStart = null;
            let lastFinish = null;
            
            if (startMatches.length > 0) {
                const latest = startMatches[startMatches.length - 1];
                lastStart = new Date(latest[1].trim()).toISOString();
            }
            
            if (finishMatches.length > 0) {
                const latest = finishMatches[finishMatches.length - 1];
                lastFinish = new Date(latest[1].trim()).toISOString();
            }
            
            return {
                status: 'legacy_parsed',
                lastStart,
                lastFinish,
                isRunning: lastStart && (!lastFinish || new Date(lastStart) > new Date(lastFinish))
            };
            
        } catch (error) {
            this.log(`Error parsing legacy processAllTasks log: ${error.message}`);
            return { status: 'parse_error', message: error.message };
        }
    }

    loadTaskStatus() {
        const statusFile = path.join(this.config.BRAINSTORM_LOG_DIR, 'taskQueue', 'taskStatus.json');
        
        if (fs.existsSync(statusFile)) {
            try {
                // TODO: This should be a proper JSON array, not line-by-line entries
                const content = fs.readFileSync(statusFile, 'utf8');
                return content.trim().split('\n').map(line => {
                    try {
                        return JSON.parse(line);
                    } catch {
                        return null;
                    }
                }).filter(entry => entry !== null);
            } catch (error) {
                this.log(`Error loading task status: ${error.message}`);
                return [];
            }
        }
        
        return [];
    }

    async run() {
        try {
            const fullState = await this.gatherFullState();
            console.log(JSON.stringify(fullState, null, 2));
        } catch (error) {
            this.log(`Error in system state gatherer: ${error.message}`);
            process.exit(1);
        }
    }
}

// Run if called directly
if (require.main === module) {
    const gatherer = new SystemStateGatherer();
    gatherer.run();
}

module.exports = SystemStateGatherer;

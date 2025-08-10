/**
 * Task Execution API Handler
 * Registry-driven task execution endpoint for Task Explorer dashboard
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { CustomerManager } = require('../../../utils/customerManager');

// Initialize CustomerManager
const customerManager = new CustomerManager();

// Get task registry
const getTaskRegistry = () => {
    const registryPath = path.join(__dirname, '../../../manage/taskQueue/taskRegistry.json');
    if (!fs.existsSync(registryPath)) {
        throw new Error('Task registry not found');
    }
    
    const registryData = fs.readFileSync(registryPath, 'utf8');
    return JSON.parse(registryData);
};

// Validate customer arguments using CustomerManager
const validateCustomerArguments = async (req) => {
    const { pubkey, customerId, customerName } = req.query;
    
    if (!pubkey) {
        throw new Error('Customer pubkey is required for customer tasks');
    }
    
    // Validate pubkey format (basic hex check)
    if (!/^[a-fA-F0-9]{64}$/.test(pubkey)) {
        throw new Error('Invalid pubkey format (must be 64-character hex string)');
    }
    
    // Get customer data from CustomerManager
    try {
        const customer = await customerManager.getCustomer(pubkey);
        
        if (!customer) {
            throw new Error(`Customer with pubkey ${pubkey} not found in system`);
        }
        
        // Return actual customer data from the system
        return {
            pubkey: customer.pubkey,
            customerId: customer.id.toString(), // Ensure ID is string for script compatibility
            customerName: customer.name,
            directory: customer.directory // Include directory for path resolution
        };
        
    } catch (error) {
        if (error.message.includes('not found in system')) {
            throw error; // Re-throw customer not found errors
        }
        
        // For other errors, provide fallback with warning
        console.warn(`[RunTask] CustomerManager lookup failed for ${pubkey}: ${error.message}`);
        console.warn(`[RunTask] Using fallback customer identifiers`);
        
        return {
            pubkey,
            customerId: customerId || pubkey.substring(0, 8),
            customerName: customerName || `customer_${pubkey.substring(0, 8)}`,
            directory: `customer_${pubkey.substring(0, 8)}` // Fallback directory
        };
    }
};

// Build command arguments based on task requirements
const buildTaskCommand = (task, customerArgs = null) => {
    const baseDir = process.env.BRAINSTORM_MODULE_BASE_DIR || '/usr/local/lib/node_modules/brainstorm';
    const srcDir = path.join(baseDir, 'src');
    const scriptPath = task.script.replace('BRAINSTORM_MODULE_SRC_DIR', srcDir);
    
    let command = scriptPath;
    let args = [];
    
    // Handle customer arguments if required
    if (task.arguments && task.arguments.customer && customerArgs) {
        args = [customerArgs.pubkey, customerArgs.customerId, customerArgs.customerName];
    }
    
    return { command, args };
};

// Calculate timeout based on task's average duration
const calculateTimeout = (task) => {
    const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes default
    const MIN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes minimum
    const MAX_TIMEOUT_MS = 120 * 60 * 1000; // 2 hours maximum
    
    if (!task.averageDuration) {
        console.log(`[RunTask] No averageDuration for ${task.name}, using default timeout: ${DEFAULT_TIMEOUT_MS / 1000}s`);
        return DEFAULT_TIMEOUT_MS;
    }
    
    // Convert averageDuration to milliseconds (assume it's in milliseconds)
    const durationMs = task.averageDuration;
    
    // Add 100% buffer for safety (e.g., 4 minute task gets 8 minute timeout)
    let timeoutMs = Math.round(durationMs * 2);

    // If the task has an enforced timeout, use that instead
    if (task.enforcedTimeout) {
        timeoutMs = task.enforcedTimeout;
    }
    
    // Enforce min/max bounds
    const boundedTimeout = Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, timeoutMs));
    
    console.log(`[RunTask] Task ${task.name} averageDuration: ${task.averageDuration}ms, calculated timeout: ${boundedTimeout / 1000}s`);
    return boundedTimeout;
};

// Execute task with real-time output streaming
const executeTask = (command, args, task) => {
    return new Promise((resolve, reject) => {
        console.log(`[RunTask] Executing: ${command} ${args.join(' ')}`);
        
        const childProcess = spawn(command, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
                ...process.env,
                BRAINSTORM_STRUCTURED_LOGGING: 'true'
            }
        });
        
        let stdout = '';
        let stderr = '';
        
        childProcess.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        
        childProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        
        childProcess.on('close', (code) => {
            const result = {
                taskName: task.name,
                command: `${command} ${args.join(' ')}`,
                exitCode: code,
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                success: code === 0,
                timestamp: new Date().toISOString()
            };
            
            if (code === 0) {
                console.log(`[RunTask] Task ${task.name} completed successfully`);
                resolve(result);
            } else {
                console.error(`[RunTask] Task ${task.name} failed with exit code ${code}`);
                resolve(result); // Still resolve, but with error info
            }
        });
        
        childProcess.on('error', (error) => {
            console.error(`[RunTask] Process error for ${task.name}:`, error);
            reject({
                taskName: task.name,
                command: `${command} ${args.join(' ')}`,
                error: error.message,
                success: false,
                timestamp: new Date().toISOString()
            });
        });
        
        // Set dynamic timeout based on task's average duration
        const timeoutMs = calculateTimeout(task);
        const timeoutMinutes = Math.round(timeoutMs / 60000);
        
        setTimeout(() => {
            if (!childProcess.killed) {
                console.warn(`[RunTask] Timeout reached for ${task.name}, terminating process`);
                childProcess.kill('SIGTERM');
                reject({
                    taskName: task.name,
                    command: `${command} ${args.join(' ')}`,
                    error: `Task execution timeout (${timeoutMinutes} minutes)`,
                    success: false,
                    timestamp: new Date().toISOString()
                });
            }
        }, timeoutMs);
    });
};

/**
 * Handle task execution request
 * POST /api/run-task
 * 
 * Query Parameters:
 * - taskName (required): Name of task from registry
 * - pubkey (required for customer tasks): Customer public key
 * - customerId (optional): Customer ID (defaults to first 8 chars of pubkey)
 * - customerName (optional): Customer name (defaults to customer_<pubkey_prefix>)
 */
const handleRunTask = async (req, res) => {
    try {
        const { taskName } = req.query;
        
        // Validate required parameters
        if (!taskName) {
            return res.status(400).json({
                success: false,
                error: 'taskName parameter is required'
            });
        }
        
        // Load task registry
        const registry = getTaskRegistry();
        const task = registry.tasks[taskName];
        
        if (!task) {
            return res.status(404).json({
                success: false,
                error: `Task '${taskName}' not found in registry`
            });
        }
        
        // Check if task requires customer arguments
        let customerArgs = null;
        if (task.arguments && task.arguments.customer) {
            try {
                customerArgs = await validateCustomerArguments(req);
            } catch (error) {
                return res.status(400).json({
                    success: false,
                    error: error.message
                });
            }
        }
        
        // Build command
        const { command, args } = buildTaskCommand(task, customerArgs);
        
        // Verify script exists
        if (!fs.existsSync(command)) {
            return res.status(404).json({
                success: false,
                error: `Script not found: ${command}`
            });
        }
        
        // Execute task
        console.log(`[RunTask] Starting task: ${taskName}`);
        const result = await executeTask(command, args, task);
        
        // Return result
        res.json({
            success: result.success,
            task: {
                name: task.name,
                description: task.description,
                categories: task.categories,
                requiresCustomer: !!(task.arguments && task.arguments.customer)
            },
            execution: result,
            message: result.success ? 
                `Task '${taskName}' completed successfully` : 
                `Task '${taskName}' completed with errors`
        });
        
    } catch (error) {
        console.error('[RunTask] Handler error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
};

module.exports = {
    handleRunTask
};
/**
 * Task Execution API Handler
 * Registry-driven task execution endpoint for Task Explorer dashboard
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load task registry
const getTaskRegistry = () => {
    try {
        const registryPath = path.join(process.env.BRAINSTORM_MODULE_BASE_DIR || '/usr/local/lib/node_modules/brainstorm', 'src/manage/taskQueue/taskRegistry.json');
        const registryData = fs.readFileSync(registryPath, 'utf8');
        return JSON.parse(registryData);
    } catch (error) {
        console.error('Error loading task registry:', error);
        throw new Error('Failed to load task registry');
    }
};

// Validate customer arguments
const validateCustomerArguments = (req) => {
    const { pubkey, customerId, customerName } = req.query;
    
    if (!pubkey) {
        throw new Error('Customer pubkey is required for customer tasks');
    }
    
    // Validate pubkey format (basic hex check)
    if (!/^[a-fA-F0-9]{64}$/.test(pubkey)) {
        throw new Error('Invalid pubkey format (must be 64-character hex string)');
    }
    
    return {
        pubkey,
        customerId: customerId || pubkey.substring(0, 8), // Default to first 8 chars of pubkey
        customerName: customerName || `customer_${pubkey.substring(0, 8)}`
    };
};

// Build command arguments based on task requirements
const buildTaskCommand = (task, customerArgs = null) => {
    const baseDir = process.env.BRAINSTORM_MODULE_BASE_DIR || '/usr/local/lib/node_modules/brainstorm';
    const scriptPath = task.script.replace('BRAINSTORM_MODULE_SRC_DIR', path.join(baseDir, 'src'));
    
    let command = scriptPath;
    let args = [];
    
    // Handle customer arguments if required
    if (task.arguments && task.arguments.customer && customerArgs) {
        args = [customerArgs.pubkey, customerArgs.customerId, customerArgs.customerName];
    }
    
    return { command, args };
};

// Execute task with real-time output streaming
const executeTask = (command, args, taskName) => {
    return new Promise((resolve, reject) => {
        console.log(`[RunTask] Executing: ${command} ${args.join(' ')}`);
        
        const process = spawn(command, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
                ...process.env,
                BRAINSTORM_STRUCTURED_LOGGING: 'true'
            }
        });
        
        let stdout = '';
        let stderr = '';
        
        process.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        
        process.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        
        process.on('close', (code) => {
            const result = {
                taskName,
                command: `${command} ${args.join(' ')}`,
                exitCode: code,
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                success: code === 0,
                timestamp: new Date().toISOString()
            };
            
            if (code === 0) {
                console.log(`[RunTask] Task ${taskName} completed successfully`);
                resolve(result);
            } else {
                console.error(`[RunTask] Task ${taskName} failed with exit code ${code}`);
                resolve(result); // Still resolve, but with error info
            }
        });
        
        process.on('error', (error) => {
            console.error(`[RunTask] Process error for ${taskName}:`, error);
            reject({
                taskName,
                command: `${command} ${args.join(' ')}`,
                error: error.message,
                success: false,
                timestamp: new Date().toISOString()
            });
        });
        
        // Set timeout for long-running tasks (30 minutes)
        setTimeout(() => {
            if (!process.killed) {
                console.warn(`[RunTask] Timeout reached for ${taskName}, terminating process`);
                process.kill('SIGTERM');
                reject({
                    taskName,
                    command: `${command} ${args.join(' ')}`,
                    error: 'Task execution timeout (30 minutes)',
                    success: false,
                    timestamp: new Date().toISOString()
                });
            }
        }, 30 * 60 * 1000); // 30 minutes
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
                customerArgs = validateCustomerArguments(req);
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
        const result = await executeTask(command, args, taskName);
        
        // Return result
        res.json({
            success: result.success,
            task: {
                name: taskName,
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
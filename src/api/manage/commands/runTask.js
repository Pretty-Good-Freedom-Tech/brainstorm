/**
 * Task Execution API Handler
 * Registry-driven task execution endpoint for Task Explorer dashboard
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const CustomerManager = require('../../../utils/customerManager');
const brainstormConfig = require('../../../utils/brainstormConfig');
const { resolveTaskTimeout, determineExecutionMode, formatTimeoutLog } = require('../../../utils/taskTimeout');

// Get task registry
async function getTaskRegistry() {
    const registryPath = path.join(brainstormConfig.get('BRAINSTORM_MODULE_MANAGE_DIR'), 'taskQueue/taskRegistry.json');
    if (!fs.existsSync(registryPath)) {
        throw new Error('Task registry not found');
    }
    
    const registryData = fs.readFileSync(registryPath, 'utf8');
    return JSON.parse(registryData);
}

// Validate customer arguments using CustomerManager
async function validateCustomerArguments(req) {
    const { pubkey, customerId, customerName } = req.query;
    
    // Initialize CustomerManager
    const customerManager = new CustomerManager();
    await customerManager.initialize();
    
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
}

// Build command arguments based on task requirements
async function buildTaskCommand(task, customerArgs = null) {    
    // Use the cross-platform config module to expand all environment variables
    const scriptPath = brainstormConfig.expandScriptPath(task.script);
    
    let command = scriptPath;

    let args = [];
    
    // Handle customer arguments if required
    if (task.arguments && task.arguments.customer && customerArgs) {
        args = [customerArgs.pubkey, customerArgs.customerId, customerArgs.customerName];
    }
    
    return { command, args };
}

// Calculate timeout and execution mode using shared utility
async function calculateTaskExecution(task, registry) {
    const timeoutConfig = resolveTaskTimeout(task, registry);
    const executionMode = determineExecutionMode(timeoutConfig, task);
    
    console.log(`[RunTask] ${formatTimeoutLog(timeoutConfig, task.name)}`);
    console.log(`[RunTask] Execution mode: ${executionMode.shouldRunAsync ? 'async' : 'sync'} (${executionMode.reason})`);
    
    return {
        timeoutConfig,
        executionMode
    };
}

// Execute task with support for both sync and async modes using launchChildTask.sh
async function executeTask(command, args, taskName, task, registry, executionConfig) {
    return new Promise(async (resolve, reject) => {
        // Use launchChildTask.sh for unified launch control
        const launchChildTaskPath = brainstormConfig.expandScriptPath('$BRAINSTORM_MODULE_MANAGE_DIR/taskQueue/launchChildTask.sh');
        
        // Build options JSON for launchChildTask
        const optionsJson = JSON.stringify({
            completion: {
                failure: {
                    timeout: {
                        duration: executionConfig.timeoutConfig.timeoutMs,
                        forceKill: executionConfig.timeoutConfig.forceKill || false
                    }
                }
            }
        });
        
        // Prepare child args (combine original args into single string if needed)
        const childArgs = args.length > 0 ? args.join(' ') : '';
        
        console.log(`[RunTask] Using launchChildTask for: ${taskName}`);
        console.log(`[RunTask] Options: ${optionsJson}`);
        console.log(`[RunTask] Command: ${command}`)
        console.log(`[RunTask] launchChildTaskPath: ${launchChildTaskPath}`)
        
        const childProcess = spawn('bash', [launchChildTaskPath, taskName, 'api-handler', optionsJson, childArgs], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
                ...process.env,
                BRAINSTORM_STRUCTURED_LOGGING: 'true'
            }
        });
        
        let stdout = '';
        let stderr = '';
        let launchResult = null;
        const startTime = new Date().toISOString();
        
        childProcess.stdout.on('data', (data) => {
            const output = data.toString();
            stdout += output;
            
            // Parse structured output from launchChildTask
            const lines = output.split('\n');
            for (const line of lines) {
                if (line.startsWith('LAUNCHCHILDTASK_RESULT:')) {
                    try {
                        const jsonStr = line.substring('LAUNCHCHILDTASK_RESULT:'.length).trim();
                        launchResult = JSON.parse(jsonStr);
                        console.log(`[RunTask] Parsed launch result:`, launchResult);
                    } catch (error) {
                        console.warn(`[RunTask] Failed to parse launch result:`, error);
                    }
                }
            }
        });
        
        childProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        
        childProcess.on('close', (code) => {
            // Build base result
            let result = {
                taskName: taskName,
                command: `${command} ${args.join(' ')}`,
                exitCode: code,
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                success: code === 0,
                timestamp: new Date().toISOString(),
                startTime,
                pid: childProcess.pid,
                executionMode: executionConfig.executionMode.shouldRunAsync ? 'async' : 'sync'
            };
            
            // Enhance result with launch information if available
            if (launchResult) {
                result.launchAction = launchResult.launch_action;
                result.launchMessage = launchResult.message;
                
                if (launchResult.launch_action === 'prevented') {
                    result.existingPid = launchResult.existing_pid;
                    result.errorState = launchResult.error_state;
                    result.statusMessage = `Task already running (PID: ${launchResult.existing_pid}). Launch prevented by policy.`;
                } else if (launchResult.launch_action === 'launched') {
                    result.newPid = launchResult.new_pid;
                    result.statusMessage = `Task launched successfully in background (PID: ${launchResult.new_pid}).`;
                }
            }
            
            if (code === 0) {
                console.log(`[RunTask] Task ${taskName} completed successfully`);
                resolve(result);
            } else {
                console.error(`[RunTask] Task ${taskName} failed with exit code ${code}`);
                resolve(result); // Still resolve, but with error info
            }
        });
        
        childProcess.on('error', (error) => {
            console.error(`[RunTask] Process error for ${taskName}:`, error);
            reject({
                taskName: taskName,
                command: `${command} ${args.join(' ')}`,
                error: error.message,
                success: false,
                timestamp: new Date().toISOString(),
                startTime,
                executionMode: executionConfig.executionMode.shouldRunAsync ? 'async' : 'sync'
            });
        });
        
        // For async tasks, resolve immediately with process info
        if (executionConfig.executionMode.shouldRunAsync) {
            console.log(`[RunTask] Task ${taskName} started asynchronously (PID: ${childProcess.pid})`);
            
            // Wait a moment for launchResult to be parsed
            setTimeout(() => {
                let response = {
                    taskName: taskName,
                    command: `${command} ${args.join(' ')}`,
                    success: true,
                    async: true,
                    pid: childProcess.pid,
                    timestamp: startTime,
                    status: 'running',
                    estimatedDuration: `${executionConfig.timeoutConfig.timeoutMinutes} minutes`,
                    executionMode: 'async'
                };
                
                // Customize response based on launch action
                if (launchResult) {
                    response.launchAction = launchResult.launch_action;
                    response.launchMessage = launchResult.message;
                    
                    if (launchResult.launch_action === 'prevented') {
                        response.existingPid = launchResult.existing_pid;
                        response.errorState = launchResult.error_state;
                        response.statusMessage = `Task already running (PID: ${launchResult.existing_pid}). Launch prevented by policy.`;
                        response.message = `Task already running in background (PID: ${launchResult.existing_pid}). Check Task Explorer for progress updates.`;
                        response.pid = launchResult.existing_pid; // Use existing PID instead of launcher PID
                    } else if (launchResult.launch_action === 'launched') {
                        response.newPid = launchResult.new_pid;
                        response.statusMessage = `Task launched successfully in background (PID: ${launchResult.new_pid}).`;
                        response.message = `Task started successfully in background (PID: ${launchResult.new_pid})`;
                        response.pid = launchResult.new_pid; // Use actual task PID instead of launcher PID
                    }
                } else {
                    // Fallback for when launchResult is not available yet
                    response.statusMessage = 'Task is running in background. Check Task Explorer for progress updates.';
                    response.message = `Task started successfully in background (PID: ${childProcess.pid})`;
                }
                
                resolve(response);
            }, 100); // Small delay to allow stdout parsing
        }
        
        // For sync tasks, set timeout and wait for completion
        const timeoutMs = executionConfig.timeoutConfig.timeoutMs;
        const timeoutMinutes = executionConfig.timeoutConfig.timeoutMinutes;
        
        setTimeout(async () => {
            if (!childProcess.killed) {
                console.warn(`[RunTask] Timeout reached for ${taskName}, terminating process`);
                childProcess.kill('SIGTERM');
                reject({
                    taskName: taskName,
                    command: `${command} ${args.join(' ')}`,
                    error: `Task execution timeout (${timeoutMinutes} minutes)`,
                    success: false,
                    timestamp: new Date().toISOString(),
                    startTime,
                    executionMode: 'sync'
                });
            }
        }, timeoutMs);
    });
}

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
async function handleRunTask(req, res) {
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
        const registry = await getTaskRegistry();
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
        const { command, args } = await buildTaskCommand(task, customerArgs);
        
        // Verify script exists
        if (!fs.existsSync(command)) {
            return res.status(404).json({
                success: false,
                error: `Script not found: ${command}`
            });
        }
        
        // Calculate execution configuration
        const executionConfig = await calculateTaskExecution(task, registry);
        
        // Execute task
        console.log(`[RunTask] Starting task: ${taskName}`);
        const result = await executeTask(command, args, taskName, task, registry, executionConfig);
        
        // Return result with enhanced async task information
        const responseMessage = result.async ? 
            `Task '${taskName}' started successfully in background` :
            result.success ? 
                `Task '${taskName}' completed successfully` : 
                `Task '${taskName}' completed with errors`;
        
        res.json({
            success: result.success,
            task: {
                name: task.name,
                description: task.description,
                categories: task.categories,
                requiresCustomer: !!(task.arguments && task.arguments.customer),
                timeout: executionConfig.timeoutConfig.timeoutMinutes + ' minutes',
                executionMode: result.executionMode || 'sync'
            },
            execution: result,
            message: responseMessage,
            ...(result.async && {
                monitoring: {
                    pid: result.pid,
                    estimatedDuration: result.estimatedDuration,
                    note: "Task is running in background. Check Task Explorer for progress updates."
                }
            })
        });
        
    } catch (error) {
        console.error('[RunTask] Handler error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
}

module.exports = {
    handleRunTask
}
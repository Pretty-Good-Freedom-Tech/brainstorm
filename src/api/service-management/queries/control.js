/**
 * Service Control Handler
 * Handles start/stop/restart operations for monitoring services
 */

const { execSync } = require('child_process');

class ServiceController {
    constructor() {
        this.allowedServices = [
            'neo4j-metrics-collector.service',
            'brainstorm-monitoring-scheduler.service',
            'brainstorm-monitoring-scheduler.timer'
        ];
        
        this.allowedActions = ['start', 'stop', 'restart', 'trigger'];
    }

    // Validate service name
    validateService(serviceName) {
        // Allow both with and without .service/.timer suffix
        const normalizedName = serviceName.endsWith('.service') || serviceName.endsWith('.timer') 
            ? serviceName 
            : serviceName + '.service';
            
        return this.allowedServices.includes(normalizedName) ? normalizedName : null;
    }

    // Execute systemctl command
    executeSystemctl(action, service) {
        try {
            let commands = [];
            let outputs = [];
            
            // Special handling for brainstorm-monitoring-scheduler
            if (service === 'brainstorm-monitoring-scheduler.service') {
                if (action === 'stop') {
                    // Stop both timer and service
                    commands = [
                        'sudo systemctl stop brainstorm-monitoring-scheduler.timer',
                        'sudo systemctl stop brainstorm-monitoring-scheduler.service'
                    ];
                } else if (action === 'start') {
                    // Start both service and timer
                    commands = [
                        'sudo systemctl start brainstorm-monitoring-scheduler.service',
                        'sudo systemctl start brainstorm-monitoring-scheduler.timer'
                    ];
                } else if (action === 'restart') {
                    // Restart both timer and service
                    commands = [
                        'sudo systemctl stop brainstorm-monitoring-scheduler.timer',
                        'sudo systemctl restart brainstorm-monitoring-scheduler.service',
                        'sudo systemctl start brainstorm-monitoring-scheduler.timer'
                    ];
                } else if (action === 'trigger') {
                    // Trigger scheduler immediately
                    commands = ['sudo systemctl start brainstorm-monitoring-scheduler.service'];
                } else {
                    commands = [`sudo systemctl ${action} ${service}`];
                }
            } else {
                // Standard single command for other services
                commands = [`sudo systemctl ${action} ${service}`];
            }
            
            // Execute all commands
            for (const command of commands) {
                console.log(`Executing: ${command}`);
                const output = execSync(command, { encoding: 'utf8', timeout: 30000 });
                outputs.push(`${command}: ${output.trim()}`);
            }
            
            return {
                success: true,
                output: outputs.join('\n'),
                command: commands.join(' && ')
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                command: commands ? commands.join(' && ') : `sudo systemctl ${action} ${service}`
            };
        }
    }

    // Get service status after action
    getServiceStatus(service) {
        try {
            const output = execSync(`systemctl is-active ${service}`, { encoding: 'utf8' });
            return output.trim();
        } catch (error) {
            return 'inactive';
        }
    }
}

async function handleServiceControl(req, res) {
    try {
        const { action, service } = req.body;
        
        if (!action || !service) {
            return res.status(400).json({
                error: 'Missing required parameters',
                message: 'Both action and service are required'
            });
        }
        
        const controller = new ServiceController();
        
        // Validate action
        if (!controller.allowedActions.includes(action)) {
            return res.status(400).json({
                error: 'Invalid action',
                message: `Action must be one of: ${controller.allowedActions.join(', ')}`
            });
        }
        
        // Validate and normalize service name
        const validatedService = controller.validateService(service);
        if (!validatedService) {
            return res.status(400).json({
                error: 'Invalid service',
                message: `Service must be one of: ${controller.allowedServices.join(', ')}`
            });
        }
        
        console.log(`Service control request: ${action} ${validatedService}`);
        
        // Execute the action
        const result = controller.executeSystemctl(action, validatedService);
        
        if (result.success) {
            // Get updated status
            const newStatus = controller.getServiceStatus(validatedService);
            
            res.json({
                success: true,
                message: `Successfully executed ${action} on ${validatedService}`,
                service: validatedService,
                action,
                newStatus,
                output: result.output
            });
        } else {
            res.status(500).json({
                error: 'Service control failed',
                message: result.error,
                service: validatedService,
                action,
                command: result.command
            });
        }
        
    } catch (error) {
        console.error('Service control API error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
}

module.exports = {
    handleServiceControl
};

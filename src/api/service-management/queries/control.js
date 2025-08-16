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
            let command;
            
            if (action === 'trigger' && service === 'brainstorm-monitoring-scheduler.service') {
                // Special case: trigger scheduler immediately
                command = 'systemctl start brainstorm-monitoring-scheduler.service';
            } else {
                command = `systemctl ${action} ${service}`;
            }
            
            console.log(`Executing: ${command}`);
            const output = execSync(command, { encoding: 'utf8', timeout: 30000 });
            
            return {
                success: true,
                output: output.trim(),
                command
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                command: `systemctl ${action} ${service}`
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

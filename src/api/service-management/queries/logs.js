/**
 * Service Logs Handler
 * Retrieves systemd journal logs for monitoring services
 */

const { execSync } = require('child_process');

class ServiceLogsRetriever {
    constructor() {
        this.allowedServices = [
            'neo4j-metrics-collector',
            'brainstorm-monitoring-scheduler'
        ];
    }

    // Validate service name
    validateService(serviceName) {
        // Remove .service suffix if present
        const normalizedName = serviceName.replace(/\.service$/, '');
        return this.allowedServices.includes(normalizedName) ? normalizedName : null;
    }

    // Get service logs using journalctl
    getServiceLogs(service, lines = 100) {
        try {
            const command = `sudo journalctl -u ${service}.service -n ${lines} --no-pager`;
            console.log(`Executing: ${command}`);
            
            const output = execSync(command, { 
                encoding: 'utf8', 
                timeout: 15000,
                maxBuffer: 1024 * 1024 // 1MB buffer
            });
            
            return {
                success: true,
                logs: output.trim(),
                lines: lines,
                service
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                logs: `Error retrieving logs for ${service}: ${error.message}`,
                service
            };
        }
    }

    // Format logs for better readability
    formatLogs(rawLogs) {
        if (!rawLogs) return 'No logs available';
        
        // Split into lines and process each line
        const lines = rawLogs.split('\n');
        const formattedLines = lines.map(line => {
            // Remove ANSI color codes if present
            return line.replace(/\x1b\[[0-9;]*m/g, '');
        });
        
        return formattedLines.join('\n');
    }
}

async function handleServiceLogs(req, res) {
    try {
        const { service, lines = 100 } = req.query;
        
        if (!service) {
            return res.status(400).json({
                error: 'Missing service parameter',
                message: 'Service name is required'
            });
        }
        
        const retriever = new ServiceLogsRetriever();
        
        // Validate service name
        const validatedService = retriever.validateService(service);
        if (!validatedService) {
            return res.status(400).json({
                error: 'Invalid service',
                message: `Service must be one of: ${retriever.allowedServices.join(', ')}`
            });
        }
        
        // Validate lines parameter
        const numLines = parseInt(lines);
        if (isNaN(numLines) || numLines < 1 || numLines > 1000) {
            return res.status(400).json({
                error: 'Invalid lines parameter',
                message: 'Lines must be a number between 1 and 1000'
            });
        }
        
        console.log(`Service logs request: ${validatedService} (${numLines} lines)`);
        
        // Get the logs
        const result = retriever.getServiceLogs(validatedService, numLines);
        
        if (result.success) {
            res.json({
                success: true,
                service: validatedService,
                lines: numLines,
                logs: retriever.formatLogs(result.logs),
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(500).json({
                error: 'Failed to retrieve logs',
                message: result.error,
                service: validatedService,
                logs: result.logs
            });
        }
        
    } catch (error) {
        console.error('Service logs API error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
}

module.exports = {
    handleServiceLogs
};

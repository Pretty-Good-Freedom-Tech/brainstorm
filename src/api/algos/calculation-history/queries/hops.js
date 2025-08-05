/**
 * Hops Calculation History API
 * Provides calculation status for customer-specific hops calculations
 */

const fs = require('fs');
const path = require('path');
const CustomerManager = require('../../../utils/customerManager');
const { getConfigFromFile } = require('../../../utils/config');

/**
 * Handler for getting hops calculation history for a specific customer
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handleGetHistoryHops(req, res) {
    try {
        // Check if user is authenticated
        if (!req.session.authenticated) {
            return res.status(401).json({ 
                success: false, 
                message: 'Authentication required.' 
            });
        }

        // Get customer pubkey from query parameter
        const customerPubkey = req.query.pubkey;
        
        if (!customerPubkey) {
            return res.status(400).json({
                success: false,
                message: 'Customer pubkey is required as query parameter'
            });
        }

        console.log(`Getting hops calculation history for customer: ${customerPubkey.substring(0, 8)}...`);
        
        // Verify the customer exists using CustomerManager
        const customerManager = new CustomerManager();
        await customerManager.initialize();
        
        const customer = await customerManager.getCustomer(customerPubkey);
        
        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found'
            });
        }

        // Get the customer's log directory
        const logDir = getConfigFromFile('BRAINSTORM_LOG_DIR', '/var/log/brainstorm');
        const customerLogDir = path.join(logDir, 'customers', customer.name);
        const hopsLogFile = path.join(customerLogDir, 'calculateHops.log');
        
        console.log(`Checking hops log file: ${hopsLogFile}`);
        
        // Get calculation status from log file
        const calculationStatus = getHopsCalculationStatus(hopsLogFile);
        
        res.json({
            success: true,
            data: {
                customer: {
                    name: customer.name,
                    id: customer.id,
                    pubkey: customerPubkey,
                    status: customer.status
                },
                calculation: {
                    type: 'hops',
                    logFile: hopsLogFile,
                    ...calculationStatus
                }
            }
        });
        
    } catch (error) {
        console.error('Error getting hops calculation history:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while getting calculation history'
        });
    }
}

/**
 * Get calculation status from hops log file
 * @param {string} logFile - Path to the log file
 * @returns {Object} Calculation status information
 */
function getHopsCalculationStatus(logFile) {
    try {
        if (!fs.existsSync(logFile)) {
            return { 
                status: 'Never', 
                timestamp: 0, 
                formattedTime: 'Never', 
                duration: null,
                logExists: false
            };
        }
        
        const fileContent = fs.readFileSync(logFile, 'utf8');
        
        // Check for the most recent "Starting calculateHops" and "Finished calculateHops" entries
        // Expected format: "Tue Jul 29 18:54:47 UTC 2025: Starting calculateHops"
        const startMatches = [...fileContent.matchAll(/(.*?): Starting calculateHops/g)];
        const finishMatches = [...fileContent.matchAll(/(.*?): Finished calculateHops/g)];
        
        if (startMatches.length === 0) {
            return { 
                status: 'Never', 
                timestamp: 0, 
                formattedTime: 'Never', 
                duration: null,
                logExists: true,
                logSize: fileContent.length
            };
        }
        
        // Parse the date strings
        const parseLogDate = (dateStr) => {
            try {
                // Convert the log date format to a standard format that JavaScript can parse
                return new Date(dateStr.trim());
            } catch (err) {
                console.error(`Error parsing date: ${dateStr}`, err);
                return null;
            }
        };
        
        const lastStartMatch = startMatches[startMatches.length - 1];
        const lastStartDate = parseLogDate(lastStartMatch[1]);
        
        if (!lastStartDate) {
            return { 
                status: 'Error', 
                timestamp: 0, 
                formattedTime: 'Error parsing date', 
                duration: null,
                logExists: true,
                error: 'Could not parse start date'
            };
        }
        
        const lastStartTimestamp = Math.floor(lastStartDate.getTime() / 1000);
        
        // Check if there's a finish entry after the last start entry
        let isCompleted = false;
        let lastFinishDate = null;
        let lastFinishTimestamp = 0;
        
        if (finishMatches.length > 0) {
            // Find the most recent finish entry that comes after the last start
            for (let i = finishMatches.length - 1; i >= 0; i--) {
                const finishDate = parseLogDate(finishMatches[i][1]);
                if (finishDate && finishDate >= lastStartDate) {
                    isCompleted = true;
                    lastFinishDate = finishDate;
                    lastFinishTimestamp = Math.floor(lastFinishDate.getTime() / 1000);
                    break;
                }
            }
        }
        
        if (!isCompleted) {
            // In progress - started but not finished
            const now = new Date();
            const elapsedSeconds = Math.floor((now - lastStartDate) / 1000);
            const elapsedMinutes = Math.floor(elapsedSeconds / 60);
            const elapsedHours = Math.floor(elapsedMinutes / 60);
            
            let formattedElapsed;
            if (elapsedHours > 0) {
                formattedElapsed = `${elapsedHours}h ${elapsedMinutes % 60}m ago`;
            } else if (elapsedMinutes > 0) {
                formattedElapsed = `${elapsedMinutes}m ${elapsedSeconds % 60}s ago`;
            } else {
                formattedElapsed = `${elapsedSeconds}s ago`;
            }
            
            // Check for potential stalling by examining the last line of the log
            const lines = fileContent.split('\n').filter(line => line.trim() !== '');
            const lastLine = lines[lines.length - 1];
            
            let lastActivityDate = null;
            if (lastLine) {
                // Try to extract date from the last line
                const lastLineMatch = lastLine.match(/^(.*?): /);
                if (lastLineMatch) {
                    lastActivityDate = parseLogDate(lastLineMatch[1]);
                }
            }
            
            let inactivityInfo = null;
            if (lastActivityDate) {
                const inactivitySeconds = Math.floor((now - lastActivityDate) / 1000);
                const inactivityMinutes = Math.floor(inactivitySeconds / 60);
                const inactivityHours = Math.floor(inactivityMinutes / 60);
                
                let formattedInactivity;
                if (inactivityHours > 0) {
                    formattedInactivity = `${inactivityHours}h ${inactivityMinutes % 60}m ago`;
                } else if (inactivityMinutes > 0) {
                    formattedInactivity = `${inactivityMinutes}m ${inactivitySeconds % 60}s ago`;
                } else {
                    formattedInactivity = `${inactivitySeconds}s ago`;
                }
                
                inactivityInfo = {
                    lastLine: lastLine,
                    lastActivityTimestamp: Math.floor(lastActivityDate.getTime() / 1000),
                    inactivityDuration: formattedInactivity,
                    inactivitySeconds: inactivitySeconds
                };
            }
            
            // Determine if it might be stalled (no activity for more than 5 minutes)
            let status = 'In Progress';
            if (inactivityInfo && inactivityInfo.inactivitySeconds > 300) { // 5 minutes
                status = 'Stalled';
            }
            
            return {
                status,
                timestamp: lastStartTimestamp,
                formattedTime: `Started ${formattedElapsed}`,
                startTime: lastStartDate.toLocaleString(),
                duration: null,
                logExists: true,
                inProgress: true,
                inactivity: inactivityInfo
            };
        } else {
            // Completed
            const now = new Date();
            const elapsedSeconds = Math.floor((now - lastFinishDate) / 1000);
            const elapsedMinutes = Math.floor(elapsedSeconds / 60);
            const elapsedHours = Math.floor(elapsedMinutes / 60);
            const elapsedDays = Math.floor(elapsedHours / 24);
            
            let formattedElapsed;
            if (elapsedDays > 0) {
                formattedElapsed = `${elapsedDays}d ${elapsedHours % 24}h ago`;
            } else if (elapsedHours > 0) {
                formattedElapsed = `${elapsedHours}h ${elapsedMinutes % 60}m ago`;
            } else if (elapsedMinutes > 0) {
                formattedElapsed = `${elapsedMinutes}m ${elapsedSeconds % 60}s ago`;
            } else {
                formattedElapsed = `${elapsedSeconds}s ago`;
            }
            
            const durationSeconds = Math.floor((lastFinishDate - lastStartDate) / 1000);
            const durationMinutes = Math.floor(durationSeconds / 60);
            const durationHours = Math.floor(durationMinutes / 60);
            const durationDays = Math.floor(durationHours / 24);
            
            let formattedDuration;
            if (durationDays > 0) {
                formattedDuration = `${durationDays}d ${durationHours % 24}h`;
            } else if (durationHours > 0) {
                formattedDuration = `${durationHours}h ${durationMinutes % 60}m`;
            } else if (durationMinutes > 0) {
                formattedDuration = `${durationMinutes}m ${durationSeconds % 60}s`;
            } else {
                formattedDuration = `${durationSeconds}s`;
            }
            
            return {
                status: 'Completed',
                timestamp: lastFinishTimestamp,
                formattedTime: `Completed ${formattedElapsed}`,
                startTime: lastStartDate.toLocaleString(),
                finishTime: lastFinishDate.toLocaleString(),
                duration: formattedDuration,
                durationSeconds: durationSeconds,
                logExists: true,
                inProgress: false
            };
        }
        
    } catch (error) {
        console.error(`Error reading log file ${logFile}:`, error);
        return {
            status: 'Error',
            timestamp: 0,
            formattedTime: 'Error reading log file',
            duration: null,
            logExists: fs.existsSync(logFile),
            error: error.message
        };
    }
}

module.exports = {
    handleGetHistoryHops
};
/**
 * PersonalizedPageRank Calculation History API Handler
 * Provides customer-specific personalizedPageRank calculation status and history
 */

const fs = require('fs');
const path = require('path');

/**
 * Handle GET request for personalizedPageRank calculation history
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handleGetHistoryPersonalizedPageRank(req, res) {
    try {
        const { pubkey } = req.query;
        
        if (!pubkey) {
            return res.status(400).json({
                success: false,
                message: 'Missing required parameter: pubkey'
            });
        }
        
        console.log(`[PersonalizedPageRank History] Fetching calculation history for customer: ${pubkey}`);
        
        // Get calculation status from log files
        const calculation = await getPersonalizedPageRankCalculationStatus(pubkey);
        
        res.json({
            success: true,
            message: 'PersonalizedPageRank calculation history retrieved successfully',
            data: {
                customer: pubkey,
                calculation: calculation,
                timestamp: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('[PersonalizedPageRank History] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while fetching personalizedPageRank calculation history',
            error: error.message
        });
    }
}

/**
 * Get personalizedPageRank calculation status from log files
 * @param {string} pubkey - Customer public key
 * @returns {Object} Calculation status information
 */
async function getPersonalizedPageRankCalculationStatus(pubkey) {
    try {
        // Construct log file path for this customer
        const logFile = `/var/lib/brainstorm/customers/${pubkey}/logs/personalizedPageRank.log`;
        
        console.log(`[PersonalizedPageRank History] Checking log file: ${logFile}`);
        
        // Check if log file exists
        const logExists = fs.existsSync(logFile);
        
        if (!logExists) {
            console.log(`[PersonalizedPageRank History] Log file does not exist: ${logFile}`);
            return {
                status: 'Never Run',
                formattedTime: 'Never',
                logFile: logFile,
                logExists: false,
                message: 'PersonalizedPageRank calculation has never been run for this customer'
            };
        }
        
        // Read and parse log file
        const logContent = fs.readFileSync(logFile, 'utf8');
        const logLines = logContent.trim().split('\n').filter(line => line.trim());
        
        if (logLines.length === 0) {
            return {
                status: 'Never Run',
                formattedTime: 'Never',
                logFile: logFile,
                logExists: true,
                message: 'Log file exists but is empty'
            };
        }
        
        // Parse log entries to determine status
        const result = parsePersonalizedPageRankLogEntries(logLines);
        result.logFile = logFile;
        result.logExists = true;
        
        return result;
        
    } catch (error) {
        console.error('[PersonalizedPageRank History] Error reading log file:', error);
        return {
            status: 'Error',
            formattedTime: 'Unknown',
            logFile: `/var/lib/brainstorm/customers/${pubkey}/logs/personalizedPageRank.log`,
            logExists: false,
            error: error.message,
            message: 'Error reading personalizedPageRank calculation log'
        };
    }
}

/**
 * Parse personalizedPageRank log entries to determine calculation status
 * @param {Array} logLines - Array of log lines
 * @returns {Object} Parsed status information
 */
function parsePersonalizedPageRankLogEntries(logLines) {
    let startTime = null;
    let endTime = null;
    let lastActivityTime = null;
    let status = 'Unknown';
    let errors = [];
    
    // Parse each log line
    for (const line of logLines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        
        // Extract timestamp from log line (assuming format: YYYY-MM-DD HH:MM:SS - message)
        const timestampMatch = trimmedLine.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
        if (timestampMatch) {
            lastActivityTime = new Date(timestampMatch[1]);
        }
        
        // Look for start indicators
        if (trimmedLine.includes('Starting personalizedPageRank calculation') || 
            trimmedLine.includes('PersonalizedPageRank calculation started')) {
            if (timestampMatch) {
                startTime = new Date(timestampMatch[1]);
            }
            status = 'In Progress';
        }
        
        // Look for completion indicators
        if (trimmedLine.includes('PersonalizedPageRank calculation completed') ||
            trimmedLine.includes('personalizedPageRank calculation finished') ||
            trimmedLine.includes('Successfully completed personalizedPageRank')) {
            if (timestampMatch) {
                endTime = new Date(timestampMatch[1]);
            }
            status = 'Completed';
        }
        
        // Look for error indicators
        if (trimmedLine.includes('ERROR') || trimmedLine.includes('Error') || 
            trimmedLine.includes('FAILED') || trimmedLine.includes('Failed')) {
            errors.push(trimmedLine);
            status = 'Error';
        }
    }
    
    // Determine final status and timing
    const result = {
        status: status,
        startTime: startTime,
        endTime: endTime,
        lastActivityTime: lastActivityTime,
        errors: errors
    };
    
    // Format display time
    if (endTime) {
        result.formattedTime = formatTimestamp(endTime);
        if (startTime) {
            const durationMs = endTime - startTime;
            result.duration = formatDuration(durationMs);
        }
    } else if (startTime) {
        result.formattedTime = formatTimestamp(startTime);
        
        // Check if process might be stalled
        if (lastActivityTime) {
            const now = new Date();
            const inactivityMs = now - lastActivityTime;
            const inactivityMinutes = Math.floor(inactivityMs / (1000 * 60));
            
            // Consider stalled if no activity for more than 30 minutes
            if (inactivityMinutes > 30) {
                result.status = 'Stalled';
                result.inactivity = {
                    lastActivity: formatTimestamp(lastActivityTime),
                    inactivityDuration: formatDuration(inactivityMs)
                };
            } else {
                result.inProgress = true;
                result.inactivity = {
                    lastActivity: formatTimestamp(lastActivityTime),
                    inactivityDuration: formatDuration(inactivityMs)
                };
            }
        }
    } else if (lastActivityTime) {
        result.formattedTime = formatTimestamp(lastActivityTime);
    } else {
        result.formattedTime = 'Unknown';
    }
    
    return result;
}

/**
 * Format timestamp for display
 * @param {Date} timestamp - Date object to format
 * @returns {string} Formatted timestamp string
 */
function formatTimestamp(timestamp) {
    if (!timestamp || !(timestamp instanceof Date)) {
        return 'Unknown';
    }
    
    const now = new Date();
    const diffMs = now - timestamp;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMinutes < 1) {
        return 'Just now';
    } else if (diffMinutes < 60) {
        return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
    } else if (diffHours < 24) {
        return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    } else if (diffDays < 7) {
        return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    } else {
        return timestamp.toLocaleString();
    }
}

/**
 * Format duration in milliseconds to human readable string
 * @param {number} durationMs - Duration in milliseconds
 * @returns {string} Formatted duration string
 */
function formatDuration(durationMs) {
    if (!durationMs || durationMs < 0) {
        return 'Unknown';
    }
    
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
        const remainingMinutes = minutes % 60;
        return `${hours}h ${remainingMinutes}m`;
    } else if (minutes > 0) {
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
    } else {
        return `${seconds}s`;
    }
}

module.exports = {
    handleGetHistoryPersonalizedPageRank
};
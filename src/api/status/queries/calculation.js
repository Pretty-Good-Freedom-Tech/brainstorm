/**
 * Calculation Status Query Handler
 * Returns status information for various calculation processes
 */

const fs = require('fs');
const { getConfigFromFile } = require('../../../utils/config');

/**
 * Handler for getting calculation status information
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleCalculationStatus(req, res) {
    console.log('Getting calculation status...');
    
    try {
        // Get BRAINSTORM_LOG_DIR from brainstorm.conf
        const logDir = getConfigFromFile('BRAINSTORM_LOG_DIR', '/var/log/brainstorm');
        
        // Define log files to check
        const logFiles = {
            processAllTasks: `${logDir}/processAllTasks.log`,
            syncWoT: `${logDir}/syncWoT.log`,
            syncProfiles: `${logDir}/syncProfiles.log`,
            syncPersonal: `${logDir}/syncPersonal.log`,
            deleteAllRelationships: `${logDir}/deleteAllRelationships.log`,
            batchTransfer: `${logDir}/batchTransfer.log`,
            reconciliation: `${logDir}/reconciliation.log`,
            hops: `${logDir}/calculateHops.log`,
            pageRank: `${logDir}/calculatePersonalizedPageRank.log`,
            grapeRank: `${logDir}/calculatePersonalizedGrapeRank.log`,
            verifiedFollowers: `${logDir}/calculateVerifiedFollowers.log`,
            reports: `${logDir}/calculateReportScores.log`,
            blacklist: `${logDir}/exportBlacklist.log`,
            whitelist: `${logDir}/exportWhitelist.log`,
            nip85: `${logDir}/publishNip85.log`
        };
        
        // Function to get calculation status from log file
        const getCalculationStatus = (logFile) => {
            try {
                if (!fs.existsSync(logFile)) {
                    return { status: 'Never', timestamp: 0, formattedTime: 'Never', duration: null };
                }
                
                const fileContent = fs.readFileSync(logFile, 'utf8');
                
                // Check for the most recent "Starting" and "Finished" entries
                // The date format in the log files is like: "Sun Mar 30 00:18:14 UTC 2025"
                const startMatches = [...fileContent.matchAll(/(.*?): Starting/g)];
                const finishMatches = [...fileContent.matchAll(/(.*?): Finished/g)];
                
                if (startMatches.length === 0) {
                    return { status: 'Never', timestamp: 0, formattedTime: 'Never', duration: null };
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
                    return { status: 'Error', timestamp: 0, formattedTime: 'Error parsing date', duration: null };
                }
                
                const lastStartTimestamp = Math.floor(lastStartDate.getTime() / 1000);
                
                // Check if there's a finish entry after the last start entry
                let isCompleted = false;
                let lastFinishDate = null;
                let lastFinishTimestamp = 0;
                
                if (finishMatches.length > 0) {
                    // Find the most recent finish entry
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
                    
                    return {
                        status: 'In Progress',
                        timestamp: lastStartTimestamp,
                        formattedTime: `Started ${formattedElapsed}`,
                        startTime: lastStartDate.toLocaleString(),
                        duration: null
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
                        finishTime: lastFinishDate.toLocaleString(),
                        duration: formattedDuration
                    };
                }
            } catch (error) {
                console.error(`Error reading log file ${logFile}:`, error);
                return { status: 'Error', timestamp: 0, formattedTime: 'Error reading log' };
            }
        };
        
        // Get status for each calculation
        const result = {};
        Object.keys(logFiles).forEach(key => {
            result[key] = getCalculationStatus(logFiles[key]);
        });
        
        return res.json({
            success: true,
            status: result
        });
    } catch (error) {
        console.error('Error getting calculation status:', error);
        return res.json({
            success: false,
            error: error.message
        });
    }
}

module.exports = {
    handleCalculationStatus
};

/**
 * Neo4j Error Log API
 * Provides endpoints for parsing and serving Neo4j error logs
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Parse Neo4j log entries and extract error information
 * GET /api/neo4j-logs/errors
 */
async function getNeo4jErrors(req, res) {
    try {
        const {
            hours = 24,
            severity = 'all',
            category = 'all',
            search = '',
            page = 1,
            limit = 50
        } = req.query;

        const neo4jLogDir = process.env.NEO4J_LOG_DIR || '/var/log/neo4j';
        const neo4jLogPath = path.join(neo4jLogDir, 'neo4j.log');
        const debugLogPath = path.join(neo4jLogDir, 'debug.log');

        // Check if log files exist
        if (!fs.existsSync(neo4jLogPath)) {
            return res.status(404).json({
                error: 'Neo4j log file not found',
                path: neo4jLogPath
            });
        }

        // Parse errors from both main and debug logs
        const errors = [];
        
        // Parse main neo4j.log
        if (fs.existsSync(neo4jLogPath)) {
            const mainLogErrors = await parseLogFile(neo4jLogPath, parseInt(hours));
            errors.push(...mainLogErrors);
        }

        // Parse debug.log if it exists
        if (fs.existsSync(debugLogPath)) {
            const debugLogErrors = await parseLogFile(debugLogPath, parseInt(hours));
            errors.push(...debugLogErrors);
        }

        // Sort by timestamp (newest first)
        errors.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Apply filters
        let filteredErrors = errors;

        // Severity filter
        if (severity !== 'all') {
            filteredErrors = filteredErrors.filter(error => error.severity === severity);
        }

        // Category filter
        if (category !== 'all') {
            filteredErrors = filteredErrors.filter(error => error.category === category);
        }

        // Search filter
        if (search) {
            const searchLower = search.toLowerCase();
            filteredErrors = filteredErrors.filter(error => 
                error.message.toLowerCase().includes(searchLower) ||
                error.exception.toLowerCase().includes(searchLower)
            );
        }

        // Pagination
        const startIndex = (parseInt(page) - 1) * parseInt(limit);
        const endIndex = startIndex + parseInt(limit);
        const paginatedErrors = filteredErrors.slice(startIndex, endIndex);

        // Generate summary statistics
        const summary = generateErrorSummary(filteredErrors);

        res.json({
            success: true,
            errors: paginatedErrors,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: filteredErrors.length,
                totalPages: Math.ceil(filteredErrors.length / parseInt(limit))
            },
            summary,
            filters: {
                hours: parseInt(hours),
                severity,
                category,
                search
            }
        });

    } catch (error) {
        console.error('Error fetching Neo4j errors:', error);
        res.status(500).json({
            error: 'Failed to fetch Neo4j errors',
            details: error.message
        });
    }
}

/**
 * Parse a log file and extract error entries
 */
async function parseLogFile(logPath, hours) {
    const errors = [];
    const cutoffTime = new Date(Date.now() - (hours * 60 * 60 * 1000));

    try {
        // Use tail to get recent entries efficiently for large log files
        const tailLines = Math.max(1000, hours * 100); // Estimate lines needed
        const logContent = execSync(`tail -n ${tailLines} "${logPath}"`, { encoding: 'utf8' });
        const lines = logContent.split('\n');

        let currentError = null;
        let stackTrace = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // Parse timestamp and log level
            const logMatch = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\+\d{4}\s+(\w+)\s+(.+)$/);
            
            if (logMatch) {
                const [, timestampStr, level, message] = logMatch;
                const timestamp = new Date(timestampStr);

                // Skip entries older than cutoff
                if (timestamp < cutoffTime) continue;

                // If we were building a previous error, save it
                if (currentError) {
                    currentError.stackTrace = stackTrace.join('\n');
                    errors.push(currentError);
                    stackTrace = [];
                }

                // Check if this is an error/warning line
                if (['ERROR', 'WARN', 'FATAL'].includes(level)) {
                    currentError = {
                        timestamp: timestamp.toISOString(),
                        timestampFormatted: timestamp.toLocaleString(),
                        severity: mapLogLevel(level),
                        level,
                        message: message,
                        exception: extractException(message),
                        category: categorizeError(message),
                        source: path.basename(logPath),
                        stackTrace: ''
                    };
                } else {
                    currentError = null;
                }
            } else if (currentError && line.startsWith('\t')) {
                // This is likely a stack trace line
                stackTrace.push(line);
            }
        }

        // Don't forget the last error
        if (currentError) {
            currentError.stackTrace = stackTrace.join('\n');
            errors.push(currentError);
        }

    } catch (error) {
        console.error(`Error parsing log file ${logPath}:`, error);
    }

    return errors;
}

/**
 * Map Neo4j log levels to severity
 */
function mapLogLevel(level) {
    switch (level) {
        case 'FATAL': return 'critical';
        case 'ERROR': return 'error';
        case 'WARN': return 'warning';
        default: return 'info';
    }
}

/**
 * Extract exception type from error message
 */
function extractException(message) {
    // Common exception patterns
    const exceptionMatch = message.match(/([A-Za-z.]+Exception|[A-Za-z.]+Error):/);
    if (exceptionMatch) {
        return exceptionMatch[1];
    }

    // OutOfMemoryError patterns
    if (message.includes('OutOfMemoryError')) {
        return 'OutOfMemoryError';
    }

    // Connection patterns
    if (message.includes('Connection') && (message.includes('refused') || message.includes('timeout'))) {
        return 'ConnectionError';
    }

    return 'Unknown';
}

/**
 * Categorize errors by type
 */
function categorizeError(message) {
    const msgLower = message.toLowerCase();

    // Memory-related errors
    if (msgLower.includes('outofmemoryerror') || msgLower.includes('heap space') || msgLower.includes('gc overhead')) {
        return 'memory';
    }

    // Connection errors
    if (msgLower.includes('connection') || msgLower.includes('socket') || msgLower.includes('network')) {
        return 'connection';
    }

    // Query/Cypher errors
    if (msgLower.includes('cypher') || msgLower.includes('query') || msgLower.includes('syntax')) {
        return 'query';
    }

    // Transaction errors
    if (msgLower.includes('transaction') || msgLower.includes('deadlock') || msgLower.includes('lock')) {
        return 'transaction';
    }

    // APOC errors
    if (msgLower.includes('apoc') || msgLower.includes('procedure')) {
        return 'apoc';
    }

    // Index/constraint errors
    if (msgLower.includes('index') || msgLower.includes('constraint')) {
        return 'schema';
    }

    // Security errors
    if (msgLower.includes('authentication') || msgLower.includes('authorization') || msgLower.includes('security')) {
        return 'security';
    }

    // Startup/shutdown errors
    if (msgLower.includes('startup') || msgLower.includes('shutdown') || msgLower.includes('initialization')) {
        return 'lifecycle';
    }

    return 'other';
}

/**
 * Generate error summary statistics
 */
function generateErrorSummary(errors) {
    const summary = {
        total: errors.length,
        bySeverity: {},
        byCategory: {},
        byException: {},
        recentTrends: {}
    };

    // Count by severity
    errors.forEach(error => {
        summary.bySeverity[error.severity] = (summary.bySeverity[error.severity] || 0) + 1;
        summary.byCategory[error.category] = (summary.byCategory[error.category] || 0) + 1;
        summary.byException[error.exception] = (summary.byException[error.exception] || 0) + 1;
    });

    // Recent trends (last hour vs previous hours)
    const oneHourAgo = new Date(Date.now() - (60 * 60 * 1000));
    const recentErrors = errors.filter(error => new Date(error.timestamp) >= oneHourAgo);
    const olderErrors = errors.filter(error => new Date(error.timestamp) < oneHourAgo);

    summary.recentTrends = {
        lastHour: recentErrors.length,
        previousHours: olderErrors.length,
        trend: recentErrors.length > olderErrors.length ? 'increasing' : 
               recentErrors.length < olderErrors.length ? 'decreasing' : 'stable'
    };

    return summary;
}

module.exports = {
    getNeo4jErrors
};

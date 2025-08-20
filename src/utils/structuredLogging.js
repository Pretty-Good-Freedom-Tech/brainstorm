#!/usr/bin/env node

/**
 * Structured Logging Utility Library for Node.js
 * Provides consistent, parseable logging and event emission across all Brainstorm Node.js scripts
 * 
 * This is the Node.js equivalent of structuredLogging.sh
 * 
 * Usage:
 *   const { emitTaskEvent } = require('./structuredLogging.js');
 *   await emitTaskEvent('TASK_START', 'taskName', 'target', { customerId: 'abc123' });
 */

const fs = require('fs');
const path = require('path');

// Configuration (matches bash version)
const BRAINSTORM_STRUCTURED_LOGGING = process.env.BRAINSTORM_STRUCTURED_LOGGING || 'true';
const BRAINSTORM_HUMAN_LOGS = process.env.BRAINSTORM_HUMAN_LOGS || 'true';
const BRAINSTORM_HUMAN_LOG_VERBOSITY = process.env.BRAINSTORM_HUMAN_LOG_VERBOSITY || 'NORMAL';
const BRAINSTORM_EVENTS_MAX_SIZE = parseInt(process.env.BRAINSTORM_EVENTS_MAX_SIZE || '100000');

// Get log directory from environment or default
const BRAINSTORM_LOG_DIR = process.env.BRAINSTORM_LOG_DIR || '/var/log/brainstorm';
const TASK_QUEUE_DIR = path.join(BRAINSTORM_LOG_DIR, 'taskQueue');
const EVENTS_FILE = path.join(TASK_QUEUE_DIR, 'events.jsonl');
const STRUCTURED_LOG_FILE = path.join(TASK_QUEUE_DIR, 'structured.log');

/**
 * Ensure logging directories exist
 */
function ensureLoggingDirs() {
    try {
        // Create directories if they don't exist
        fs.mkdirSync(TASK_QUEUE_DIR, { recursive: true });
        
        // Ensure log files exist
        if (!fs.existsSync(EVENTS_FILE)) {
            fs.writeFileSync(EVENTS_FILE, '', { flag: 'a' });
        }
        if (!fs.existsSync(STRUCTURED_LOG_FILE)) {
            fs.writeFileSync(STRUCTURED_LOG_FILE, '', { flag: 'a' });
        }
        
        // Try to fix ownership if we have sudo access (matches bash version)
        try {
            const { execSync } = require('child_process');
            execSync('sudo -n true', { stdio: 'ignore' });
            execSync(`sudo chown brainstorm:brainstorm "${EVENTS_FILE}" "${STRUCTURED_LOG_FILE}"`, { stdio: 'ignore' });
        } catch (error) {
            // Ignore ownership errors - not critical
        }
    } catch (error) {
        console.error('Warning: Failed to ensure logging directories:', error.message);
    }
}

/**
 * Get ISO timestamp (matches bash version)
 */
function getIsoTimestamp() {
    return new Date().toISOString();
}

/**
 * Get script name from call stack
 */
function getScriptName() {
    try {
        const stack = new Error().stack;
        const lines = stack.split('\n');
        
        // Look for the first line that contains a file path (not this file)
        for (let i = 2; i < lines.length; i++) {
            const match = lines[i].match(/\(([^)]+)\)/);
            if (match && match[1] && !match[1].includes('structuredLogging.js')) {
                return path.basename(match[1]);
            }
        }
        
        // Fallback: try to get from process.argv
        if (process.argv[1]) {
            return path.basename(process.argv[1]);
        }
        
        return 'unknown';
    } catch (error) {
        return 'unknown';
    }
}

/**
 * Check if events file needs rotation
 */
function rotateEventsFileIfNeeded() {
    try {
        if (!fs.existsSync(EVENTS_FILE)) return;
        
        const stats = fs.statSync(EVENTS_FILE);
        const content = fs.readFileSync(EVENTS_FILE, 'utf8');
        const lineCount = content.split('\n').filter(line => line.trim()).length;
        
        if (lineCount > BRAINSTORM_EVENTS_MAX_SIZE) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = path.join(TASK_QUEUE_DIR, `events-${timestamp}.jsonl`);
            
            // Move current file to backup
            fs.renameSync(EVENTS_FILE, backupFile);
            
            // Create new empty events file
            fs.writeFileSync(EVENTS_FILE, '');
            
            console.log(`Rotated events file to ${backupFile}`);
        }
    } catch (error) {
        console.error('Warning: Failed to rotate events file:', error.message);
    }
}

/**
 * Check if human log should be written based on verbosity settings
 */
function shouldWriteHumanLog(eventType, logLevel) {
    if (BRAINSTORM_HUMAN_LOGS !== 'true') return false;
    
    const verbosity = BRAINSTORM_HUMAN_LOG_VERBOSITY;
    
    // MINIMAL: Only errors and critical task events
    if (verbosity === 'MINIMAL') {
        return eventType === 'TASK_ERROR' || eventType === 'TASK_START' || eventType === 'TASK_END';
    }
    
    // NORMAL: Most events except verbose PROGRESS events
    if (verbosity === 'NORMAL') {
        return eventType !== 'PROGRESS' || eventType === 'TASK_ERROR' || eventType === 'TASK_START' || eventType === 'TASK_END';
    }
    
    // VERBOSE: All events
    return true;
}

/**
 * Write human-readable log message
 */
function writeHumanLog(level, message, context = '') {
    if (!shouldWriteHumanLog('INFO', level)) return;
    
    try {
        const timestamp = getIsoTimestamp();
        const contextStr = context ? ` ${context}` : '';
        const logLine = `${timestamp} [${level}] ${message}${contextStr}\n`;
        
        fs.appendFileSync(STRUCTURED_LOG_FILE, logLine);
    } catch (error) {
        console.error('Warning: Failed to write human log:', error.message);
    }
}

/**
 * Emit a structured task event (Node.js equivalent of bash emit_task_event)
 * 
 * @param {string} eventType - Type of event (TASK_START, TASK_END, PROGRESS, TASK_ERROR)
 * @param {string} taskName - Name of the task
 * @param {string} target - Target identifier (customer pubkey, "system", etc.)
 * @param {object} metadata - Metadata object (will be JSON stringified)
 */
async function emitTaskEvent(eventType, taskName, target = '', metadata = {}) {
    try {
        // Skip if structured logging is disabled
        if (BRAINSTORM_STRUCTURED_LOGGING !== 'true') {
            return;
        }
        
        // Ensure directories exist
        ensureLoggingDirs();
        
        // Get event details
        const timestamp = getIsoTimestamp();
        const scriptName = getScriptName();
        const pid = process.pid;
        
        // Ensure metadata is an object and compact it
        let metadataJson;
        try {
            if (typeof metadata === 'object' && metadata !== null) {
                metadataJson = JSON.stringify(metadata);
            } else {
                metadataJson = '{}';
            }
        } catch (error) {
            console.error('Warning: Failed to stringify metadata, using empty object:', error.message);
            metadataJson = '{}';
        }
        
        // Create event JSON as single line for JSONL format (matches bash version)
        const eventJson = {
            timestamp,
            eventType,
            taskName,
            target,
            metadata: JSON.parse(metadataJson), // Parse back to object for proper JSON structure
            scriptName,
            pid
        };
        
        // Write to events file as single line JSON
        const eventLine = JSON.stringify(eventJson) + '\n';
        fs.appendFileSync(EVENTS_FILE, eventLine);
        
        // Rotate events file if needed
        rotateEventsFileIfNeeded();
        
        // Also log as human-readable message (respecting verbosity settings)
        if (shouldWriteHumanLog(eventType, 'INFO')) {
            writeHumanLog('INFO', `Task event: ${eventType} ${taskName}`, `target=${target} pid=${pid}`);
        }
        
    } catch (error) {
        console.error('Warning: Failed to emit task event:', error.message);
    }
}

/**
 * Log a structured message (Node.js equivalent of bash log_structured)
 */
function logStructured(level, message, context = '') {
    try {
        const timestamp = getIsoTimestamp();
        const scriptName = getScriptName();
        const pid = process.pid;
        
        // Write to console
        console.log(`${timestamp} [${level}] ${message} ${context}`);
        
        // Write to human log if enabled
        writeHumanLog(level, message, context);
        
    } catch (error) {
        console.error('Warning: Failed to log structured message:', error.message);
    }
}

module.exports = {
    emitTaskEvent,
    logStructured,
    ensureLoggingDirs,
    getIsoTimestamp
};

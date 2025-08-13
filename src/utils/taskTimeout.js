/**
 * Shared Task Timeout and Configuration Resolution
 * Unified logic for both API handlers and orchestrator task execution
 */

const fs = require('fs');
const path = require('path');

/**
 * Load task registry from standard location
 */
async function getTaskRegistry() {
    const registryPath = path.join(__dirname, '../manage/taskQueue/taskRegistry.json');
    if (!fs.existsSync(registryPath)) {
        throw new Error('Task registry not found');
    }
    
    const registryData = fs.readFileSync(registryPath, 'utf8');
    return JSON.parse(registryData);
}

/**
 * Resolve task timeout using hierarchical configuration
 * Priority: task-specific > global default > averageDuration > fallback
 * 
 * @param {Object} task - Task object from registry
 * @param {Object} registry - Full task registry object
 * @param {Object} options - Additional options
 * @returns {Object} Timeout configuration with source info
 */
function resolveTaskTimeout(task, registry, options = {}) {
    const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes default
    const MIN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes minimum
    const MAX_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours maximum
    
    let timeoutMs = DEFAULT_TIMEOUT_MS;
    let timeoutSource = 'default';
    let forceKill = false;
    let additionalConfig = {};
    
    // Priority 1: Check task-specific completion timeout configuration
    if (task.completion && task.completion.failure && task.completion.failure.timeout) {
        const timeoutConfig = task.completion.failure.timeout;
        if (timeoutConfig.duration) {
            timeoutMs = timeoutConfig.duration;
            timeoutSource = 'task-specific registry config';
            forceKill = timeoutConfig.forceKill || false;
            additionalConfig = {
                restart: timeoutConfig.restart,
                maxRetries: timeoutConfig.maxRetries,
                parentNextStep: timeoutConfig.parentNextStep
            };
        }
    }
    // Priority 2: Check global default completion timeout configuration
    else if (registry.completion_default && registry.completion_default.failure && registry.completion_default.failure.timeout) {
        const timeoutConfig = registry.completion_default.failure.timeout;
        if (timeoutConfig.duration) {
            timeoutMs = timeoutConfig.duration;
            timeoutSource = 'global registry default';
            forceKill = timeoutConfig.forceKill || false;
            additionalConfig = {
                restart: timeoutConfig.restart,
                maxRetries: timeoutConfig.maxRetries,
                parentNextStep: timeoutConfig.parentNextStep
            };
        }
    }
    // Priority 3: Use averageDuration with buffer
    else if (task.averageDuration) {
        // Add 100% buffer for safety (e.g., 4 minute task gets 8 minute timeout)
        timeoutMs = Math.round(task.averageDuration * 2);
        timeoutSource = 'averageDuration with 100% buffer';
    }
    
    // Override with enforced timeout if specified (legacy support)
    if (task.enforcedTimeout) {
        timeoutMs = task.enforcedTimeout;
        timeoutSource = 'enforced timeout (legacy)';
    }
    
    // Apply options overrides
    if (options.minTimeout) {
        timeoutMs = Math.max(timeoutMs, options.minTimeout);
    }
    if (options.maxTimeout) {
        timeoutMs = Math.min(timeoutMs, options.maxTimeout);
    }
    
    // Enforce global min/max bounds
    const boundedTimeout = Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, timeoutMs));
    
    return {
        timeoutMs: boundedTimeout,
        timeoutSeconds: Math.round(boundedTimeout / 1000),
        timeoutMinutes: Math.round(boundedTimeout / 60000),
        timeoutHours: Math.round(boundedTimeout / 3600000),
        source: timeoutSource,
        forceKill,
        additionalConfig,
        wasAdjusted: boundedTimeout !== timeoutMs
    };
}

/**
 * Resolve completion scenario configuration for a task
 * Used by orchestrators for error handling decisions
 * 
 * @param {Object} task - Task object from registry
 * @param {Object} registry - Full task registry object
 * @param {string} scenario - Scenario type (success, timeout, caught, uncaught)
 * @returns {Object} Completion scenario configuration
 */
function resolveCompletionScenario(task, registry, scenario) {
    let config = {};
    
    // Start with global defaults
    if (registry.completion_default && registry.completion_default[scenario]) {
        config = { ...registry.completion_default[scenario] };
    }
    
    // Override with task-specific config
    if (task.completion && task.completion[scenario]) {
        config = { ...config, ...task.completion[scenario] };
    }
    
    return config;
}

/**
 * Determine if a task should use async execution (non-blocking API response)
 * Based on timeout duration and task characteristics
 * 
 * @param {Object} timeoutConfig - Result from resolveTaskTimeout
 * @param {Object} task - Task object from registry
 * @returns {Object} Execution mode recommendation
 */
function determineExecutionMode(timeoutConfig, task) {
    const ASYNC_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
    const isLongRunning = timeoutConfig.timeoutMs > ASYNC_THRESHOLD_MS;
    const isOrchestrator = task.categories && task.categories.includes('orchestrator');
    const hasChildren = task.children && task.children.length > 0;
    
    return {
        shouldRunAsync: isLongRunning || isOrchestrator || hasChildren,
        reason: isLongRunning ? 'long timeout' : 
                isOrchestrator ? 'orchestrator task' :
                hasChildren ? 'has child tasks' : 'short duration',
        recommendedApiTimeout: Math.min(timeoutConfig.timeoutMs, ASYNC_THRESHOLD_MS),
        taskTimeout: timeoutConfig.timeoutMs
    };
}

/**
 * Format timeout information for logging
 * 
 * @param {Object} timeoutConfig - Result from resolveTaskTimeout
 * @param {string} taskName - Name of the task
 * @returns {string} Formatted log message
 */
function formatTimeoutLog(timeoutConfig, taskName) {
    const { timeoutMs, timeoutMinutes, source, wasAdjusted } = timeoutConfig;
    const adjustedNote = wasAdjusted ? ' (adjusted to bounds)' : '';
    return `Task ${taskName} timeout: ${timeoutMs}ms (${timeoutMinutes} minutes) from ${source}${adjustedNote}`;
}

module.exports = {
    getTaskRegistry,
    resolveTaskTimeout,
    resolveCompletionScenario,
    determineExecutionMode,
    formatTimeoutLog
};

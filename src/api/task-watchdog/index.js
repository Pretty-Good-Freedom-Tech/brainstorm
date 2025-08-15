const express = require('express');
const router = express.Router();

// Import handler functions with explicit .js extensions
const { handleTaskWatchdogStatus } = require('./queries/status.js');
const { handleTaskWatchdogAlerts } = require('./queries/alerts.js');
const { handleStuckTasks } = require('./queries/stuck-tasks.js');
const { handleOrphanedProcesses } = require('./queries/orphaned-processes.js');

// Export handlers for registration in main API
module.exports = {
    handleTaskWatchdogStatus,
    handleTaskWatchdogAlerts,
    handleStuckTasks,
    handleOrphanedProcesses
};

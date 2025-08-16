/**
 * Service Management API Module
 * Provides endpoints for monitoring and controlling Brainstorm services
 */

const statusHandler = require('./queries/status.js');
const controlHandler = require('./queries/control.js');
const logsHandler = require('./queries/logs.js');

module.exports = {
    handleServiceStatus: statusHandler.handleServiceStatus,
    handleServiceControl: controlHandler.handleServiceControl,
    handleServiceLogs: logsHandler.handleServiceLogs
};

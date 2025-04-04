/**
 * Service Control Commands
 * Handles operations to control systemd services (start/stop/restart)
 */

const { execSync } = require('child_process');

/**
 * Control a systemd service
 * @param {string} serviceName - Name of the service to control
 * @param {string} action - Action to perform (start, stop, restart)
 * @returns {Object} - Result of the operation
 */
function controlService(serviceName, action) {
  try {
    execSync(`sudo systemctl ${action} ${serviceName}`);
    return { success: true, message: `Service ${serviceName} ${action} successful` };
  } catch (error) {
    return { success: false, message: `Failed to ${action} ${serviceName}: ${error.message}` };
  }
}

/**
 * Handler for systemd service control
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleSystemdServicesreq, res) {
  // Note: Authentication is now handled by the authMiddleware in src/api/auth/authHandler.js
  // The middleware ensures that only the owner can access this endpoint
  
  const validServices = [
    'neo4j',
    'strfry',
    'hasenpfeffr-control-panel',
    'strfry-router',
    'addToQueue',
    'processQueue',
    'reconcile.timer',
    'processAllTasks.timer',
    'calculateHops.timer',
    'calculatePersonalizedPageRank.timer',
    'calculatePersonalizedGrapeRank.timer'
  ];
  
  const action = req.query.action;
  const service = req.query.service;
  
  // Validate input parameters
  if (!action) {
    return res.status(400).json({ error: 'Missing action parameter' });
  }
  
  if (!service) {
    return res.status(400).json({ error: 'Missing service parameter' });
  }
  
  // Validate service name
  if (!validServices.includes(service)) {
    return res.status(400).json({ error: `Invalid service: ${service}` });
  }
  
  // Validate action
  if (!['start', 'stop', 'restart'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action. Use start, stop, or restart.' });
  }
  
  // Perform the requested action
  const result = controlService(service, action);
  return res.json(result);
}

module.exports = {
  handleSystemdServices,
  controlService
};

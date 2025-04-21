/**
 * Service Status Queries
 * Handles retrieval of systemd service status information
 */

const { execSync } = require('child_process');

/**
 * Get status of a systemd service
 * @param {string} serviceName - Name of the service to check
 * @returns {string} - Status of the service (active or inactive)
 */
function getServiceStatus(serviceName) {
  try {
    const result = execSync(`sudo systemctl is-active ${serviceName}`).toString().trim();
    return result === 'active' ? 'active' : 'inactive';
  } catch (error) {
    return 'inactive';
  }
}

/**
 * Handler for getting systemd service status
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleServiceStatus(req, res) {
  const services = [
    'neo4j',
    'strfry',
    'brainstorm-control-panel',
    'strfry-router',
    'addToQueue',
    'processQueue',
    'processAllTasks',
    'reconcile.timer',
    'processAllTasks.timer',
    'calculateHops.timer',
    'calculatePersonalizedPageRank.timer',
    'calculatePersonalizedGrapeRank.timer'
  ];
  
  // If a specific service is requested, get only that service's status
  const service = req.query.service;
  if (service) {
    if (services.includes(service)) {
      return res.json({
        services: {
          [service]: getServiceStatus(service)
        }
      });
    } else {
      return res.status(400).json({
        error: `Invalid service: ${service}`
      });
    }
  }
  
  // Otherwise, return status of all services
  const statuses = {};
  for (const service of services) {
    statuses[service] = getServiceStatus(service);
  }
  
  res.json({ services: statuses });
}

module.exports = {
  handleServiceStatus,
  getServiceStatus
};

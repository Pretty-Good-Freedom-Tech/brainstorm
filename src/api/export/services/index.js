/**
 * Services API Module
 * Exports service management related operation handlers
 */

const { handleServiceStatus } = require('./queries/status');
const { handleSystemdServices } = require('./commands/control');

// Export handlers directly - this allows the central router 
// to register endpoints without creating multiple routers
module.exports = {
    // Queries (read operations)
    handleServiceStatus,
    
    // Commands (write operations)
    handleSystemdServices
};

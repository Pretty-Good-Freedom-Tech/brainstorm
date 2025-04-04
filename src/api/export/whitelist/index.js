/**
 * Whitelist API Module
 * Exports whitelist configuration-related operation handlers
 */

const { handleGetWhitelistConfig } = require('./queries/config');
const { handleUpdateWhitelistConfig } = require('./commands/update-config');
const { handleExportWhitelist } = require('./commands/export');

// Export handlers directly - this allows the central router 
// to register endpoints without creating multiple routers
module.exports = {
    // Queries (read operations)
    handleGetWhitelistConfig,
    
    // Commands (write operations)
    handleUpdateWhitelistConfig,
    handleExportWhitelist
};

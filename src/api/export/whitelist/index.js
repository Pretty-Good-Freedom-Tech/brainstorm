/**
 * Whitelist API Module
 * Exports whitelist configuration-related operation handlers
 */

const { handleGetWhitelistConfig } = require('./queries/config');
const { handleUpdateWhitelistConfig } = require('./commands/update-config');
const { handleExportWhitelist } = require('./commands/export');
const { handleGetWhitelist } = require('./queries/getWhitelist');

// Export handlers directly - this allows the central router 
// to register endpoints without creating multiple routers
module.exports = {
    // Queries (read operations)
    handleGetWhitelistConfig,
    handleGetWhitelist,
    
    // Commands (write operations)
    handleUpdateWhitelistConfig,
    handleExportWhitelist
};

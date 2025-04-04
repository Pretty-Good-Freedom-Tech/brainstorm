/**
 * Blacklist API Module
 * Exports blacklist configuration-related operation handlers
 */

const { handleGetBlacklistConfig } = require('./queries/config');
const { handleUpdateBlacklistConfig } = require('./commands/update-config');
const { handleGenerateBlacklist } = require('./commands/generate');

// Export handlers directly - this allows the central router 
// to register endpoints without creating multiple routers
module.exports = {
    // Queries (read operations)
    handleGetBlacklistConfig,
    
    // Commands (write operations)
    handleUpdateBlacklistConfig,
    handleGenerateBlacklist
};

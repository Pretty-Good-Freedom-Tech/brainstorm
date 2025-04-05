/**
 * Lists API Module
 * Exports all list related endpoint handlers
 */

// Import query handlers
const { 
    handleGetWhitelistStats,
    handleGetBlacklistCount,
    handleGetWhitelistPreviewCount
} = require('./queries');

module.exports = {
    // Query handlers
    handleGetWhitelistStats,
    handleGetBlacklistCount,
    handleGetWhitelistPreviewCount
};

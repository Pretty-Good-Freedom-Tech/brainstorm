/**
 * Algorithms API Module
 * Exports handlers for various graph algorithm operations
 */

const { handleGetRecentlyActivePubkeys } = require('./queries/recentlyActivePubkeys');

// Export modules directly with their namespaces
module.exports = {
    handleGetRecentlyActivePubkeys
};

/**
 * PageRank API Module
 * Exports handlers for PageRank algorithm operations
 */

const { handleGenerateVerifiedFollowers } = require('./commands/generate');

// Export handlers directly - this allows the central router to register endpoints
module.exports = {
    // Commands (write operations)
    handleGenerateVerifiedFollowers
};

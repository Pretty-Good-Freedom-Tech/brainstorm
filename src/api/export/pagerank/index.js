/**
 * PageRank API Module
 * Exports PageRank generation related operation handlers
 */

const { handleGeneratePageRank } = require('./commands/generate');

// Export handlers directly - this allows the central router 
// to register endpoints without creating multiple routers
module.exports = {
    // Commands (write operations)
    handleGeneratePageRank
};

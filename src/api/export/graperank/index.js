/**
 * GrapeRank API Module
 * Exports GrapeRank configuration-related operation handlers
 */

const { handleGetGrapeRankConfig } = require('./queries/config');
const { handleUpdateGrapeRankConfig } = require('./commands/update-config');

// Export handlers directly - this allows the central router 
// to register endpoints without creating multiple routers
module.exports = {
    // Queries (read operations)
    handleGetGrapeRankConfig,
    
    // Commands (write operations)
    handleUpdateGrapeRankConfig
};

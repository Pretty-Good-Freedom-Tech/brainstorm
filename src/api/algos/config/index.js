/**
 * Configuration API Module
 * Exports handlers for algorithm configuration management
 */

const { handleUpdateGrapeRankConfig } = require('./commands/graperank');
const { handleGetGrapeRankConfig } = require('./queries/graperank');

// Export handlers directly - this allows the central router to register endpoints
module.exports = {
    // Commands (write operations)
    handleUpdateGrapeRankConfig,
    
    // Queries (read operations)
    handleGetGrapeRankConfig
};

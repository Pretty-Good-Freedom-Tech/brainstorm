/**
 * Configuration API Module
 * Exports handlers for algorithm configuration management
 * handleUpdateConfig and handleGetConfig will be generalized versions of 
 * handleUpdateGrapeRankConfig and handleGetGrapeRankConfig, capable of handling
 * any algorithm configuration. Eventually, we will deprecate the 
 * handleUpdateGrapeRankConfig and handleGetGrapeRankConfig handlers.
 */

const { handleUpdateGrapeRankConfig } = require('./commands/graperank');
const { handleGetGrapeRankConfig } = require('./queries/graperank');
const { handleUpdateConfig } = require('./commands/index');
const { handleGetConfig } = require('./queries/index');

// Export handlers directly - this allows the central router to register endpoints
module.exports = {
    // Commands (write operations)
    handleUpdateGrapeRankConfig,
    handleUpdateConfig,
    
    // Queries (read operations)
    handleGetGrapeRankConfig,
    handleGetConfig
};

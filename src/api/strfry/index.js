/**
 * Strfry API Module
 * Exports strfry-related operation handlers
 */

const { handleGetPluginStatus } = require('./queries/plugin');
const { handleToggleStrfryPlugin } = require('./commands/toggle');

// Export handlers directly - this allows the central router to register endpoints
module.exports = {
    // Queries (read operations)
    handleGetPluginStatus,
    
    // Commands (write operations)
    handleToggleStrfryPlugin
};

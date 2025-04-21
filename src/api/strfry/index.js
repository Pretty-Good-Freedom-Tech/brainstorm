/**
 * Strfry API Module
 * Exports strfry-related operation handlers
 */

const { handleGetFilteredContentStatus } = require('./queries/filteredContent');
const { handleToggleStrfryPlugin } = require('./commands/toggle');

// Export handlers directly - this allows the central router to register endpoints
module.exports = {
    // Queries (read operations)
    handleGetFilteredContentStatus,
    
    // Commands (write operations)
    handleToggleStrfryPlugin
};

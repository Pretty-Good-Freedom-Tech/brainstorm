/**
 * Strfry API Module
 * Exports strfry-related operation handlers
 */

const { handleStrfryPlugin } = require('./queries/plugin');

// Export handlers directly - this allows the central router to register endpoints
module.exports = {
    // Queries (read operations)
    handleStrfryPlugin
};

/**
 * Search API Module
 * Exports search operation handlers
 */

const { handleOldSearchProfiles } = require('./profiles');

// Export handlers directly - this allows the central router to register endpoints
module.exports = {
    // Commands (write operations)
    handleOldSearchProfiles
};

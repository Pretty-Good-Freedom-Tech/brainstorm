/**
 * Search API Module
 * Exports search operation handlers
 */

const { handleSearchProfiles } = require('./profiles');

// Export handlers directly - this allows the central router to register endpoints
module.exports = {
    // Commands (write operations)
    handleSearchProfiles
};

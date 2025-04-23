/**
 * Reports API Module
 * Exports handlers for Reports algorithm operations
 */

const { handleGenerateReports } = require('./commands/generate');

// Export handlers directly - this allows the central router to register endpoints
module.exports = {
    // Commands (write operations)
    handleGenerateReports
};

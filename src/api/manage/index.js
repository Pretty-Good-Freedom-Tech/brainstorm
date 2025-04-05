/**
 * Management API Module
 * Exports handlers for various management operations
 */

const negentropySync = require('./negentropySync');

// Export handlers directly - this allows the central router to register endpoints
module.exports = {
    // Re-export negentropySync module handlers
    ...negentropySync
};

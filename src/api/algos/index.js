/**
 * Algorithms API Module
 * Exports handlers for various graph algorithm operations
 */

const hops = require('./hops');

// Export handlers directly - this allows the central router to register endpoints
module.exports = {
    // Re-export hops module handlers
    ...hops
};

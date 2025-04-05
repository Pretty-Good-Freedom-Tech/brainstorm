/**
 * Algorithms API Module
 * Exports handlers for various graph algorithm operations
 */

const hops = require('./hops');
const pagerank = require('./pagerank');

// Export handlers directly - this allows the central router to register endpoints
module.exports = {
    // Re-export hops module handlers
    ...hops,

    // Re-export pagerank module handlers
    ...pagerank
};

/**
 * Hops API Module
 * Exports handlers for Nostr social graph hops calculation
 */

const { handleCalculateHops } = require('./commands/calculate');
const { handleGetHopsCount } = require('./queries/hops-count');

// Export handlers directly - this allows the central router to register endpoints
module.exports = {
    // Commands (write operations)
    handleCalculateHops,
    
    // Queries (read operations)
    handleGetHopsCount
};

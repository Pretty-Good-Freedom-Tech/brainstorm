/**
 * Calculation History API Module
 * Exports handlers for calculation history operations
 */

const { handleGetHistoryHops } = require('./queries/hops');
const { handleGetHistoryPersonalizedPageRank } = require('./queries/personalizedPageRank');

// Export handlers directly - this allows the central router to register endpoints
module.exports = {
    // Read (read operations)
    handleGetHistoryHops,
    handleGetHistoryPersonalizedPageRank
};
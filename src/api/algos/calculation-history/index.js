/**
 * Calculation History API Module
 * Exports handlers for calculation history operations
 */

const { handleGetHistoryHops } = require('./queries/hops');
const { handleGetHistoryPersonalizedPageRank } = require('./queries/personalizedPageRank');
const { handleGetHistoryPersonalizedGrapeRank } = require('./queries/personalizedGrapeRank');
const { handleGetHistoryKind30382Export } = require('./queries/kind30382Export');

// Export handlers directly - this allows the central router to register endpoints
module.exports = {
    // Read (read operations)
    handleGetHistoryHops,
    handleGetHistoryPersonalizedPageRank,
    handleGetHistoryPersonalizedGrapeRank,
    handleGetHistoryKind30382Export
};
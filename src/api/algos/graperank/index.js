/**
 * GrapeRank API Module
 * Exports handlers for GrapeRank algorithm operations
 */

const { handleGenerateGrapeRank } = require('./commands/generate');
const { handleGetInfluenceCount } = require('./queries');

// Export handlers directly - this allows the central router to register endpoints
module.exports = {
    // Commands (write operations)
    handleGenerateGrapeRank,
    
    // Queries (read operations)
    handleGetInfluenceCount
};

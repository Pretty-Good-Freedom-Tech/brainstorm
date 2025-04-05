/**
 * Status API Module
 * Exports handlers for all status-related endpoints
 */

const { 
    handleStatus,
    handleStrfryStats,
    handleNeo4jStatus,
    handleCalculationStatus
} = require('./queries');

module.exports = {
    // Queries (read operations)
    handleStatus,
    handleStrfryStats,
    handleNeo4jStatus,
    handleCalculationStatus
};

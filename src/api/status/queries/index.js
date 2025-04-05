/**
 * Status Queries index file
 * Exports all status query-related handlers
 */

const { handleStatus } = require('./system');
const { handleStrfryStats } = require('./strfry');
const { handleNeo4jStatus } = require('./neo4j');
const { handleCalculationStatus } = require('./calculation');

module.exports = {
    handleStatus,
    handleStrfryStats,
    handleNeo4jStatus,
    handleCalculationStatus
};

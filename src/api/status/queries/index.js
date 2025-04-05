/**
 * Status Queries index file
 * Exports all status query-related handlers
 */

const { handleStatus } = require('./system');
const { handleStrfryStats } = require('./strfry');
const { handleNeo4jStatus } = require('./neo4j');
const { handleCalculationStatus } = require('./calculation');
const { handleGetNeo4jConstraintsStatus } = require('./neo4j-constraints');

module.exports = {
    handleStatus,
    handleStrfryStats,
    handleNeo4jStatus,
    handleCalculationStatus,
    handleGetNeo4jConstraintsStatus
};

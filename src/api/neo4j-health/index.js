/**
 * Neo4j Health API Module
 * Neo4j health monitoring operation handlers
 */

const { handleCompleteNeo4jHealth } = require('./queries/complete-neo4j-health.js');
const { handleAlertsNeo4jHealth } = require('./queries/alerts-neo4j-health.js');
const { handleHeapNeo4jHealth } = require('./queries/heap-neo4j-health.js');
const { handleServiceNeo4jHealth } = require('./queries/service-neo4j-health.js');

// Export handlers directly - this allows the central router 
// to register endpoints without creating multiple routers
module.exports = {
    // Queries (read operations)
    handleCompleteNeo4jHealth,
    handleAlertsNeo4jHealth,
    handleHeapNeo4jHealth,
    handleServiceNeo4jHealth
};

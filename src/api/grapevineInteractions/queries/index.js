/**
 * Grapevine Interactions Queries
 * Handles retrieval of Grapevine interaction data from Neo4j
 */

const neo4j = require('neo4j-driver');
const { getConfigFromFile } = require('../../../utils/config');

/**
 * Get detailed data for a specific Grapevine interaction
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleGetGrapevineInteraction(req, res) {
  try {
    // expected parameters: observer, observee, and interactionType
    const observer = req.query.observer;
    const observee = req.query.observee;
    const interactionType = req.query.interactionType;

    if (!observer || !observee || !interactionType) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: observer, observee, and interactionType'
      });
    }

    // --- FIX: Use require to load cypherQueries.js as a module, not as text ---
    const { cypherQueries } = require('./cypherQueries.js');

    // Find the cypher query object for the requested interactionType
    const queryObj = cypherQueries.find(q => q.interactionType === interactionType);
    if (!queryObj) {
      return res.status(400).json({
        success: false,
        message: `Invalid interactionType: ${interactionType}`
      });
    }
    const cypherQuery = queryObj.cypherQuery;

    // Create Neo4j driver
    const neo4jUri = getConfigFromFile('NEO4J_URI', 'bolt://localhost:7687');
    const neo4jUser = getConfigFromFile('NEO4J_USER', 'neo4j');
    const neo4jPassword = getConfigFromFile('NEO4J_PASSWORD', 'neo4j');
    const driver = neo4j.driver(
      neo4jUri,
      neo4j.auth.basic(neo4jUser, neo4jPassword)
    );
    const session = driver.session();

    // Execute the cypher query
    session.run(cypherQuery, { observer, observee })
      .then(result => {
        session.close();
        driver.close();
        // Parse the Neo4j results for clean output
        const data = result.records.map(record => {
          // Neo4j integer objects have .toNumber(), otherwise return as is
          let hops = record.get('hops');
          if (hops && typeof hops.toNumber === 'function') {
            hops = hops.toNumber();
          } else if (typeof hops === 'object' && hops !== null && typeof hops.low === 'number') {
            // If it's the neo4j-driver integer object (pre .toNumber()), combine low/high
            hops = hops.low;
          }
          return {
            pubkey: record.get('pubkey') ?? null,
            hops: hops ?? null,
            influence: record.get('influence') ?? null
          };
        });
        res.json({ success: true, data });
      })
      .catch(error => {
        session.close();
        driver.close();
        res.status(500).json({ success: false, message: error.message });
      });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  handleGetGrapevineInteraction
};

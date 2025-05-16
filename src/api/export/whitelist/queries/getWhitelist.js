/**
 * Whitelist Queries
 * Handles retrieval of whitelist directly from Neo4j
 * default criteria: influence > 0.01
 * TODO: accept params:
 * - minInfluence
 * - maxInfluence
 * - minPageRank
 * - maxPageRank
 * - minHops
 * - maxHops
 */

const neo4j = require('neo4j-driver');
const { getConfigFromFile } = require('../../../../utils/config');

/**
 * Get whitelist configuration
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleGetWhitelist(req, res) {
  try {
    // Create Neo4j driver
    const neo4jUri = getConfigFromFile('NEO4J_URI', 'bolt://localhost:7687');
    const neo4jUser = getConfigFromFile('NEO4J_USER', 'neo4j');
    const neo4jPassword = getConfigFromFile('NEO4J_PASSWORD', 'neo4j');
    
    const driver = neo4j.driver(
      neo4jUri,
      neo4j.auth.basic(neo4jUser, neo4jPassword)
    );

    // Build the Cypher query
    const sortBy = req.query.sortBy || 'influence';
    const sortOrder = req.query.sortOrder === 'asc' ? 'ASC' : 'DESC';

    let query = `
      MATCH (u:NostrUser)
      WHERE u.pubkey IS NOT NULL
      AND u.influence > 0.01
      RETURN u.pubkey as pubkey,
             u.influence as influence,
             u.personalizedPageRank as personalizedPageRank,
             u.hops as hops
      ORDER BY u.${sortBy} ${sortOrder}
    `;
    
    const session = driver.session();
    
    // Execute the query
    session.run(query)
      .then(result => {
        const users = result.records.map(record => {
          return {
            pubkey: record.get('pubkey'),
            influence: record.get('influence') ? parseFloat(record.get('influence').toString()) : null,
            personalizedPageRank: record.get('personalizedPageRank') ? parseFloat(record.get('personalizedPageRank').toString()) : null,
            hops: record.get('hops') ? parseInt(record.get('hops').toString()) : null
          };
        });
        
        // Close the session
        session.close();
        
        // Return the results
        return res.json({
          success: true,
          users
        });
      })
      .catch(error => {
        console.error('Error executing query:', error);
        session.close();
        return res.json({
          success: false,
          error: error.message
        });
      });
  } catch (error) {
    console.error('Error getting whitelist:', error);
    return res.json({
      success: false,
      error: error.message
    });
  }
}

module.exports = {
  handleGetWhitelist
};

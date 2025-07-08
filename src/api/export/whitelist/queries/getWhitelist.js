/**
 * Whitelist Queries
 * Handles retrieval of whitelist directly from Neo4j
 * if no pubkey is provided, return the whitelist as an array of pubkeys
 * api/get-whitelist
 * if pubkey is provided, return whether it is in the whitelist
 * api/get-whitelist?pubkey=<pubkey>
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
    // look for pubkey as a query parameter
    const queryPubkey = req.query.pubkey;

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

    let cypherQuery = `
      MATCH (u:NostrUser)
      WHERE u.pubkey IS NOT NULL
      AND u.influence > 0.01
      RETURN u.pubkey as pubkey
      ORDER BY u.${sortBy} ${sortOrder}
    `;
    
    const session = driver.session();
    
    // Execute the query
    session.run(cypherQuery)
      .then(result => {
        /*
        const users = result.records.map(record => {
          return {
            pubkey: record.get('pubkey'),
            influence: record.get('influence') ? parseFloat(record.get('influence').toString()) : null,
            personalizedPageRank: record.get('personalizedPageRank') ? parseFloat(record.get('personalizedPageRank').toString()) : null,
            hops: record.get('hops') ? parseInt(record.get('hops').toString()) : null
          };
        });
        */
        const pubkeys = result.records.map(record => {
          return record.get('pubkey');
        });
        
        // Close the session
        session.close();
        
        // If queryPubkey was not provided:
        if (!queryPubkey) {
          return res.json({
            success: true,
            data: {
              query: cypherQuery,
              numPubkeys: pubkeys.length,
              pubkeys
            }
          });
        }
        // If queryPubkey was provided, determine if it is in the whitelist
        else {
          const isWhitelisted = pubkeys.includes(queryPubkey);
          return res.json({
            success: true,
            data: {
              query: cypherQuery,
              queryPubkey,
              isWhitelisted
            }
          });
        }
        
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

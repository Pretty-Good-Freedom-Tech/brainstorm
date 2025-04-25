/**
 * Grapevine Interactions Queries
 * Handles retrieval of Grapevine interaction data from Neo4j
 */

const neo4j = require('neo4j-driver');
const { getConfigFromFile } = require('../../../../utils/config');
const fs = require('fs');
const path = require('path');

/**
 * Get detailed data for a specific Grapevine interaction
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleGetGrapevineInteraction(req, res) {
  try {
    // TODO: Implement handleGetGrapevineInteraction
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

    // for each interactionType, there will be a unique cypher query. These queries will be stored in a separate file in the same directory as this script:
    // cypherQueries.js
    const cypherQueriesPath = path.join(__dirname, 'cypherQueries.js');
    const cypherQueries = fs.readFileSync(cypherQueriesPath, 'utf-8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    // find the cypher query that matches the interactionType
    const cypherQuery = cypherQueries.find(query => query.startsWith(interactionType));
    if (!cypherQuery) {
      return res.status(400).json({
        success: false,
        message: `Invalid interactionType: ${interactionType}`
      });
    }

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
    const result = session.run(cypherQuery, { observer, observee });
    
    // Close the session and driver
    session.close();
    driver.close();
    
    // Return the result
    return res.json({
      success: true,
      data: result.records
    }); 
  } catch (error) {
    console.error('Error in handleGetGrapevineInteraction:', error);
    res.status(500).json({
      success: false,
      message: `Server error: ${error.message}`
    });
  }
}

module.exports = {
  handleGetGrapevineInteraction
};

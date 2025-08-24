/**
 * Network Proximity Queries
 * Handles retrieval of network proximity data for NostrUsers
 */

const neo4j = require('neo4j-driver');
const { getConfigFromFile } = require('../../../../utils/config');

/**
 * Get network proximity data for a user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleGetNetworkProximity(req, res) {
  try {
    // Get query parameters
    const pubkey = req.query.pubkey;
    const limit = parseInt(req.query.limit) || 50; // Default to 50 connections
    
    if (!pubkey) {
      return res.status(400).json({
        success: false,
        message: 'Missing pubkey parameter'
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
    
    // Build a simplified Cypher query to get network proximity data
    // This version is more efficient and less likely to time out
    const query = `
      // Find the central user
      MATCH (center:NostrUser {pubkey: $pubkey})
      
      // Get a limited number of relationships for each type
      // Following relationships
      OPTIONAL MATCH (center)-[f:FOLLOWS]->(following:NostrUser)
      WHERE following.hops IS NOT NULL
      WITH center, following, f
      ORDER BY following.influence DESC
      LIMIT toInteger($relationshipLimit)
      WITH center, collect({
        pubkey: following.pubkey,
        hops: following.hops,
        influence: following.influence,
        personalizedPageRank: following.personalizedPageRank,
        relationship: 'following',
        timestamp: f.timestamp
      }) AS followingNodes
      
      // Follower relationships
      OPTIONAL MATCH (follower:NostrUser)-[f2:FOLLOWS]->(center)
      WHERE follower.hops IS NOT NULL AND follower.hops < 100
      WITH center, followingNodes, follower, f2
      ORDER BY follower.influence DESC
      LIMIT toInteger($relationshipLimit)
      WITH center, followingNodes, collect({
        pubkey: follower.pubkey,
        hops: follower.hops,
        influence: follower.influence,
        personalizedPageRank: follower.personalizedPageRank,
        relationship: 'follower',
        timestamp: f2.timestamp
      }) AS followerNodes
      
      // Muting relationships
      OPTIONAL MATCH (center)-[m:MUTES]->(muted:NostrUser)
      WHERE muted.hops IS NOT NULL
      WITH center, followingNodes, followerNodes, muted, m
      ORDER BY muted.influence DESC
      LIMIT toInteger($relationshipLimit)
      WITH center, followingNodes, followerNodes, collect({
        pubkey: muted.pubkey,
        hops: muted.hops,
        influence: muted.influence,
        personalizedPageRank: muted.personalizedPageRank,
        relationship: 'muting',
        timestamp: m.timestamp
      }) AS mutingNodes
      
      // Muter relationships
      OPTIONAL MATCH (muter:NostrUser)-[m2:MUTES]->(center)
      WHERE muter.hops IS NOT NULL
      WITH center, followingNodes, followerNodes, mutingNodes, muter, m2
      ORDER BY muter.influence DESC
      LIMIT toInteger($relationshipLimit)
      WITH center, followingNodes, followerNodes, mutingNodes, collect({
        pubkey: muter.pubkey,
        hops: muter.hops,
        influence: muter.influence,
        personalizedPageRank: muter.personalizedPageRank,
        relationship: 'muter',
        timestamp: m2.timestamp
      }) AS muterNodes
      
      // Reporting relationships
      OPTIONAL MATCH (center)-[r:REPORTS]->(reported:NostrUser)
      WHERE reported.hops IS NOT NULL
      WITH center, followingNodes, followerNodes, mutingNodes, muterNodes, reported, r
      ORDER BY reported.influence DESC
      LIMIT toInteger($relationshipLimit)
      WITH center, followingNodes, followerNodes, mutingNodes, muterNodes, collect({
        pubkey: reported.pubkey,
        hops: reported.hops,
        influence: reported.influence,
        personalizedPageRank: reported.personalizedPageRank,
        relationship: 'reporting',
        timestamp: r.timestamp
      }) AS reportingNodes
      
      // Reporter relationships
      OPTIONAL MATCH (reporter:NostrUser)-[r2:REPORTS]->(center)
      WHERE reporter.hops IS NOT NULL
      WITH center, followingNodes, followerNodes, mutingNodes, muterNodes, reportingNodes, reporter, r2
      ORDER BY reporter.influence DESC
      LIMIT toInteger($relationshipLimit)
      WITH center, followingNodes, followerNodes, mutingNodes, muterNodes, reportingNodes, collect({
        pubkey: reporter.pubkey,
        hops: reporter.hops,
        influence: reporter.influence,
        personalizedPageRank: reporter.personalizedPageRank,
        relationship: 'reporter',
        timestamp: r2.timestamp
      }) AS reporterNodes
      
      // Return the central user and all connected nodes
      RETURN {
        center: {
          pubkey: center.pubkey,
          hops: center.hops,
          influence: center.influence,
          personalizedPageRank: center.personalizedPageRank,
          confidence: center.confidence
        },
        connections: {
          following: followingNodes,
          followers: followerNodes,
          muting: mutingNodes,
          muters: muterNodes,
          reporting: reportingNodes,
          reporters: reporterNodes
        }
      } AS networkData
    `;
    
    // Execute the query with a relationship limit parameter
    const relationshipLimit = Math.min(limit / 6, 20); // Divide the total limit among the 6 relationship types, max 20 per type
    
    session.run(query, { pubkey, relationshipLimit })
      .then(result => {
        if (result.records.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'User not found or has no connections'
          });
        }
        
        const networkData = result.records[0].get('networkData');
        
        // Process the data to create a D3-friendly format
        const nodes = [
          {
            id: networkData.center.pubkey,
            type: 'center',
            hops: networkData.center.hops,
            influence: networkData.center.influence,
            personalizedPageRank: networkData.center.personalizedPageRank,
            confidence: networkData.center.confidence
          }
        ];
        
        const links = [];
        const nodeMap = new Map();
        nodeMap.set(networkData.center.pubkey, true);
        
        // Process each type of connection
        Object.entries(networkData.connections).forEach(([connectionType, connections]) => {
          connections.forEach(connection => {
            // Only add each node once
            if (!nodeMap.has(connection.pubkey)) {
              nodes.push({
                id: connection.pubkey,
                type: connectionType,
                hops: connection.hops,
                influence: connection.influence,
                personalizedPageRank: connection.personalizedPageRank
              });
              nodeMap.set(connection.pubkey, true);
            }
            
            // Add the link
            const source = connectionType.endsWith('s') ? connection.pubkey : networkData.center.pubkey;
            const target = connectionType.endsWith('s') ? networkData.center.pubkey : connection.pubkey;
            
            links.push({
              source,
              target,
              type: connectionType,
              timestamp: connection.timestamp
            });
          });
        });
        
        // Limit the number of nodes if necessary
        if (nodes.length > limit + 1) { // +1 for the center node
          // Sort connections by influence and take the top ones
          const sortedNodes = nodes.slice(1).sort((a, b) => {
            return (b.influence || 0) - (a.influence || 0);
          });
          
          const topNodes = sortedNodes.slice(0, limit);
          const topNodeIds = new Set([networkData.center.pubkey, ...topNodes.map(n => n.id)]);
          
          // Filter nodes and links
          const filteredNodes = [nodes[0], ...topNodes];
          const filteredLinks = links.filter(link => 
            topNodeIds.has(link.source) && topNodeIds.has(link.target)
          );
          
          res.json({
            success: true,
            data: {
              nodes: filteredNodes,
              links: filteredLinks
            }
          });
        } else {
          res.json({
            success: true,
            data: {
              nodes,
              links
            }
          });
        }
      })
      .catch(error => {
        console.error('Error fetching network proximity data:', error);
        res.status(500).json({
          success: false,
          message: `Error fetching network proximity data: ${error.message}`
        });
      })
      .finally(() => {
        session.close();
        driver.close();
      });
  } catch (error) {
    console.error('Error in handleGetNetworkProximity:', error);
    res.status(500).json({
      success: false,
      message: `Server error: ${error.message}`
    });
  }
}

module.exports = {
  handleGetNetworkProximity
};

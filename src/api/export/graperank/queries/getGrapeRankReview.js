/**
 * GrapeRank Calculations Review Data Handler
 * Provides data for verifying GrapeRank calculations against Neo4j values
 */

const neo4j = require('neo4j-driver');
const { getConfigFromFile } = require('../../../../utils/config');

/**
 * Get GrapeRank review data for a specific pubkey
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handleGetGrapeRankReview(req, res) {
    const pubkey = req.query.pubkey;
    
    if (!pubkey) {
        return res.status(400).json({
            success: false,
            error: 'Missing pubkey parameter'
        });
    }
    
    let session = null;
    
    try {
        // Get Neo4j connection details
        const uri = getConfigFromFile('NEO4J_URI', 'bolt://localhost:7687');
        const user = getConfigFromFile('NEO4J_USER', 'neo4j');
        const password = getConfigFromFile('NEO4J_PASSWORD', '');
        
        // Check if all required config values are present
        if (!uri || !user || !password) {
            return res.status(500).json({
                success: false,
                error: 'Missing Neo4j connection configuration'
            });
        }
        
        // Create Neo4j driver and session
        const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
        session = driver.session();
        
        // First query: Get user's current GrapeRank values from Neo4j
        const neo4jValuesQuery = `
            MATCH (u:NostrUser {pubkey: $pubkey})
            RETURN 
                u.influence AS influence, 
                u.average AS average, 
                u.confidence AS confidence, 
                u.input AS input
        `;
        
        const neo4jValuesResult = await session.run(neo4jValuesQuery, { pubkey });
        
        let neo4jValues = {
            influence: 0,
            average: 0,
            confidence: 0,
            input: 0
        };
        
        if (neo4jValuesResult.records.length > 0) {
            const record = neo4jValuesResult.records[0];
            neo4jValues = {
                influence: record.get('influence') || 0,
                average: record.get('average') || 0,
                confidence: record.get('confidence') || 0,
                input: record.get('input') || 0
            };
        }
        
        // Second query: Get all ratings of this user (follows, mutes, reports)
        const ratingsQuery = `
            // Get all users following the target
            MATCH (rater:NostrUser)-[r:FOLLOWS]->(target:NostrUser {pubkey: $pubkey})
            RETURN rater.pubkey AS raterPubkey, 'FOLLOWS' AS type, rater.influence AS raterInfluence
            UNION
            // Get all users muting the target
            MATCH (rater:NostrUser)-[r:MUTES]->(target:NostrUser {pubkey: $pubkey})
            RETURN rater.pubkey AS raterPubkey, 'MUTES' AS type, rater.influence AS raterInfluence
            UNION
            // Get all users reporting the target
            MATCH (rater:NostrUser)-[r:REPORTS]->(target:NostrUser {pubkey: $pubkey})
            RETURN rater.pubkey AS raterPubkey, 'REPORTS' AS type, rater.influence AS raterInfluence
        `;
        
        const ratingsResult = await session.run(ratingsQuery, { pubkey });
        
        const ratings = ratingsResult.records.map(record => {
            return {
                raterPubkey: record.get('raterPubkey'),
                type: record.get('type'),
                raterInfluence: record.get('raterInfluence') || 0
            };
        });
        
        // Return both data sets
        return res.json({
            success: true,
            neo4jValues,
            ratings
        });
    } catch (error) {
        console.error('Error in GrapeRank review endpoint:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        if (session) {
            session.close();
        }
    }
}

module.exports = {
    handleGetGrapeRankReview
};

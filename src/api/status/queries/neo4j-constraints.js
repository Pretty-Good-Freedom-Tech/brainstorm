/**
 * Neo4j Constraints Status Query Handler
 * 
 * This module provides a query handler to check the status of Neo4j constraints
 */

const { getConfigFromFile } = require('../../../utils/config');

/**
 * Handles returning the Neo4j constraints setup timestamp
 * 
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
function handleGetNeo4jConstraintsStatus(req, res) {
    console.log('Getting Neo4j constraints setup status...');
    
    try {
        // Get the HASENPFEFFR_CREATED_CONSTRAINTS_AND_INDEXES from configuration
        const constraintsTimestamp = parseInt(getConfigFromFile('HASENPFEFFR_CREATED_CONSTRAINTS_AND_INDEXES', '0'), 10);
        
        // Return the status
        return res.json({
            success: true,
            constraintsTimestamp: constraintsTimestamp,
            status: constraintsTimestamp > 0 ? 'set up' : 'not set up',
            setupTime: constraintsTimestamp > 0 ? new Date(constraintsTimestamp * 1000).toISOString() : null
        });
    } catch (error) {
        console.error('Error getting Neo4j constraints status:', error);
        return res.json({
            success: false,
            error: error.message,
            constraintsTimestamp: 0
        });
    }
}

module.exports = {
    handleGetNeo4jConstraintsStatus
};

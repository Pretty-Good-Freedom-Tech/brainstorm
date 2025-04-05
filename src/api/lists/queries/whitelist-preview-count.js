/**
 * Whitelist Preview Count Query Handler
 * Returns the count of users that would be included in the whitelist based on specified criteria
 */

const { exec } = require('child_process');
const { getNeo4jConnection } = require('../../../utils/config');

/**
 * Handler for getting preview count of users that would be in the whitelist
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleGetWhitelistPreviewCount(req, res) {
    // Get all parameters from request
    const influenceThreshold = parseFloat(req.query.influence || 0.5);
    const hopsThreshold = parseInt(req.query.hops || 1, 10);
    const combinationLogic = req.query.logic || 'OR'; // 'AND' or 'OR'
    const incorporateBlacklist = req.query.blacklist === 'true';
    
    // Check if Neo4j is running
    exec('systemctl is-active neo4j', (serviceError, serviceStdout) => {
        const isRunning = serviceStdout.trim() === 'active';
        
        if (!isRunning) {
            return res.json({
                success: false,
                error: 'Neo4j service is not running'
            });
        }
        
        // Get Neo4j credentials from the configuration system
        const neo4jConnection = getNeo4jConnection();
        const neo4jUser = neo4jConnection.user;
        const neo4jPassword = neo4jConnection.password;
        
        if (!neo4jPassword) {
            return res.json({
                success: false,
                error: 'Neo4j password not configured. Please update /etc/hasenpfeffr.conf with NEO4J_PASSWORD.'
            });
        }
        
        // Build the Cypher query based on parameters
        let query = `MATCH (n:NostrUser) WHERE `;
        
        // Add condition based on combination logic
        if (combinationLogic === 'AND') {
            query += `n.influence >= ${influenceThreshold} AND n.hops <= ${hopsThreshold}`;
        } else { // OR logic
            query += `n.influence >= ${influenceThreshold} OR n.hops <= ${hopsThreshold}`;
        }
        
        // Add blacklist condition if needed
        if (incorporateBlacklist) {
            query += ` AND (n.blacklisted IS NULL OR n.blacklisted = 0)`;
        }
        
        query += ` RETURN count(n) as userCount;`;
        
        // Execute the query using cypher-shell
        const command = `cypher-shell -u ${neo4jUser} -p ${neo4jPassword} "${query}"`;
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('Error querying Neo4j for whitelist preview count:', error);
                return res.json({
                    success: false,
                    error: stderr || error.message
                });
            }
            
            // Parse the result to get the count
            const match = stdout.match(/(\d+)/);
            if (match && match[1]) {
                const userCount = parseInt(match[1], 10);
                return res.json({
                    success: true,
                    count: userCount
                });
            } else {
                return res.json({
                    success: false,
                    error: 'Failed to parse user count from Neo4j response'
                });
            }
        });
    });
}

module.exports = {
    handleGetWhitelistPreviewCount
};

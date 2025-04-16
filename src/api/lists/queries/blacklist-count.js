/**
 * Blacklist Count Query Handler
 * Returns the count of blacklisted users in the Neo4j database
 */

const { exec } = require('child_process');
const { getNeo4jConnection } = require('../../../utils/config');

/**
 * Handler for getting count of blacklisted users
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleGetBlacklistCount(req, res) {
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
                error: 'Neo4j password not configured. Please update /etc/brainstorm.conf with NEO4J_PASSWORD.'
            });
        }
        
        // Build the Cypher query
        const query = `MATCH (n:NostrUser) WHERE n.blacklisted = 1 RETURN count(n) as userCount;`;
        
        // Execute the query using cypher-shell
        const command = `cypher-shell -u ${neo4jUser} -p ${neo4jPassword} "${query}"`;
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('Error querying Neo4j for blacklist count:', error);
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
    handleGetBlacklistCount
};

/**
 * Neo4j Status Query Handler
 * Returns detailed status information about the Neo4j database
 */

const { exec } = require('child_process');
const { getNeo4jConnection } = require('../../../utils/config');

/**
 * Handler for getting Neo4j status information
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleNeo4jStatus(req, res) {
    console.log('Getting Neo4j status information...');
    
    const neo4jStatus = {
        running: false,
        userCount: 0,
        relationships: {
            follow: 0,
            mute: 0,
            report: 0
        },
        constraints: [],
        indexes: [],
        error: null
    };

    // Check if Neo4j service is running
    exec('systemctl is-active neo4j', (serviceError, serviceStdout) => {
        neo4jStatus.running = serviceStdout.trim() === 'active';
        
        // If not running, return early
        if (!neo4jStatus.running) {
            return res.json({
                success: true,
                status: neo4jStatus
            });
        }
        
        // Helper function to execute Cypher queries
        const executeCypher = (query, handler) => {
            // Get Neo4j credentials from the configuration system
            const neo4jConnection = getNeo4jConnection();
            const neo4jUser = neo4jConnection.user;
            const neo4jPassword = neo4jConnection.password;
            
            if (!neo4jPassword) {
                neo4jStatus.error = 'Neo4j password not configured. Please update /etc/hasenpfeffr.conf with NEO4J_PASSWORD.';
                return handler('');
            }
            
            const command = `cypher-shell -u ${neo4jUser} -p ${neo4jPassword} "${query}"`;
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    neo4jStatus.error = `Error executing Neo4j query: ${stderr || error.message}`;
                } else {
                    handler(stdout);
                }
            });
        };

        // Get user count
        executeCypher('MATCH (u:NostrUser) RETURN count(u) as count;', (output) => {
            const match = output.match(/(\d+)/);
            if (match && match[1]) {
                neo4jStatus.userCount = parseInt(match[1], 10);
            }
            
            // Get relationship counts
            executeCypher('MATCH ()-[r:FOLLOWS]->() RETURN count(r) as count;', (output) => {
                const match = output.match(/(\d+)/);
                if (match && match[1]) {
                    neo4jStatus.relationships.follow = parseInt(match[1], 10);
                }
                
                executeCypher('MATCH ()-[r:MUTES]->() RETURN count(r) as count;', (output) => {
                    const match = output.match(/(\d+)/);
                    if (match && match[1]) {
                        neo4jStatus.relationships.mute = parseInt(match[1], 10);
                    }
                    
                    executeCypher('MATCH ()-[r:REPORTS]->() RETURN count(r) as count;', (output) => {
                        const match = output.match(/(\d+)/);
                        if (match && match[1]) {
                            neo4jStatus.relationships.report = parseInt(match[1], 10);
                        }
                        
                        // Get constraints
                        executeCypher('SHOW CONSTRAINTS;', (output) => {
                            neo4jStatus.constraints = output;
                            
                            // Get indexes
                            executeCypher('SHOW INDEXES;', (output) => {
                                neo4jStatus.indexes = output;
                                
                                // Return the final result
                                res.json({
                                    success: !neo4jStatus.error,
                                    status: neo4jStatus,
                                    error: neo4jStatus.error
                                });
                            });
                        });
                    });
                });
            });
        });
    });
}

module.exports = {
    handleNeo4jStatus
};

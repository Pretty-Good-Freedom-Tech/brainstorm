/**
 * Hasenpfeffr Neo4j status API endpoint
 * Provides information about Neo4j service status, constraints, indexes, and node counts
 */

const { exec } = require('child_process');

// Helper function to get Neo4j connection details
function getNeo4jConnection() {
    // Import this from the main server file or config module
    const getConfigFromFile = require('../../utils/config').getConfigFromFile;
    
    return {
        user: getConfigFromFile('NEO4J_USER', 'neo4j'),
        password: getConfigFromFile('NEO4J_PASSWORD', '')
    };
}

/**
 * Get Neo4j status including service status, constraints, indexes, and node counts
 */
function getNeo4jStatus(req, res) {
    console.log('Getting Neo4j status...');
    
    // Result object
    const result = {
        success: true,
        timestamp: Math.floor(Date.now() / 1000),
        service: { status: 'checking...' },
        constraints: { status: 'checking...' },
        indexes: { status: 'checking...' },
        users: { total: 0 },
        relationships: {
            total: 0,
            recent: 0,
            follows: 0,
            reports: 0,
            mutes: 0
        }
    };
    
    // Array to collect promises for parallel execution
    const promises = [];
    
    // 1. Check Neo4j service status
    promises.push(
        new Promise((resolve) => {
            exec('systemctl is-active neo4j', (error, stdout, stderr) => {
                result.service.status = (stdout.trim() === 'active') ? 'running' : 'stopped';
                resolve();
            });
        })
    );
    
    // Get Neo4j connection details for Cypher queries
    const neo4jConnection = getNeo4jConnection();
    const neo4jUser = neo4jConnection.user;
    const neo4jPassword = neo4jConnection.password;
    
    // Check if Neo4j is not running or credentials are not available
    if (result.service.status === 'stopped' || !neo4jUser || !neo4jPassword) {
        // Execute only the service status check and return early
        Promise.all(promises)
            .then(() => {
                console.log('Neo4j service is not running, returning limited information');
                res.json(result);
            })
            .catch(error => {
                console.error('Error checking Neo4j service:', error);
                result.success = false;
                result.error = error.message;
                res.json(result);
            });
        return;
    }
    
    // 2. Check Neo4j constraints
    promises.push(
        new Promise((resolve) => {
            const query = `SHOW CONSTRAINTS`;
            const command = `cypher-shell -u ${neo4jUser} -p ${neo4jPassword} "${query}"`;
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    result.constraints.status = 'error';
                    resolve();
                    return;
                }
                
                // Check if the expected constraint exists
                if (stdout.includes('UNIQUENESS') && stdout.includes('NostrUser') && stdout.includes('pubkey')) {
                    result.constraints.status = 'ok';
                } else {
                    result.constraints.status = 'missing';
                }
                resolve();
            });
        })
    );
    
    // 3. Check Neo4j indexes
    promises.push(
        new Promise((resolve) => {
            const query = `SHOW INDEXES`;
            const command = `cypher-shell -u ${neo4jUser} -p ${neo4jPassword} "${query}"`;
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    result.indexes.status = 'error';
                    resolve();
                    return;
                }
                
                // Check if the expected indexes exist
                if (stdout.includes('INDEX')) {
                    result.indexes.status = 'ok';
                } else {
                    result.indexes.status = 'missing';
                }
                resolve();
            });
        })
    );
    
    // 4. Count NostrUser nodes
    promises.push(
        new Promise((resolve) => {
            const query = `MATCH (n:NostrUser) RETURN count(n) as userCount`;
            const command = `cypher-shell -u ${neo4jUser} -p ${neo4jPassword} "${query}"`;
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error('Error counting NostrUser nodes:', error);
                    resolve();
                    return;
                }
                
                try {
                    // Parse user count from output
                    const match = stdout.match(/(\d+)/);
                    if (match && match[1]) {
                        result.users.total = parseInt(match[1], 10);
                    }
                } catch (e) {
                    console.error('Error parsing NostrUser count:', e);
                }
                resolve();
            });
        })
    );
    
    // 5. Count relationships
    promises.push(
        new Promise((resolve) => {
            const query = `MATCH ()-[r]->() RETURN count(r) as relationshipCount`;
            const command = `cypher-shell -u ${neo4jUser} -p ${neo4jPassword} "${query}"`;
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error('Error counting relationships:', error);
                    resolve();
                    return;
                }
                
                try {
                    // Parse relationship count from output
                    const match = stdout.match(/(\d+)/);
                    if (match && match[1]) {
                        result.relationships.total = parseInt(match[1], 10);
                    }
                } catch (e) {
                    console.error('Error parsing relationship count:', e);
                }
                resolve();
            });
        })
    );
    
    // 6. Count relationship types
    ['FOLLOWS', 'REPORTS', 'MUTES'].forEach(relType => {
        promises.push(
            new Promise((resolve) => {
                const query = `MATCH ()-[r:${relType}]->() RETURN count(r) as count`;
                const command = `cypher-shell -u ${neo4jUser} -p ${neo4jPassword} "${query}"`;
                exec(command, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`Error counting ${relType} relationships:`, error);
                        resolve();
                        return;
                    }
                    
                    try {
                        // Parse count from output
                        const match = stdout.match(/(\d+)/);
                        if (match && match[1]) {
                            result.relationships[relType.toLowerCase()] = parseInt(match[1], 10);
                        }
                    } catch (e) {
                        console.error(`Error parsing ${relType} count:`, e);
                    }
                    resolve();
                });
            })
        );
    });
    
    // 7. Count recent relationships (past hour)
    promises.push(
        new Promise((resolve) => {
            const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
            const query = `MATCH ()-[r]->() WHERE r.timestamp >= ${oneHourAgo} RETURN count(r) as recentCount`;
            const command = `cypher-shell -u ${neo4jUser} -p ${neo4jPassword} "${query}"`;
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error('Error counting recent relationships:', error);
                    resolve();
                    return;
                }
                
                try {
                    // Parse count from output
                    const match = stdout.match(/(\d+)/);
                    if (match && match[1]) {
                        result.relationships.recent = parseInt(match[1], 10);
                    }
                } catch (e) {
                    console.error('Error parsing recent relationship count:', e);
                }
                resolve();
            });
        })
    );
    
    // Execute all promises and return result
    Promise.all(promises)
        .then(() => {
            console.log('Neo4j status data collected successfully');
            res.json(result);
        })
        .catch(error => {
            console.error('Error collecting Neo4j status data:', error);
            result.success = false;
            result.error = error.message;
            res.json(result);
        });
}

module.exports = {
    getNeo4jStatus
};

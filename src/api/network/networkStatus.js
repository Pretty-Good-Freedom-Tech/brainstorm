/**
 * Hasenpfeffr network status API endpoint
 * Provides information about follows network status
 */

const fs = require('fs');
const { exec } = require('child_process');

// Get Neo4j connection details
function getNeo4jConnection() {
    // Import this from the main server file or config module
    const getConfigFromFile = require('../../utils/config').getConfigFromFile;
    
    return {
        user: getConfigFromFile('NEO4J_USER', 'neo4j'),
        password: getConfigFromFile('NEO4J_PASSWORD', '')
    };
}

/**
 * Get follows network status
 */
function getNetworkStatus(req, res) {
    console.log('Getting follows network status...');
    
    // Result object
    const result = {
        success: true,
        timestamp: Math.floor(Date.now() / 1000),
        lastCalculated: null,
        byHops: {
            0: 0,
            1: 0,
            2: 0,
            3: 0,
            4: 0,
            999: 0 // Disconnected
        },
        total: 0
    };
    
    // Log directory
    const hasenpfeffrLogDir = process.env.HASENPFEFFR_LOG_DIR || '/var/log/hasenpfeffr';
    
    // Array to collect promises for parallel execution
    const promises = [];
    
    // Check Follows Network last calculated
    promises.push(
        new Promise((resolve) => {
            const hopsLogPath = `${hasenpfeffrLogDir}/calculateHops.log`;
            fs.access(hopsLogPath, fs.constants.F_OK, (err) => {
                if (err) {
                    console.error('Hops log file not found:', err);
                    resolve();
                    return;
                }
                
                fs.stat(hopsLogPath, (statErr, stats) => {
                    if (statErr) {
                        console.error('Error getting Hops log file stats:', statErr);
                        resolve();
                        return;
                    }
                    
                    result.lastCalculated = Math.floor(stats.mtime.getTime() / 1000);
                    resolve();
                });
            });
        })
    );
    
    // Get Neo4j connection details for Cypher queries
    const neo4jConnection = getNeo4jConnection();
    const neo4jUser = neo4jConnection.user;
    const neo4jPassword = neo4jConnection.password;
    
    if (neo4jUser && neo4jPassword) {
        // Count users by hops
        [0, 1, 2, 3, 4, 999].forEach(hops => {
            promises.push(
                new Promise((resolve) => {
                    let query;
                    if (hops === 999) {
                        // Disconnected users (hops = 999)
                        query = `MATCH (n:NostrUser) WHERE n.hops = 999 OR n.hops IS NULL RETURN count(n) as count`;
                    } else {
                        query = `MATCH (n:NostrUser) WHERE n.hops = ${hops} RETURN count(n) as count`;
                    }
                    
                    const command = `cypher-shell -u ${neo4jUser} -p ${neo4jPassword} "${query}"`;
                    exec(command, (error, stdout, stderr) => {
                        if (error) {
                            console.error(`Error counting users with hops=${hops}:`, error);
                            resolve();
                            return;
                        }
                        
                        try {
                            // Parse count from output
                            const match = stdout.match(/(\d+)/);
                            if (match && match[1]) {
                                result.byHops[hops] = parseInt(match[1], 10);
                            }
                        } catch (e) {
                            console.error(`Error parsing hops=${hops} count:`, e);
                        }
                        resolve();
                    });
                })
            );
        });
        
        // Count total users in follows network (hops < 20)
        promises.push(
            new Promise((resolve) => {
                const query = `MATCH (n:NostrUser) WHERE n.hops < 20 RETURN count(n) as count`;
                const command = `cypher-shell -u ${neo4jUser} -p ${neo4jPassword} "${query}"`;
                exec(command, (error, stdout, stderr) => {
                    if (error) {
                        console.error('Error counting users in follows network:', error);
                        resolve();
                        return;
                    }
                    
                    try {
                        // Parse count from output
                        const match = stdout.match(/(\d+)/);
                        if (match && match[1]) {
                            result.total = parseInt(match[1], 10);
                        }
                    } catch (e) {
                        console.error('Error parsing follows network total:', e);
                    }
                    resolve();
                });
            })
        );
    }
    
    // Execute all promises and return result
    Promise.all(promises)
        .then(() => {
            console.log('Network status data collected successfully');
            res.json(result);
        })
        .catch(error => {
            console.error('Error collecting network status data:', error);
            result.success = false;
            result.error = error.message;
            res.json(result);
        });
}

module.exports = {
    getNetworkStatus
};

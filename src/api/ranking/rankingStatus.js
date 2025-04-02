/**
 * Hasenpfeffr ranking status API endpoint
 * Provides information about GrapeRank and PageRank status
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
 * Get GrapeRank and PageRank status
 */
function getRankingStatus(req, res) {
    console.log('Getting ranking algorithms status...');
    
    // Result object
    const result = {
        success: true,
        timestamp: Math.floor(Date.now() / 1000),
        grapeRank: {
            verifiedUsers: 0,
            lastUpdated: null
        },
        pageRank: {
            lastUpdated: null
        }
    };
    
    // Log directory
    const hasenpfeffrLogDir = process.env.HASENPFEFFR_LOG_DIR || '/var/log/hasenpfeffr';
    
    // Array to collect promises for parallel execution
    const promises = [];
    
    // 1. Count verified users (GrapeRank influence > 0.05)
    const neo4jConnection = getNeo4jConnection();
    const neo4jUser = neo4jConnection.user;
    const neo4jPassword = neo4jConnection.password;
    
    if (neo4jUser && neo4jPassword) {
        promises.push(
            new Promise((resolve) => {
                const query = `MATCH (n:NostrUser) WHERE n.influence >= 0.05 RETURN count(n) as verifiedCount`;
                const command = `cypher-shell -u ${neo4jUser} -p ${neo4jPassword} "${query}"`;
                exec(command, (error, stdout, stderr) => {
                    if (error) {
                        console.error('Error counting verified users:', error);
                        resolve();
                        return;
                    }
                    
                    try {
                        // Parse count from output
                        const match = stdout.match(/(\d+)/);
                        if (match && match[1]) {
                            result.grapeRank.verifiedUsers = parseInt(match[1], 10);
                        }
                    } catch (e) {
                        console.error('Error parsing verified user count:', e);
                    }
                    resolve();
                });
            })
        );
    }
    
    // 2. Check GrapeRank last updated
    promises.push(
        new Promise((resolve) => {
            const grapeRankLogPath = `${hasenpfeffrLogDir}/calculatePersonalizedGrapeRank.log`;
            fs.access(grapeRankLogPath, fs.constants.F_OK, (err) => {
                if (err) {
                    console.error('GrapeRank log file not found:', err);
                    resolve();
                    return;
                }
                
                fs.stat(grapeRankLogPath, (statErr, stats) => {
                    if (statErr) {
                        console.error('Error getting GrapeRank log file stats:', statErr);
                        resolve();
                        return;
                    }
                    
                    result.grapeRank.lastUpdated = Math.floor(stats.mtime.getTime() / 1000);
                    resolve();
                });
            });
        })
    );
    
    // 3. Check PageRank last updated
    promises.push(
        new Promise((resolve) => {
            const pageRankLogPath = `${hasenpfeffrLogDir}/calculatePersonalizedPageRank.log`;
            fs.access(pageRankLogPath, fs.constants.F_OK, (err) => {
                if (err) {
                    console.error('PageRank log file not found:', err);
                    resolve();
                    return;
                }
                
                fs.stat(pageRankLogPath, (statErr, stats) => {
                    if (statErr) {
                        console.error('Error getting PageRank log file stats:', statErr);
                        resolve();
                        return;
                    }
                    
                    result.pageRank.lastUpdated = Math.floor(stats.mtime.getTime() / 1000);
                    resolve();
                });
            });
        })
    );
    
    // Execute all promises and return result
    Promise.all(promises)
        .then(() => {
            console.log('Ranking status data collected successfully');
            res.json(result);
        })
        .catch(error => {
            console.error('Error collecting ranking status data:', error);
            result.success = false;
            result.error = error.message;
            res.json(result);
        });
}

module.exports = {
    getRankingStatus
};

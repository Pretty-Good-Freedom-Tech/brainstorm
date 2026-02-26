/**
 * Brainstorm Neo4j status API endpoint
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
 * Run a Neo4j query
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function runQuery(req, res) {
    console.log('Running Neo4j query...');

    const cypherCommand = decodeURIComponent(req.query.cypher) || '';
    
    // Result object
    const result = {
        success: true,
        service: { status: 'checking ...' },
        cypherCommand,
        cypherResults: ""
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

    // 0. Run cypherCommand and return results as cypherResults
    promises.push(
        new Promise((resolve) => {
            const query = cypherCommand;
            const command = `cypher-shell -u ${neo4jUser} -p ${neo4jPassword} "${query}"`;
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error('Error executing cypher command:', error);
                    result.success = false;
                    result.error = error.message;
                    result.cypherResults = "";
                    resolve();
                    return;
                }
                
                result.cypherResults = stdout;
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
    runQuery
};

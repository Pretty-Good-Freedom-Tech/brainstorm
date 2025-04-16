/**
 * Brainstorm lists status API endpoint
 * Provides information about whitelist and blacklist status
 */

const fs = require('fs');
const { exec } = require('child_process');

// Get Neo4j connection details
function getNeo4jConnection() {
    // Import this from the utils module
    const getConfigFromFile = require('../../utils/config').getConfigFromFile;
    
    return {
        user: getConfigFromFile('NEO4J_USER', 'neo4j'),
        password: getConfigFromFile('NEO4J_PASSWORD', '')
    };
}

/**
 * Get whitelist and blacklist status
 */
function getListStatus(req, res) {
    console.log('Getting whitelist and blacklist status...');
    
    // Result object
    const result = {
        success: true,
        timestamp: Math.floor(Date.now() / 1000),
        whitelist: {
            count: 0,
            lastUpdated: null
        },
        blacklist: {
            count: 0,
            lastUpdated: null
        }
    };
    
    // Whitelist path (using the same path as in handleGetWhitelistStats)
    const whitelistPath = '/usr/local/lib/strfry/plugins/data/whitelist_pubkeys.json';
    
    // Get whitelist information
    try {
        if (fs.existsSync(whitelistPath)) {
            // Get file stats for last modified time
            const stats = fs.statSync(whitelistPath);
            result.whitelist.lastUpdated = Math.floor(stats.mtime.getTime() / 1000);
            
            // Read the whitelist file to get the count
            try {
                const whitelistContent = fs.readFileSync(whitelistPath, 'utf8');
                const whitelist = JSON.parse(whitelistContent);
                result.whitelist.count = Object.keys(whitelist).length;
                console.log(`Found ${result.whitelist.count} entries in whitelist`);
            } catch (error) {
                console.error('Error reading whitelist file:', error);
            }
        } else {
            console.log(`Whitelist file not found at: ${whitelistPath}`);
        }
    } catch (error) {
        console.error('Error processing whitelist:', error);
    }
    
    // Check if Neo4j is running for blacklist info
    exec('systemctl is-active neo4j', (serviceError, serviceStdout) => {
        const isRunning = serviceStdout && serviceStdout.trim() === 'active';
        
        if (!isRunning) {
            console.log('Neo4j service is not running, cannot get blacklist count');
            return res.json(result);
        }
        
        // Get Neo4j credentials
        const neo4jConnection = getNeo4jConnection();
        const neo4jUser = neo4jConnection.user;
        const neo4jPassword = neo4jConnection.password;
        
        if (!neo4jPassword) {
            console.log('Neo4j password not configured');
            return res.json(result);
        }
        
        // Get blacklist timestamp from config
        const blacklistConfPath = '/etc/blacklist.conf';
        try {
            if (fs.existsSync(blacklistConfPath)) {
                const stats = fs.statSync(blacklistConfPath);
                result.blacklist.lastUpdated = Math.floor(stats.mtime.getTime() / 1000);
            }
        } catch (error) {
            console.error('Error getting blacklist config stats:', error);
        }
        
        // Build and execute Cypher query to get blacklist count
        const query = `MATCH (n:NostrUser) WHERE n.blacklisted = 1 RETURN count(n) as userCount;`;
        const command = `cypher-shell -u ${neo4jUser} -p ${neo4jPassword} "${query}"`;
        
        exec(command, (error, stdout, stderr) => {
            if (!error && stdout) {
                // Parse the result to get the count
                const match = stdout.match(/(\d+)/);
                if (match && match[1]) {
                    result.blacklist.count = parseInt(match[1], 10);
                    console.log(`Found ${result.blacklist.count} blacklisted users in Neo4j`);
                }
            } else {
                console.error('Error querying Neo4j for blacklist count:', error || stderr);
            }
            
            // Return the combined result
            res.json(result);
        });
    });
}

module.exports = {
    getListStatus
};

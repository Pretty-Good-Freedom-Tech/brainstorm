/**
 * Brainstorm configuration utilities
 * Provides functions for reading configuration values
 */

const fs = require('fs');
const { execSync } = require('child_process');
const { config } = require('../../lib/config');

/**
 * Get configuration values from /etc/brainstorm.conf
 * @param {string} varName - Name of the configuration variable
 * @param {*} defaultValue - Default value to return if variable is not found
 * @returns {string} Value of the configuration variable or default value
 */
function getConfigFromFile(varName, defaultValue = null) {
    try {
        const confFile = '/etc/brainstorm.conf';
        if (fs.existsSync(confFile)) {
            // Read the file content directly
            const fileContent = fs.readFileSync(confFile, 'utf8');
            console.log(`Reading config for ${varName} from ${confFile}`);
            
            // Look for the variable in the file content
            // First try to match with quotes (either single or double)
            let regex = new RegExp(`${varName}=[\"\'](.*?)[\"\']`, 'gm');
            let match = regex.exec(fileContent);
            
            if (match && match[1]) {
                console.log(`Found ${varName}=${match[1]} (quoted)`);
                return match[1];
            }
            
            // If not found with quotes, try without quotes
            regex = new RegExp(`${varName}=([^\\s]+)`, 'gm');
            match = regex.exec(fileContent);
            
            if (match && match[1]) {
                console.log(`Found ${varName}=${match[1]} (unquoted)`);
                return match[1];
            }
            
            // If not found with regex, try the source command as fallback
            try {
                console.log(`Trying source command for ${varName}`);
                const result = execSync(`source ${confFile} && echo $${varName}`).toString().trim();
                console.log(`Source command result for ${varName}: '${result}'`);
                if (result) {
                    return result;
                }
            } catch (sourceError) {
                console.error(`Error using source command for ${varName}:`, sourceError.message);
            }
        } else {
            console.log(`Config file ${confFile} not found`);
        }
    } catch (error) {
        console.error(`Error reading config for ${varName}:`, error);
    }
    
    console.log(`Using default value for ${varName}: ${defaultValue}`);
    return defaultValue;
}

// Function to get Neo4j connection details
function getNeo4jConnection() {
    // Try to get from config module first
    if (config && config.neo4j) {
      return config.neo4j;
    }
    
    // Fall back to direct file access
    return {
      uri: getConfigFromFile('NEO4J_URI', 'bolt://localhost:7687'),
      user: getConfigFromFile('NEO4J_USER', 'neo4j'),
      password: getConfigFromFile('NEO4J_PASSWORD')
    };
}

/**
 * Get the owner's public key from brainstorm.conf
 * @returns {string|null} Owner's public key or null if not found
 */
function getOwnerPubkey() {
    return getConfigFromFile('BRAINSTORM_OWNER_PUBKEY', null);
}

module.exports = {
    getConfigFromFile,
    getNeo4jConnection,
    getOwnerPubkey
};

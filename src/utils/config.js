/**
 * Hasenpfeffr configuration utilities
 * Provides functions for reading configuration values
 */

const fs = require('fs');
const { execSync } = require('child_process');

/**
 * Get configuration values from /etc/hasenpfeffr.conf
 * @param {string} varName - Name of the configuration variable
 * @param {*} defaultValue - Default value to return if variable is not found
 * @returns {string} Value of the configuration variable or default value
 */
function getConfigFromFile(varName, defaultValue = null) {
    try {
        const confFile = '/etc/hasenpfeffr.conf';
        if (fs.existsSync(confFile)) {
            // Read the file content directly
            const fileContent = fs.readFileSync(confFile, 'utf8');
            console.log(`Reading config for ${varName} from ${confFile}`);
            
            // Look for the variable in the file content
            const regex = new RegExp(`${varName}=[\"\'](.*?)[\"\']`, 'gm');
            const match = regex.exec(fileContent);
            
            if (match && match[1]) {
                console.log(`Found ${varName}=${match[1]}`);
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

module.exports = {
    getConfigFromFile
};

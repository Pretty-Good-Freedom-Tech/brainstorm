/**
 * System Status Query Handler
 * Returns the status of the strfry service and domain information
 */

const { exec } = require('child_process');
const { getConfigFromFile } = require('../../../utils/config');

/**
 * Handler for getting system status
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleStatus(req, res) {
    console.log('Checking status...');
    
    // Get the STRFRY_DOMAIN and NEO4J_BROWSER_URL from config
    const strfryDomain = getConfigFromFile('STRFRY_DOMAIN', 'localhost');
    const neo4jBrowserUrl = getConfigFromFile('HASENPFEFFR_NEO4J_BROWSER_URL', 'http://localhost:7474');
    
    exec('systemctl status strfry', (error, stdout, stderr) => {
        return res.json({
            output: stdout || stderr,
            strfryDomain: strfryDomain,
            neo4jBrowserUrl: neo4jBrowserUrl
        });
    });
}

module.exports = {
    handleStatus
};

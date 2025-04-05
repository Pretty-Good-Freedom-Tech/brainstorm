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
    
    // Get the STRFRY_DOMAIN from config
    const strfryDomain = getConfigFromFile('STRFRY_DOMAIN', 'localhost');
    
    exec('systemctl status strfry', (error, stdout, stderr) => {
        return res.json({
            output: stdout || stderr,
            strfryDomain: strfryDomain
        });
    });
}

module.exports = {
    handleStatus
};

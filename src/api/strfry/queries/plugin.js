/**
 * Strfry Plugin Status Query
 * Handles checking the status of the strfry content filtering plugin
 */

const fs = require('fs');

/**
 * Handler for getting strfry plugin status
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleGetPluginStatus(req, res) {
    try {
        // Define paths
        const strfryConfPath = '/etc/strfry.conf';
        
        // Check if strfry.conf exists
        if (!fs.existsSync(strfryConfPath)) {
            return res.status(404).json({ error: 'strfry.conf not found' });
        }
        
        // Read current config
        let confContent = fs.readFileSync(strfryConfPath, 'utf8');
        
        // Check current plugin status
        // Look for the plugin setting in the writePolicy section
        const writePolicyPluginRegex = /writePolicy\s*{[^}]*plugin\s*=\s*"([^"]*)"/s;
        const writePolicyMatch = confContent.match(writePolicyPluginRegex);
        
        // Also check for the relay.writePolicy.plugin line that might have been added incorrectly
        const relayPluginRegex = /relay\.writePolicy\.plugin\s*=\s*"([^"]*)"/;
        const relayMatch = confContent.match(relayPluginRegex);
        
        // Determine plugin status from either match
        let pluginStatus = 'unknown';
        if (writePolicyMatch) {
            pluginStatus = writePolicyMatch[1] ? 'enabled' : 'disabled';
        } else if (relayMatch) {
            pluginStatus = relayMatch[1] ? 'enabled' : 'disabled';
        }
        
        return res.json({ 
            success: true,
            status: pluginStatus 
        });
    } catch (error) {
        console.error('Error checking strfry plugin status:', error);
        return res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
}

module.exports = {
    handleGetPluginStatus
};

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
        const strfryRouterConfPath = '/etc/strfry-router.config';
        
        // Check if strfry.conf exists
        if (!fs.existsSync(strfryRouterConfPath)) {
            return res.status(404).json({ error: 'strfry-router.config not found' });
        }
        
        // Read current config
        let confContent = fs.readFileSync(strfryRouterConfPath, 'utf8');
        
        // Check to determine whether the string: filteredContent is present
        const filteredContentRegex = /filteredContent\s*{[^}]*}/s;
        const filteredContentMatch = confContent.match(filteredContentRegex);
        
        // Determine plugin status from match
        let filteredContentStatus = 'disabled';
        if (filteredContentMatch) {
            filteredContentStatus = 'enabled';
        }
        
        return res.json({ 
            success: true,
            status: filteredContentStatus 
        });
    } catch (error) {
        console.error('Error checking strfry-router plugin status:', error);
        return res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
}

module.exports = {
    handleGetPluginStatus
};

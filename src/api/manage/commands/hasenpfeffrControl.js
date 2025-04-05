/**
 * Hasenpfeffr Control Command Handler
 * 
 * This module provides an endpoint to turn Hasenpfeffr on and off
 */

const fs = require('fs');
const { execSync } = require('child_process');

/**
 * Handles turning Hasenpfeffr on and off
 * 
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
async function handleHasenpfeffrControl(req, res) {
    const { action } = req.body;
    
    if (!action || (action !== 'on' && action !== 'off')) {
        return res.status(400).json({ 
            success: false, 
            error: 'Invalid action. Must be "on" or "off".' 
        });
    }
    
    try {
        let scriptPath;
        if (action === 'on') {
            scriptPath = '/usr/local/lib/node_modules/hasenpfeffr/src/manage/turnHasenpfeffrOn.sh';
        } else {
            scriptPath = '/usr/local/lib/node_modules/hasenpfeffr/src/manage/turnHasenpfeffrOff.sh';
        }
        
        // Check if script exists
        if (!fs.existsSync(scriptPath)) {
            return res.status(404).json({ 
                success: false, 
                error: `Script not found: ${scriptPath}` 
            });
        }
        
        // Make script executable if it's not already
        execSync(`sudo chmod +x ${scriptPath}`);
        
        // Execute the script
        console.log(`Executing ${scriptPath}...`);
        const output = execSync(`sudo ${scriptPath}`, { timeout: 60000 }).toString();
        
        return res.json({
            success: true,
            action,
            message: `Hasenpfeffr turned ${action} successfully`,
            output
        });
    } catch (error) {
        console.error(`Error turning Hasenpfeffr ${action}:`, error);
        return res.status(500).json({ 
            success: false, 
            error: `Failed to turn Hasenpfeffr ${action}: ${error.message}` 
        });
    }
}

module.exports = {
    handleHasenpfeffrControl
};

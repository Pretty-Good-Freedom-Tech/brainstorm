/**
 * Script Running Command Handler
 * 
 * This module provides an endpoint to run service management scripts
 */

const fs = require('fs');
const { execSync } = require('child_process');

/**
 * Handles running service management scripts
 * 
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
function handleRunScript(req, res) {
    const { script } = req.body;
    
    if (!script) {
        return res.status(400).json({ 
            success: false,
            error: 'Missing script parameter' 
        });
    }
    
    try {
        // Check if script exists
        if (!fs.existsSync(script)) {
            return res.status(404).json({ 
                success: false, 
                error: `Script not found: ${script}` 
            });
        }
        
        // Make script executable if it's not already
        execSync(`sudo chmod +x ${script}`);
        
        // Execute the script
        console.log(`Executing ${script}...`);
        const output = execSync(`sudo ${script}`, { timeout: 60000 }).toString();
        
        return res.json({
            success: true,
            message: `Script ${script} executed successfully`,
            output
        });
    } catch (error) {
        console.error(`Error executing script ${script}:`, error);
        return res.status(500).json({ 
            success: false, 
            error: `Failed to execute script ${script}: ${error.message}` 
        });
    }
}

module.exports = {
    handleRunScript
};

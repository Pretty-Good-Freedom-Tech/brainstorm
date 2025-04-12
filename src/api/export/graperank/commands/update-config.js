/**
 * GrapeRank Configuration Commands
 * Handles updates to GrapeRank configuration
 */

const fs = require('fs');
const { execSync } = require('child_process');
const { getConfigFromFile } = require('../../../../utils/config');

/**
 * Update GrapeRank configuration
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleUpdateGrapeRankConfig(req, res) {
    console.log('Updating GrapeRank configuration...');
    
    // Note: Authentication is now handled by the authMiddleware in src/middleware/auth.js
    // The middleware ensures that only the owner can access this endpoint
    
    const configPath = '/etc/graperank.conf';
    const tempConfigPath = '/tmp/graperank.conf.tmp';
    
    try {
        // Check if the config file exists
        if (!fs.existsSync(configPath)) {
            return res.status(404).json({ 
                success: false, 
                error: 'GrapeRank configuration file not found' 
            });
        }
        
        // Get the updated parameters from the request body
        const updatedParams = req.body;
        
        if (!updatedParams || Object.keys(updatedParams).length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No parameters provided for update'
            });
        }
        
        // Read the current configuration file
        const configContent = fs.readFileSync(configPath, 'utf8');
        const lines = configContent.split('\n');
        
        // Create a new configuration with updated parameters
        const updatedLines = lines.map(line => {
            // Skip comments and empty lines
            if (line.trim().startsWith('#') || line.trim() === '') {
                return line;
            }
            
            // Check if this line contains a parameter that needs to be updated
            for (const [paramName, paramValue] of Object.entries(updatedParams)) {
                const regex = new RegExp(`^export\\s+${paramName}=.*$`);
                if (regex.test(line)) {
                    return `export ${paramName}=${paramValue}`;
                }
            }
            
            return line;
        });
        
        // Write the updated configuration to a temporary file
        fs.writeFileSync(tempConfigPath, updatedLines.join('\n'));
        
        // Use sudo to copy the temporary file to the actual configuration file
        execSync(`sudo cp ${tempConfigPath} ${configPath}`);
        execSync(`sudo chown root:hasenpfeffr ${configPath}`);
        execSync(`sudo chmod 644 ${configPath}`);
        
        // Clean up the temporary file
        fs.unlinkSync(tempConfigPath);
        
        return res.json({
            success: true,
            message: 'GrapeRank configuration updated successfully'
        });
    } catch (error) {
        console.error('Error updating GrapeRank configuration:', error);
        return res.status(500).json({
            success: false,
            error: `Error updating GrapeRank configuration: ${error.message}`
        });
    }
}

module.exports = {
    handleUpdateGrapeRankConfig
};

/**
 * GrapeRank Configuration Queries
 * Handles retrieval of GrapeRank configuration information
 */

const fs = require('fs');

/**
 * Get GrapeRank configuration
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleGetGrapeRankConfig(req, res) {
    console.log('Getting GrapeRank configuration...');
    
    const configPath = '/etc/graperank.conf';
    
    try {
        // Check if the config file exists
        if (!fs.existsSync(configPath)) {
            return res.status(404).json({ 
                success: false, 
                error: 'GrapeRank configuration file not found' 
            });
        }
        
        // Read the configuration file
        const configContent = fs.readFileSync(configPath, 'utf8');
        
        // Parse the configuration file
        const config = {};
        const lines = configContent.split('\n');
        
        lines.forEach(line => {
            // Skip comments and empty lines
            if (line.trim().startsWith('#') || line.trim() === '') {
                return;
            }
            
            // Extract parameter name and value
            const match = line.match(/^export\s+([A-Z_]+)=(.*)$/);
            if (match) {
                const [, paramName, paramValue] = match;
                config[paramName] = paramValue.trim();
            }
        });
        
        return res.json({
            success: true,
            config: config
        });
    } catch (error) {
        console.error('Error reading GrapeRank configuration:', error);
        return res.status(500).json({
            success: false,
            error: `Error reading GrapeRank configuration: ${error.message}`
        });
    }
}

module.exports = {
    handleGetGrapeRankConfig
};

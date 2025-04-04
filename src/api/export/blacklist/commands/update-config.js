/**
 * Blacklist Configuration Commands
 * Handles updates to blacklist configuration
 */

const fs = require('fs');
const { execSync } = require('child_process');

/**
 * Update blacklist configuration
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleUpdateBlacklistConfig(req, res) {
  try {
    // Note: Authentication is now handled by the authMiddleware in src/api/auth/authHandler.js
    // The middleware ensures that only the owner can access this endpoint
    
    const configPath = '/etc/blacklist.conf';
    const tempConfigPath = '/tmp/blacklist.conf.tmp';
    
    // Check if the configuration file exists
    if (!fs.existsSync(configPath)) {
      return res.json({
        success: false,
        error: 'Blacklist configuration file not found'
      });
    }
    
    // Read the configuration file
    const configContent = fs.readFileSync(configPath, 'utf8');
    const lines = configContent.split('\n');
    const updatedLines = [];
    
    // Update the configuration file
    for (const line of lines) {
      let updatedLine = line;
      
      if (line.startsWith('export ')) {
        const parts = line.substring(7).split('=');
        if (parts.length === 2) {
          const key = parts[0].trim();
          
          // Check if the key is in the request body
          if (req.body[key] !== undefined) {
            updatedLine = `export ${key}=${req.body[key]}`;
          }
        }
      }
      
      updatedLines.push(updatedLine);
    }
    
    // Write the updated configuration to a temporary file
    fs.writeFileSync(tempConfigPath, updatedLines.join('\n'));
    
    // Copy the temporary file to the actual configuration file with sudo
    execSync(`sudo cp ${tempConfigPath} ${configPath}`);
    execSync(`sudo chmod 644 ${configPath}`);
    execSync(`sudo chown root:hasenpfeffr ${configPath}`);
    
    // Clean up the temporary file
    fs.unlinkSync(tempConfigPath);
    
    return res.json({
      success: true
    });
  } catch (error) {
    console.error('Error updating blacklist configuration:', error);
    return res.json({
      success: false,
      error: error.message
    });
  }
}

module.exports = {
  handleUpdateBlacklistConfig
};

/**
 * Whitelist Configuration Queries
 * Handles retrieval of whitelist configuration information
 */

const fs = require('fs');

/**
 * Get whitelist configuration
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleGetWhitelistConfig(req, res) {
  try {
    const configPath = '/etc/whitelist.conf';
    
    // Check if the configuration file exists
    if (!fs.existsSync(configPath)) {
      return res.json({
        success: false,
        error: 'Whitelist configuration file not found'
      });
    }
    
    // Read the configuration file
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = {};
    const lines = configContent.split('\n');
    
    // Parse the configuration file
    for (const line of lines) {
      if (line.startsWith('export ')) {
        const parts = line.substring(7).split('=');
        if (parts.length === 2) {
          const key = parts[0].trim();
          let value = parts[1].trim();
          
          // Remove any quotes from the value
          if ((value.startsWith('"') && value.endsWith('"')) || 
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.substring(1, value.length - 1);
          }
          
          config[key] = value;
        }
      }
    }

    // Get the count of whitelisted pubkeys
    let whitelistedCount = 0;
    const whitelistPath = '/usr/local/lib/strfry/plugins/data/whitelist_pubkeys.json';
    if (fs.existsSync(whitelistPath)) {
      try {
        const whitelistContent = fs.readFileSync(whitelistPath, 'utf8');
        const whitelist = JSON.parse(whitelistContent);
        whitelistedCount = Object.keys(whitelist).length;
      } catch (error) {
        console.error('Error reading whitelist file:', error);
      }
    }
    
    return res.json({
      success: true,
      config: config,
      whitelistedCount: whitelistedCount
    });
  } catch (error) {
    console.error('Error getting whitelist configuration:', error);
    return res.json({
      success: false,
      error: error.message
    });
  }
}

module.exports = {
  handleGetWhitelistConfig
};

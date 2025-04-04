/**
 * Blacklist Configuration Queries
 * Handles retrieval of blacklist configuration information
 */

const fs = require('fs');

/**
 * Get blacklist configuration
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleGetBlacklistConfig(req, res) {
  try {
    const configPath = '/etc/blacklist.conf';
    
    // Check if the configuration file exists
    if (!fs.existsSync(configPath)) {
      return res.json({
        success: false,
        error: 'Blacklist configuration file not found'
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
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.substring(1, value.length - 1);
          }
          
          config[key] = value;
        }
      }
    }

    // Get the count of blacklisted pubkeys
    let blacklistedCount = 0;
    const blacklistPath = '/usr/local/lib/strfry/plugins/data/blacklist_pubkeys.json';
    if (fs.existsSync(blacklistPath)) {
      try {
        const blacklistContent = fs.readFileSync(blacklistPath, 'utf8');
        const blacklist = JSON.parse(blacklistContent);
        blacklistedCount = Object.keys(blacklist).length;
      } catch (error) {
        console.error('Error reading blacklist file:', error);
      }
    }
    
    return res.json({
      success: true,
      config: config,
      blacklistedCount: blacklistedCount
    });
  } catch (error) {
    console.error('Error getting blacklist configuration:', error);
    return res.json({
      success: false,
      error: error.message
    });
  }
}

module.exports = {
  handleGetBlacklistConfig
};

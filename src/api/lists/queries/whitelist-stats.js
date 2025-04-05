/**
 * Whitelist Statistics Query Handler
 * Returns statistics about the whitelist file, including the count of whitelisted pubkeys and last modified date
 */

const fs = require('fs');

/**
 * Handler for getting whitelist statistics
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleGetWhitelistStats(req, res) {
  try {
    let whitelistCount = 0;
    let lastModified = null;
    
    // Path to the whitelist file
    const whitelistPath = '/usr/local/lib/strfry/plugins/data/whitelist_pubkeys.json';
    
    if (fs.existsSync(whitelistPath)) {
      // Get the file stats for last modified time
      const stats = fs.statSync(whitelistPath);
      lastModified = stats.mtime.getTime();
      
      // Read the whitelist file to get the count
      try {
        const whitelistContent = fs.readFileSync(whitelistPath, 'utf8');
        const whitelist = JSON.parse(whitelistContent);
        whitelistCount = Object.keys(whitelist).length;
      } catch (error) {
        console.error('Error reading whitelist file:', error);
      }
    }
    
    return res.json({
      success: true,
      count: whitelistCount,
      lastModified: lastModified
    });
  } catch (error) {
    console.error('Error getting whitelist stats:', error);
    return res.json({
      success: false,
      error: error.message
    });
  }
}

module.exports = {
  handleGetWhitelistStats
};

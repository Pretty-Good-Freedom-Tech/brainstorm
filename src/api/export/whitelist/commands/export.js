/**
 * Whitelist Export Command
 * Handles triggering the export of whitelist data
 */

const { exec } = require('child_process');

/**
 * Export whitelist data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleExportWhitelist(req, res) {
  console.log('Exporting Whitelist data...');
  
  // Set a longer timeout for the response (10 minutes)
  req.setTimeout(600000); // 10 minutes in milliseconds
  res.setTimeout(600000);
  
  // Use exec with timeout options
  const child = exec('sudo /usr/local/lib/node_modules/hasenpfeffr/src/algos/exportWhitelist.sh', {
    timeout: 590000, // slightly less than the HTTP timeout
    maxBuffer: 1024 * 1024 // 1MB buffer for stdout/stderr
  }, (error, stdout, stderr) => {
    console.log('Whitelist export completed');
    
    if (error) {
      console.error('Error exporting Whitelist data:', error);
      return res.json({
        success: false,
        output: stderr || stdout || error.message
      });
    }
    
    console.log('Whitelist exported successfully');
    return res.json({
      success: true,
      output: stdout || stderr
    });
  });
  
  // Log when the process starts
  child.on('spawn', () => {
    console.log('Whitelist export process started');
  });
}

module.exports = {
  handleExportWhitelist
};

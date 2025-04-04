/**
 * Blacklist Generation Command
 * Handles triggering the calculation of personalized blacklist data
 */

const { exec } = require('child_process');

/**
 * Generate blacklist data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleGenerateBlacklist(req, res) {
  console.log('Generating blacklist data...');
  
  // Set a longer timeout for the response (10 minutes)
  req.setTimeout(600000); // 10 minutes in milliseconds
  res.setTimeout(600000);
  
  // Use exec with timeout options
  const child = exec('sudo /usr/local/lib/node_modules/hasenpfeffr/src/algos/personalizedBlacklist/calculatePersonalizedBlacklist.sh', {
    timeout: 590000, // slightly less than the HTTP timeout
    maxBuffer: 1024 * 1024 // 1MB buffer for stdout/stderr
  }, (error, stdout, stderr) => {
    console.log('Blacklist calculation completed');
    
    if (error) {
      console.error('Error generating blacklist data:', error);
      return res.json({
        success: false,
        output: stderr || stdout || error.message
      });
    }
    
    console.log('Blacklist data generated successfully');
    return res.json({
      success: true,
      output: stdout || stderr
    });
  });
  
  // Log when the process starts
  child.on('spawn', () => {
    console.log('Blacklist calculation process started');
  });
}

module.exports = {
  handleGenerateBlacklist
};

/**
 * Verified Followers Generation Command
 * Handles triggering the calculation of personalized Verified Followers data
 */

const { exec } = require('child_process');

/**
 * Generate Verified Followers data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleGenerateVerifiedFollowers(req, res) {
  console.log('Generating Verified Followers data...');
  
  // Set a longer timeout for the response (10 minutes)
  req.setTimeout(600000); // 10 minutes in milliseconds
  res.setTimeout(600000);
  
  // Use exec with timeout options
  const child = exec('sudo /usr/local/lib/node_modules/brainstorm/src/algos/calculateVerifiedFollowerCounts.sh', {
    timeout: 590000, // slightly less than the HTTP timeout
    maxBuffer: 1024 * 1024 // 1MB buffer for stdout/stderr
  }, (error, stdout, stderr) => {
    console.log('Verified Followers calculation completed');
    
    if (error) {
      console.error('Error generating Verified Followers data:', error);
      return res.json({
        success: false,
        output: stderr || stdout || error.message
      });
    }
    
    console.log('Verified Followers data generated successfully');
    return res.json({
      success: true,
      output: stdout || stderr
    });
  });
  
  // Log when the process starts
  child.on('spawn', () => {
    console.log('Verified Followers calculation process started');
  });
}

module.exports = {
  handleGenerateVerifiedFollowers
};

/**
 * PageRank Generation Command
 * Handles triggering the calculation of personalized PageRank data
 */

const { exec } = require('child_process');

/**
 * Generate PageRank data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleGeneratePageRank(req, res) {
  console.log('Generating PageRank data...');
  
  // Set a longer timeout for the response (10 minutes)
  req.setTimeout(600000); // 10 minutes in milliseconds
  res.setTimeout(600000);
  
  // Use exec with timeout options
  const child = exec('sudo /usr/local/lib/node_modules/hasenpfeffr/src/algos/calculatePersonalizedPageRank.sh', {
    timeout: 590000, // slightly less than the HTTP timeout
    maxBuffer: 1024 * 1024 // 1MB buffer for stdout/stderr
  }, (error, stdout, stderr) => {
    console.log('PageRank calculation completed');
    
    if (error) {
      console.error('Error generating PageRank data:', error);
      return res.json({
        success: false,
        output: stderr || stdout || error.message
      });
    }
    
    console.log('PageRank data generated successfully');
    return res.json({
      success: true,
      output: stdout || stderr
    });
  });
  
  // Log when the process starts
  child.on('spawn', () => {
    console.log('PageRank calculation process started');
  });
}

module.exports = {
  handleGeneratePageRank
};

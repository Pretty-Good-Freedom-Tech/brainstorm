/**
 * GrapeRank Generation Command
 * Handles triggering the calculation of personalized GrapeRank data
 */

const { exec } = require('child_process');

/**
 * Generate GrapeRank data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleGenerateGrapeRank(req, res) {
  console.log('Generating GrapeRank data...');
  
  // Set a longer timeout for the response (10 minutes)
  req.setTimeout(600000); // 10 minutes in milliseconds
  res.setTimeout(600000);
  
  // Use exec with timeout options
  const child = exec('sudo /usr/local/lib/node_modules/brainstorm/src/algos/personalizedGrapeRank/calculatePersonalizedGrapeRank.sh', {
    timeout: 590000, // slightly less than the HTTP timeout
    maxBuffer: 1024 * 1024 // 1MB buffer for stdout/stderr
  }, (error, stdout, stderr) => {
    console.log('GrapeRank calculation completed');
    
    if (error) {
      console.error('Error generating GrapeRank data:', error);
      return res.json({
        success: false,
        output: stderr || stdout || error.message
      });
    }
    
    console.log('GrapeRank data generated successfully');
    return res.json({
      success: true,
      output: stdout || stderr
    });
  });
  
  // Log when the process starts
  child.on('spawn', () => {
    console.log('GrapeRank calculation process started');
  });
}

module.exports = {
  handleGenerateGrapeRank
};

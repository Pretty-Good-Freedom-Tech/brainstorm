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
function handleGenerateReports(req, res) {
  console.log('Generating Reports data...');
  
  // Set a longer timeout for the response (10 minutes)
  req.setTimeout(600000); // 10 minutes in milliseconds
  res.setTimeout(600000);
  
  // Use exec with timeout options
  const child = exec('sudo /usr/local/lib/node_modules/brainstorm/src/algos/reports/calculateReportScores.sh', {
    timeout: 590000, // slightly less than the HTTP timeout
    maxBuffer: 1024 * 1024 // 1MB buffer for stdout/stderr
  }, (error, stdout, stderr) => {
    console.log('Reports calculation completed');
    
    if (error) {
      console.error('Error generating Reports data:', error);
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
    console.log('Reports calculation process started');
  });
}

module.exports = {
  handleGenerateReports
};

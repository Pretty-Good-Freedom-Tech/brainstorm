/**
 * PageRank Generation and Return Command
 * Handles triggering the calculation of personalized PageRank data
 * The reference user is supplied as a query parameter
 * Results are returned as a JSON object
 */

const { exec } = require('child_process');

/**
 * Generate PageRank data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleGenerateForApiPageRank(req, res) {
  console.log('Generating PageRank data...');
  
  // Set a longer timeout for the response (3 minutes)
  req.setTimeout(180000); // 3 minutes in milliseconds
  res.setTimeout(180000);

  // retreive pubkey as an argument
  const pubkey = req.query.pubkey;

  // Use exec with timeout options
  const child = exec('sudo /usr/local/lib/node_modules/brainstorm/src/algos/personalizedPageRankForApi.sh ' + pubkey, {
    timeout: 170000, // slightly less than the HTTP timeout
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
}

module.exports = {
  handleGenerateForApiPageRank
};

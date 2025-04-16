/**
 * Negentropy Personal Sync Command
 * Triggers synchronization of personal data via Negentropy
 */

const { exec } = require('child_process');

/**
 * Handler for Negentropy Personal synchronization
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleNegentropySyncPersonal(req, res) {
  console.log('Syncing with Negentropy: Personal ...');
  
  // Set a longer timeout for the response (10 minutes)
  req.setTimeout(600000); // 10 minutes in milliseconds
  res.setTimeout(600000);
  
  // Use exec with timeout options
  const child = exec('sudo /usr/local/lib/node_modules/brainstorm/src/manage/negentropySync/syncPersonal.sh', {
    timeout: 590000, // slightly less than the HTTP timeout
    maxBuffer: 1024 * 1024 // 1MB buffer for stdout/stderr
  }, (error, stdout, stderr) => {
    console.log('Negentropy Personal sync completed');
    
    if (error) {
      console.error('Error syncing with Negentropy: Personal:', error);
      return res.json({
        success: false,
        output: stderr || stdout || error.message
      });
    }
    
    console.log('Negentropy Personal sync completed successfully');
    return res.json({
      success: true,
      output: stdout || stderr
    });
  });
  
  // Log when the process starts
  child.on('spawn', () => {
    console.log('Negentropy Personal sync process started');
  });
}

module.exports = {
  handleNegentropySyncPersonal
};

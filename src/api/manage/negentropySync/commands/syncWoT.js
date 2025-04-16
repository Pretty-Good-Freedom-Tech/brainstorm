/**
 * Negentropy WoT Sync Command
 * Triggers synchronization of Web of Trust data via Negentropy
 */

const { exec } = require('child_process');

/**
 * Handler for Negentropy WoT synchronization
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleNegentropySyncWoT(req, res) {
  console.log('Syncing with Negentropy: WoT ...');
  
  // Set a longer timeout for the response (10 minutes)
  req.setTimeout(600000); // 10 minutes in milliseconds
  res.setTimeout(600000);
  
  // Use exec with timeout options
  const child = exec('sudo /usr/local/lib/node_modules/brainstorm/src/manage/negentropySync/syncWoT.sh', {
    timeout: 590000, // slightly less than the HTTP timeout
    maxBuffer: 1024 * 1024 // 1MB buffer for stdout/stderr
  }, (error, stdout, stderr) => {
    console.log('Negentropy WoT sync completed');
    
    if (error) {
      console.error('Error syncing with Negentropy: WoT:', error);
      return res.json({
        success: false,
        output: stderr || stdout || error.message
      });
    }
    
    console.log('Negentropy WoT sync completed successfully');
    return res.json({
      success: true,
      output: stdout || stderr
    });
  });
  
  // Log when the process starts
  child.on('spawn', () => {
    console.log('Negentropy WoT sync process started');
  });
}

module.exports = {
  handleNegentropySyncWoT
};

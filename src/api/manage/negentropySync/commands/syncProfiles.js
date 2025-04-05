/**
 * Negentropy Profiles Sync Command
 * Triggers synchronization of profile data (kind 0) via Negentropy
 */

const { exec } = require('child_process');

/**
 * Handler for Negentropy Profiles synchronization
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleNegentropySyncProfiles(req, res) {
  console.log('Syncing with Negentropy: Profiles ...');
  
  // Set a longer timeout for the response (10 minutes)
  req.setTimeout(600000); // 10 minutes in milliseconds
  res.setTimeout(600000);
  
  // Use exec with timeout options
  const child = exec('sudo /usr/local/lib/node_modules/hasenpfeffr/src/manage/negentropySync/syncProfiles.sh', {
    timeout: 590000, // slightly less than the HTTP timeout
    maxBuffer: 1024 * 1024 // 1MB buffer for stdout/stderr
  }, (error, stdout, stderr) => {
    console.log('Negentropy Profiles sync completed');
    
    if (error) {
      console.error('Error syncing with Negentropy: Profiles:', error);
      return res.json({
        success: false,
        output: stderr || stdout || error.message
      });
    }
    
    console.log('Negentropy Profiles sync completed successfully');
    return res.json({
      success: true,
      output: stdout || stderr
    });
  });
  
  // Log when the process starts
  child.on('spawn', () => {
    console.log('Negentropy Profiles sync process started');
  });
}

module.exports = {
  handleNegentropySyncProfiles
};

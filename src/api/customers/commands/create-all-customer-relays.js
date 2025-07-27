/**
 * Process All Active Customers Command
 * Handles triggering the processing of all active customers
 */

const { exec } = require('child_process');

/**
 * Process all active customers
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleCreateAllCustomerRelays(req, res) {
  console.log('createAllCustomerRelays...');
  
  // Remove all timeouts to allow long-running process (2+ hours)
  req.setTimeout(0); // 0 = no timeout
  res.setTimeout(0); // 0 = no timeout
  
  // Use exec without timeout - allowing unlimited execution time
  const child = exec('sudo node /usr/local/lib/node_modules/brainstorm/src/manage/customers/createAllCustomerRelays.js', {
    maxBuffer: 1024 * 1024 * 10 // 10MB buffer for stdout/stderr (increased for long output)
  }, (error, stdout, stderr) => {
    console.log('createAllCustomerRelays completed');
    
    if (error) {
      console.error('Error creating all customer relays:', error);
      return res.json({
        success: false,
        output: stderr || stdout || error.message
      });
    }
    
    console.log('createAllCustomerRelays successfully');
    return res.json({
      success: true,
      output: stdout || stderr
    });
  });
  
  // Log when the process starts
  child.on('spawn', () => {
    console.log('createAllCustomerRelays process started');
  });
}

module.exports = {
  handleCreateAllCustomerRelays
};

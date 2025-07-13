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
function handleProcessAllActiveCustomers(req, res) {
  console.log('Processing all active customers...');
  
  // Set a longer timeout for the response (10 minutes)
  req.setTimeout(600000); // 10 minutes in milliseconds
  res.setTimeout(600000);
  
  // Use exec with timeout options
  const child = exec('sudo bash /usr/local/lib/node_modules/brainstorm/src/algos/customers/processAllActiveCustomers.sh', {
    timeout: 590000, // slightly less than the HTTP timeout
    maxBuffer: 1024 * 1024 // 1MB buffer for stdout/stderr
  }, (error, stdout, stderr) => {
    console.log('Processing all active customers completed');
    
    if (error) {
      console.error('Error processing all active customers:', error);
      return res.json({
        success: false,
        output: stderr || stdout || error.message
      });
    }
    
    console.log('Processing all active customers successfully');
    return res.json({
      success: true,
      output: stdout || stderr
    });
  });
  
  // Log when the process starts
  child.on('spawn', () => {
    console.log('Processing all active customers process started');
  });
}

module.exports = {
  handleProcessAllActiveCustomers
};

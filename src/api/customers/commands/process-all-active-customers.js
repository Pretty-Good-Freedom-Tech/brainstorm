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
  
  // Remove all timeouts to allow long-running process (2+ hours)
  req.setTimeout(0); // 0 = no timeout
  res.setTimeout(0); // 0 = no timeout
  
  // Use exec without timeout - allowing unlimited execution time
  const child = exec('sudo bash /usr/local/lib/node_modules/brainstorm/src/algos/customers/processAllActiveCustomers.sh', {
    maxBuffer: 1024 * 1024 * 10 // 10MB buffer for stdout/stderr (increased for long output)
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

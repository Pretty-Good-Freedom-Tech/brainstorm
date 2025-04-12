/**
 * NIP-85 Generation Command
 * Handles the generation and publishing of NIP-85 data
 */

const path = require('path');
const { exec } = require('child_process');

/**
 * Generate and publish NIP-85 data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleGenerateNip85(req, res) {
    // Note: Authentication is now handled by the authMiddleware in src/middleware/auth.js
    // The middleware ensures that only the owner can access this endpoint
    
    console.log('Generating and publishing NIP-85 data...');
    
    // Get the NIP85 directory from environment or use default
    const nip85Dir = process.env.HASENPFEFFR_NIP85_DIR || '/usr/local/lib/node_modules/hasenpfeffr/src/algos/nip85';
    const scriptPath = path.join(nip85Dir, 'publishNip85.sh');
    
    // Set a longer timeout for the response (10 minutes)
    req.setTimeout(600000); // 10 minutes in milliseconds
    res.setTimeout(600000);
    
    console.log(`Executing NIP-85 publishing script: ${scriptPath}`);
    
    // Use exec to run the script with sudo
    const child = exec(`sudo ${scriptPath}`, {
        timeout: 590000, // slightly less than the HTTP timeout
        maxBuffer: 1024 * 1024 // 1MB buffer for stdout/stderr
    }, (error, stdout, stderr) => {
        console.log('NIP-85 publishing completed');
        
        if (error) {
            console.error('Error publishing NIP-85 data:', error);
            return res.json({
                success: false,
                output: stderr || stdout || error.message
            });
        }
        
        console.log('NIP-85 data published successfully');
        return res.json({
            success: true,
            output: stdout
        });
    });
    
    // Handle data events to capture real-time output
    child.stdout.on('data', (data) => {
        const dataStr = data.toString();
        console.log(`NIP-85 publishing stdout: ${dataStr}`);
    });
    
    child.stderr.on('data', (data) => {
        const dataStr = data.toString();
        console.error(`NIP-85 publishing stderr: ${dataStr}`);
    });
    
    child.on('close', (code) => {
        console.log(`NIP-85 publishing process exited with code ${code}`);
    });
}

module.exports = {
    handleGenerateNip85
};

/**
 * NIP-85 Kind 30382 Commands
 * Handles the publishing of Kind 30382 events for Trusted Assertions
 * These endpoints require authentication
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { getConfigFromFile } = require('../../../../utils/config');

/**
 * Publish a Kind 30382 event
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handlePublishKind30382(req, res) {
    try {
        // Check if authenticated
        if (!req.session || !req.session.authenticated) {
            return res.status(401).json({ success: false, message: "Authentication required" });
        }
        
        console.log('Publishing Kind 30382 event');
        
        // Execute the publish script
        const scriptPath = path.join(__dirname, '../../../../../src/algos/nip85/hasenpfeffr-publish-kind30382.js');
        
        // Get parameters from request query or body
        const pubkey = req.query.pubkey || req.body.pubkey;
        
        // Build environment variables object
        const env = {
            ...process.env
        };
        
        // Add pubkey to environment if provided
        if (pubkey) {
            env.TARGET_PUBKEY = pubkey;
        }
        
        // Run the script as a child process
        const child = spawn('node', [scriptPath], { env });
        
        let output = '';
        let errorOutput = '';
        
        child.stdout.on('data', (data) => {
            const dataStr = data.toString();
            console.log(`hasenpfeffr-publish-kind30382.js stdout: ${dataStr}`);
            output += dataStr;
        });
        
        child.stderr.on('data', (data) => {
            const dataStr = data.toString();
            console.error(`hasenpfeffr-publish-kind30382.js stderr: ${dataStr}`);
            errorOutput += dataStr;
        });
        
        child.on('close', (code) => {
            const timestamp = Date.now();
            const logDir = getConfigFromFile('HASENPFEFFR_LOG_DIR', '/var/log/hasenpfeffr');
            
            // Ensure log directory exists
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
            
            // Save output to log file
            const logFile = path.join(logDir, `kind30382_${timestamp}.log`);
            fs.writeFileSync(logFile, `STDOUT:\n${output}\n\nSTDERR:\n${errorOutput}\n`);
            
            if (code === 0) {
                try {
                    // Try to parse the output if it's JSON
                    const jsonMatch = output.match(/\{.*\}/s);
                    if (jsonMatch) {
                        const publishResult = JSON.parse(jsonMatch[0]);
                        const resultFile = path.join(logDir, `kind30382_result_${timestamp}.json`);
                        fs.writeFileSync(resultFile, JSON.stringify(publishResult, null, 2));
                        
                        return res.json({
                            success: true,
                            message: 'Kind 30382 event published successfully',
                            data: publishResult
                        });
                    }
                } catch (parseError) {
                    console.error('Error parsing script output:', parseError);
                }
                
                // Default response if JSON parsing fails
                return res.json({
                    success: true,
                    message: 'Kind 30382 event published successfully',
                    output: output
                });
            } else {
                return res.status(500).json({
                    success: false,
                    message: 'Error publishing Kind 30382 event',
                    error: errorOutput || 'Unknown error'
                });
            }
        });
    } catch (error) {
        console.error('Error publishing Kind 30382 event:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
}

module.exports = {
    handlePublishKind30382
};

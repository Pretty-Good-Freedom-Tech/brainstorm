/**
 * NIP-85 Kind 10040 Commands
 * Handles the creation and publishing of Kind 10040 events for Trusted Assertions
 * These endpoints require authentication
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { getConfigFromFile } = require('../../../../utils/config');

/**
 * Create a Kind 10040 event template
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleCreateKind10040(req, res) {
    try {
        // Check if authenticated
        if (!req.session || !req.session.authenticated) {
            return res.status(401).json({ success: false, message: "Authentication required" });
        }

        console.log('Creating Kind 10040 event template');
        
        const scriptPath = path.join(__dirname, '../../../../../bin/hasenpfeffr-create-kind10040.js');
        
        const child = spawn('node', [scriptPath], {
            env: {
                ...process.env
            }
        });
        
        let output = '';
        let errorOutput = '';
        
        child.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        child.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });
        
        child.on('close', (code) => {
            if (code === 0) {
                console.log('Kind 10040 event template created successfully');
                return res.json({ success: true, message: 'Kind 10040 event template created successfully', data: output });
            } else {
                console.error(`Error creating Kind 10040 event template: ${errorOutput}`);
                return res.status(500).json({ success: false, message: 'Error creating Kind 10040 event template', error: errorOutput });
            }
        });
    } catch (error) {
        console.error('Error creating Kind 10040 event template:', error);
        return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
}

/**
 * Publish a Kind 10040 event
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handlePublishKind10040(req, res) {
    try {
        // Check if authenticated
        if (!req.session || !req.session.authenticated) {
            return res.status(401).json({ success: false, message: "Authentication required" });
        }
        
        console.log('Publishing Kind 10040 event');
        
        // Validate the signed event
        const signedEvent = req.body.signedEvent;
        if (!signedEvent) {
            return res.status(400).json({ success: false, message: 'Missing signed event in request body' });
        }
        
        // Validate the event kind
        if (signedEvent.kind !== 10040) {
            return res.status(400).json({ success: false, message: 'Invalid event kind. Expected 10040' });
        }
        
        // Store nsec in session if provided
        if (req.body.nsec) {
            req.session.nsec = req.body.nsec;
            console.log('Private key stored in session for signing events');
        }
        
        // Define data directories
        const dataDir = '/var/lib/hasenpfeffr/data';
        const publishedDir = path.join(dataDir, 'published');
        
        // Create directories if they don't exist
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        if (!fs.existsSync(publishedDir)) {
            fs.mkdirSync(publishedDir, { recursive: true });
        }
        
        // Save the signed event to a file
        const signedEventFile = path.join(publishedDir, `kind10040_${signedEvent.id.substring(0, 8)}_${Date.now()}.json`);
        fs.writeFileSync(signedEventFile, JSON.stringify(signedEvent, null, 2));
        
        // Execute the publish script with the signed event file
        const scriptPath = path.join(__dirname, '../../../../../src/algos/nip85/publish_nip85_10040.mjs');
        
        // Run the script as a child process
        const child = spawn('node', [scriptPath], {
            env: {
                ...process.env,
                SIGNED_EVENT_FILE: signedEventFile
            }
        });
        
        let output = '';
        let errorOutput = '';
        
        child.stdout.on('data', (data) => {
            const dataStr = data.toString();
            console.log(`publish_nip85_10040.mjs stdout: ${dataStr}`);
            output += dataStr;
        });
        
        child.stderr.on('data', (data) => {
            const dataStr = data.toString();
            console.error(`publish_nip85_10040.mjs stderr: ${dataStr}`);
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
            const logFile = path.join(logDir, `kind10040_${timestamp}.log`);
            fs.writeFileSync(logFile, `STDOUT:\n${output}\n\nSTDERR:\n${errorOutput}\n`);
            
            if (code === 0) {
                try {
                    // Try to parse the output if it's JSON
                    const jsonMatch = output.match(/\{.*\}/s);
                    if (jsonMatch) {
                        const publishResult = JSON.parse(jsonMatch[0]);
                        const resultFile = path.join(logDir, `kind10040_result_${timestamp}.json`);
                        fs.writeFileSync(resultFile, JSON.stringify(publishResult, null, 2));
                        
                        return res.json({
                            success: true,
                            message: 'Kind 10040 event published successfully',
                            data: publishResult
                        });
                    }
                } catch (parseError) {
                    console.error('Error parsing script output:', parseError);
                }
                
                // Default response if JSON parsing fails
                return res.json({
                    success: true,
                    message: 'Kind 10040 event published successfully',
                    output: output
                });
            } else {
                return res.status(500).json({
                    success: false,
                    message: 'Error publishing Kind 10040 event',
                    error: errorOutput || 'Unknown error'
                });
            }
        });
    } catch (error) {
        console.error('Error publishing Kind 10040 event:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
}

module.exports = {
    handleCreateKind10040,
    handlePublishKind10040
};

/**
 * Publish Signed Kind 10040 Event
 * 
 * /api/publish-signed-kind10040
 * 
 * Publishes an already-signed Kind 10040 event for NIP-85 trusted assertions
 * The event must be signed by the user using NIP-07 browser extension
 */

const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { getConfigFromFile } = require('../../../../utils/config');
const nostrTools = require('nostr-tools');

/**
 * Publish signed Kind 10040 event
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handlePublishSignedKind10040(req, res) {
    try {
        // Check if user is authenticated
        if (!req.session.authenticated) {
            return res.status(401).json({ 
                success: false, 
                message: 'Authentication required.' 
            });
        }

        // Get the signed event from the request
        const signedEvent = req.body.signedEvent;
        const customerPubkey = req.body.pubkey;
        
        if (!signedEvent) {
            return res.status(400).json({
                success: false,
                message: 'Signed event is required'
            });
        }

        console.log(`Publishing signed Kind 10040 event for customer: ${customerPubkey ? customerPubkey.substring(0, 8) : 'unknown'}...`);
        
        // Validate the signed event structure
        if (!signedEvent.sig || !signedEvent.id) {
            return res.status(400).json({
                success: false,
                message: 'Event is not properly signed. Missing signature or ID.'
            });
        }

        if (signedEvent.kind !== 10040) {
            return res.status(400).json({
                success: false,
                message: `Expected Kind 10040 event, got Kind ${signedEvent.kind}`
            });
        }

        // Verify the event signature
        console.log('Verifying event signature...');
        const verified = nostrTools.verifyEvent(signedEvent);
        
        if (!verified) {
            return res.status(400).json({
                success: false,
                message: 'Event signature verification failed'
            });
        }

        // Verify the event is from the expected user (if customer pubkey provided)
        if (customerPubkey && signedEvent.pubkey !== customerPubkey) {
            return res.status(400).json({
                success: false,
                message: `Event pubkey does not match expected customer pubkey`
            });
        }

        console.log('✅ Event signature verified successfully');
        console.log(`Event ID: ${signedEvent.id}`);
        console.log(`Signed by: ${signedEvent.pubkey.substring(0, 8)}...`);

        // Save the signed event to a temporary file
        const dataDir = '/var/lib/brainstorm/data';
        const tempDir = path.join(dataDir, 'temp');
        
        // Ensure directories exist
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        // Create a unique filename for the signed event
        const timestamp = Date.now();
        const userIdentifier = customerPubkey ? customerPubkey.substring(0, 8) : signedEvent.pubkey.substring(0, 8);
        const signedEventFile = path.join(tempDir, `kind10040_${userIdentifier}_${timestamp}_signed.json`);
        
        // Write the signed event to file
        fs.writeFileSync(signedEventFile, JSON.stringify(signedEvent, null, 2));
        console.log(`Signed event saved to: ${signedEventFile}`);

        // Get the base directory from config
        const baseDir = getConfigFromFile('BRAINSTORM_MODULE_BASE_DIR', '/usr/local/lib/node_modules/brainstorm');
        
        // Call the publishing script with the signed event file
        const scriptPath = path.join(baseDir, 'bin', 'brainstorm-create-and-publish-kind10040.js');
        const command = `node "${scriptPath}" "${signedEventFile}"`;
        
        console.log(`Executing: ${command}`);

        // Execute the publishing script
        exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
            if (error) {
                console.error('Error executing publishing script:', error);
                console.error('stderr:', stderr);
                
                // Clean up the temporary file
                try {
                    fs.unlinkSync(signedEventFile);
                } catch (cleanupError) {
                    console.warn('Could not clean up temporary file:', cleanupError.message);
                }
                
                return res.status(500).json({
                    success: false,
                    message: `Publishing failed: ${error.message}`,
                    details: stderr
                });
            }

            console.log('Publishing script output:', stdout);
            
            // Check if the script output indicates success
            if (stdout.includes('Event published successfully') || stdout.includes('✅')) {
                res.json({
                    success: true,
                    message: 'Kind 10040 event published successfully',
                    eventId: signedEvent.id,
                    details: stdout
                });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Publishing script completed but success unclear',
                    details: stdout
                });
            }
        });

    } catch (error) {
        console.error('Error publishing signed Kind 10040 event:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error while publishing signed event'
        });
    }
}

module.exports = {
    handlePublishSignedKind10040
};

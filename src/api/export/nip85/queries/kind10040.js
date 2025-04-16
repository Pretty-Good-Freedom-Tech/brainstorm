/**
 * NIP-85 Kind 10040 Queries
 * Handlers for retrieving Kind 10040 event data
 */

const path = require('path');
const fs = require('fs');
const { getConfigFromFile } = require('../../../../utils/config');

/**
 * Get unsigned Kind 10040 event
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function handleGetKind10040Event(req, res) {
    // Check if user is authenticated
    if (!req.session.authenticated) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        // Define data directories
        const dataDir = '/var/lib/brainstorm/data';
        const eventFile = path.join(dataDir, 'kind10040_event.json');
        
        // Check if the event file exists
        if (!fs.existsSync(eventFile)) {
            return res.status(404).json({ 
                success: false, 
                error: 'No kind 10040 event file found. Please create an event first.' 
            });
        }
        
        // Read the event file
        const eventData = fs.readFileSync(eventFile, 'utf8');
        const event = JSON.parse(eventData);
        
        // Get the owner's pubkey from config
        const ownerPubkey = getConfigFromFile('BRAINSTORM_OWNER_PUBKEY');
        
        // Set pubkey to the owner's pubkey
        event.pubkey = ownerPubkey;
        
        // Remove any existing signature if present
        delete event.sig;
        delete event.id;
        
        // Return the event data along with the session challenge
        return res.json({ 
            success: true, 
            event: event,
            challenge: req.session.challenge
        });
    } catch (error) {
        console.error('Error getting kind 10040 event:', error);
        return res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
}

module.exports = {
    handleGetKind10040Event
};

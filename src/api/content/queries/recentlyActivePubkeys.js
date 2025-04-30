/**
 * Recently Active Pubkeys Query
 * Returns a list of pubkeys that have been active within the last 24 hours
 * queries strfry for all kind 1 notes from the last 24 hours
 * return the entire list of pubkeys
 */

const { execSync } = require('child_process');

/**
 * Handler for getting recently active pubkeys
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */

function handleGetRecentlyActivePubkeys(req, res) {
    try {
        const unixTime24HoursAgo = Math.floor(Date.now() / 1000) - (24 * 60 * 60);
        const getEventsCmd = `sudo strfry scan '{"kinds":[1], "since": ${unixTime24HoursAgo}}'`;
        const output = execSync(getEventsCmd).toString().trim();
        if (output) {
            const events = JSON.parse(output);
            const pubkeys = events.map(event => event.pubkey);
            return res.json({
                success: true,
                pubkeys: pubkeys
            });
        }
    } catch (error) {
        console.error('Error getting recently active pubkeys:', error);
        return res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
}

module.exports = {
    handleGetRecentlyActivePubkeys
};
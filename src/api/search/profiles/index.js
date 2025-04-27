/**
 * Search Profiles API
 * Provides data for searching profiles
 * 
 * Search kind0 notes in strfry database
 * 
 * Returns an array of pubkeys
 */

const { exec } = require('child_process');
const { nip19 } = require('nostr-tools');

/**
 * Search profiles
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handleSearchProfiles(req, res) {
    const searchField = req.query.searchField; // npub (fragment), pubkey (fragment), kind0 (name, username, about, picture, banner, lnpub)
    const searchString = req.query.searchString;
    
    if (!searchField || !searchString) {
        return res.status(400).json({
            success: false,
            error: 'Missing search parameter'
        });
    }

    // if searchField == npub, then use nip19 to get the pubkey
    if (searchField === 'npub') {
        const { pubkey } = nip19.decode(searchString);
        searchResult = pubkey;
        // return here
        return res.json({
            success: true,
            output: searchResult,
            error: null
        });
    }

    // if searchField == kind0, then use strfry to search
    if (searchField === 'kind0') {
        // Retrieve all kind 0 events from strfry database
        // execute this bash command:
        // sudo strfry scan '{"kind": [0]}'
        // Build the command for all kind0 notes
        const command = `sudo strfry scan '{"kind": [0]}'`;
        console.log(`Executing command: ${command}`);
        
        exec(command, (error, stdout, stderr) => {
            // Check if the response has already been sent
            if (res.headersSent) {
                console.log('Response already sent, search continuing in background');
                return;
            }
            
            // if searchField == kind0, scan through events to find matches
            const events = JSON.parse(stdout);
            const matches = events.filter(event => event.content.includes(searchString));
            return res.json({
                success: true,
                output: matches,
                error: null
            });
        });
    }
}

module.exports = {
    handleSearchProfiles
};

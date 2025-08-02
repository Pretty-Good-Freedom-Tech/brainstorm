const fs = require('fs');
const nostrTools = require('nostr-tools');
const { SecureKeyStorage } = require('./secureKeyStorage');

/**
 * Customer Relay Key Management Utilities
 * Provides functions for generating and managing customer relay keys
 */

/**
 * Generate a new set of relay keys (privkey, pubkey, npub, nsec)
 * @returns {Object} Object containing privkey, pubkey, npub, nsec
 */
function generateRelayKeys() {
    try {
        const privateKey = nostrTools.generateSecretKey();
        const pubkey = nostrTools.getPublicKey(privateKey);
        const npub = nostrTools.nip19.npubEncode(pubkey);
        const nsecEncoded = nostrTools.nip19.nsecEncode(privateKey);
        
        // Convert hex to string for storage
        const privateKeyHex = Buffer.from(privateKey).toString('hex');
        
        return {
            privkey: privateKeyHex,
            nsec: nsecEncoded,
            pubkey: pubkey,
            npub: npub
        };
    } catch (error) {
        console.error(`Error generating relay keys:`, error.message);
        throw new Error(`Failed to generate relay keys: ${error.message}`);
    }
}

/**
 * Get the current brainstorm.conf file contents
 * @returns {string} Contents of brainstorm.conf
 */
function getBrainstormConfFile() {
    try {
        return fs.readFileSync('/etc/brainstorm.conf', 'utf8');
    } catch (error) {
        console.error(`Error reading brainstorm.conf: ${error.message}`);
        throw new Error(`Failed to read brainstorm.conf: ${error.message}`);
    }
}

/**
 * Create and store relay keys for a single customer
 * Uses secure storage for private keys and public config for public keys
 * @param {string} customer_pubkey - Customer's public key
 * @param {number|string} customer_id - Customer's ID
 * @param {string} customer_name - Customer's name
 * @returns {Object} Generated keys object
 */
async function createSingleCustomerRelay(customer_pubkey, customer_id, customer_name) {
    try {
        const keys = generateRelayKeys();
        const secureStorage = new SecureKeyStorage();

        // Log customer processing
        console.log(`Processing customer: ${customer_name} (id: ${customer_id}) with pubkey ${customer_pubkey}`);

        // Store private keys securely
        await secureStorage.storeRelayKeys(customer_pubkey, keys);
        console.log(`Securely stored private relay keys for customer: ${customer_name}`);

        // Create public configuration string for brainstorm.conf (no private keys)
        const newBrainstormConfString = `
#################### CUSTOMER id: ${customer_id} ####################
# PUBKEY: ${customer_pubkey}
# NAME: ${customer_name}
export CUSTOMER_${customer_pubkey}_RELAY_PUBKEY='${keys.pubkey}'
export CUSTOMER_${customer_pubkey}_RELAY_NPUB='${keys.npub}'
# Private keys stored securely - use getCustomerRelayKeys() to access
# keys added by createSingleCustomerRelay on ${new Date().toISOString()}
#############################################################
`;

        // Add public keys to brainstorm.conf
        const brainstormConf = getBrainstormConfFile();
        const newBrainstormConf = brainstormConf + newBrainstormConfString;
        
        console.log(`Writing public relay keys for customer ${customer_name} to brainstorm.conf`);
        fs.writeFileSync('/etc/brainstorm.conf', newBrainstormConf);

        console.log(`Successfully created relay keys for customer: ${customer_name}`);
        return keys;
    } catch (error) {
        console.error(`Error creating relay keys for customer ${customer_name}:`, error);
        throw error;
    }
}

/**
 * Check if a customer already has relay keys in brainstorm.conf
 * @param {string} customer_pubkey - Customer's public key
 * @returns {boolean} True if customer already has relay keys
 */
function customerHasRelayKeys(customer_pubkey) {
    try {
        const brainstormConf = getBrainstormConfFile();
        return brainstormConf.includes(`CUSTOMER_${customer_pubkey}_RELAY_PUBKEY`);
    } catch (error) {
        console.error(`Error checking customer relay keys: ${error.message}`);
        return false;
    }
}

/**
 * Get existing relay keys for a customer from brainstorm.conf
 * @param {string} customer_pubkey - Customer's public key
 * @returns {Object|null} Relay keys object or null if not found
 */
function getCustomerRelayKeys(customer_pubkey) {
    try {
        const brainstormConf = getBrainstormConfFile();
        
        // Extract keys using regex patterns
        const pubkeyMatch = brainstormConf.match(new RegExp(`CUSTOMER_${customer_pubkey}_RELAY_PUBKEY='([^']+)'`));
        const npubMatch = brainstormConf.match(new RegExp(`CUSTOMER_${customer_pubkey}_RELAY_NPUB='([^']+)'`));
        const privkeyMatch = brainstormConf.match(new RegExp(`CUSTOMER_${customer_pubkey}_RELAY_PRIVKEY='([^']+)'`));
        const nsecMatch = brainstormConf.match(new RegExp(`CUSTOMER_${customer_pubkey}_RELAY_NSEC='([^']+)'`));
        
        if (pubkeyMatch && npubMatch && privkeyMatch && nsecMatch) {
            return {
                pubkey: pubkeyMatch[1],
                npub: npubMatch[1],
                privkey: privkeyMatch[1],
                nsec: nsecMatch[1]
            };
        }
        
        return null;
    } catch (error) {
        console.error(`Error getting customer relay keys: ${error.message}`);
        return null;
    }
}

module.exports = {
    generateRelayKeys,
    createSingleCustomerRelay,
    getCustomerRelayKeys,
    hasCustomerRelayKeys,
    customerHasRelayKeys,
    getCustomerRelayKeysFromConf,
    getBrainstormConfFile
};

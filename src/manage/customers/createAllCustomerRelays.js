#!/usr/bin/env node

/**
 * createAllCustomerRelays.js - Generate relay nsec, privkey, pubkey, npub for all customers
 * and export results to /etc/brainstorm.conf
 * Usage: node createAllCustomerRelays.js
 * 
 * Exported keys to brainstorm.conf will be added to the end of the file and formatted as per this example:
#################### CUSTOMER id: 3 ####################
# PUBKEY: df67f9a7e41125745cbe7acfbdcd03691780c643df7bad70f5d2108f2d4fc200
# NAME: manime
export CUSTOMER_df67f9a7e41125745cbe7acfbdcd03691780c643df7bad70f5d2108f2d4fc200_RELAY_PUBKEY='...'
export CUSTOMER_df67f9a7e41125745cbe7acfbdcd03691780c643df7bad70f5d2108f2d4fc200_RELAY_NPUB='...'
export CUSTOMER_df67f9a7e41125745cbe7acfbdcd03691780c643df7bad70f5d2108f2d4fc200_RELAY_PRIVKEY='...'
export CUSTOMER_df67f9a7e41125745cbe7acfbdcd03691780c643df7bad70f5d2108f2d4fc200_RELAY_NSEC='...'
# keys added by createAllCustomerRelays.js
#############################################################
*/

const fs = require('fs');
const path = require('path');

const nostrTools = require('nostr-tools');

// Function to generate npub from pubkey
function generateKeys_deprecating() {
    try {
        const privateKey = nostrTools.generateSecretKey();
        const pubkey = nostrTools.getPublicKey(privateKey);
        const npub = nostrTools.nip19.npubEncode(pubkey);
        const nsecEncoded = nostrTools.nip19.nsecEncode(privateKey);
        
        // Convert hex to string for storage
        const privateKeyHex = Buffer.from(privateKey).toString('hex');
        
        
        return JSON.stringify({
            privkey: privateKeyHex,
            nsec: nsecEncoded,
            pubkey: pubkey,
            npub: npub
        });
    } catch (error) {
        console.error(`Error generating keys`, error.message);
        return null;
    }
}

// Function to log messages with timestamp
function logMessage(message) {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp}: ${message}`);
}

function createSingleCustomerRelay_deprecating(customer_pubkey, customer_id, customer_name) {
    try {
        const keys = JSON.parse(generateKeys_deprecating());

        // log customer
        console.log(`Processing customer: ${customer_name} (id: ${customer_id}) with pubkey ${customer_pubkey}`);

        // Log keys
        console.log(JSON.stringify(keys));

        // create string to add to brainstorm.conf, formatted as per the above example
        const newBrainstormConfString = `
#################### CUSTOMER id: ${customer_id} ####################
# PUBKEY: ${customer_pubkey}
# NAME: ${customer_name}
export CUSTOMER_${customer_pubkey}_RELAY_PUBKEY='${keys.pubkey}'
export CUSTOMER_${customer_pubkey}_RELAY_NPUB='${keys.npub}'
export CUSTOMER_${customer_pubkey}_RELAY_PRIVKEY='${keys.privkey}'
export CUSTOMER_${customer_pubkey}_RELAY_NSEC='${keys.nsec}'
# keys added by createAllCustomerRelays.js on ${new Date().toISOString()}
#############################################################
`;

        // Add keys to brainstorm.conf
        const brainstormConf = getBrainstormConfFile();
        const newBrainstormConf = brainstormConf + newBrainstormConfString;
        console.log(`newBrainstormConf: ${newBrainstormConf}`);
        fs.writeFileSync('/etc/brainstorm.conf', newBrainstormConf);

        return keys;

    } catch (error) {
        console.error(`Error in createCustomerRelay.js: ${error.message}`);
        process.exit(1);
    }
}

function getCustomers() {
    // get ALL customers (not just active) from `/var/lib/brainstorm/customers/customers.json`
    try {
        // get file contents
        const customers = fs.readFileSync('/var/lib/brainstorm/customers/customers.json', 'utf8');
        return JSON.parse(customers);
    } catch (error) {
        console.error(`Error in createAllCustomerRelays.js: ${error.message}`);
        process.exit(1);
    }
}

function getBrainstormConfFile() {
    try {
        // get file contents
        const brainstormConf = fs.readFileSync('/etc/brainstorm.conf', 'utf8');
        return brainstormConf;
    } catch (error) {
        console.error(`Error in createAllCustomerRelays.js: ${error.message}`);
        process.exit(1);
    }
}

function processAllCustomers() {
    try {
        const customers = getCustomers();
        for (const customerDirectoryName of Object.keys(customers.customers)) {
            console.log(`customerDirectoryName: ${customerDirectoryName}`)
            const customer_pubkey = customers.customers[customerDirectoryName].pubkey
            const customer_id = customers.customers[customerDirectoryName].id
            const customer_name = customers.customers[customerDirectoryName].name
            console.log(`customer_id: ${customer_id}`)
            // Check if customer already has a relay pubkey in brainstorm.conf
            if (customerHasRelayKeys(customer_pubkey)) {
                console.log(`Customer ${customer_id} already has a relay pubkey in brainstorm.conf`)
                continue;
            } else {
                const keys = createSingleCustomerRelay(customer_pubkey, customer_id, customer_name);
                console.log(`keys: ${JSON.stringify(keys)}`);
            }
        }
    } catch (error) {
        console.error(`Error in createAllCustomerRelays.js: ${error.message}`);
        process.exit(1);
    }
}

// Main function
function main() {
    try {
        processAllCustomers();

        process.exit(0);

    } catch (error) {
        console.error(`Error in createCustomerRelay.js: ${error.message}`);
        process.exit(1);
    }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Run main function
main();

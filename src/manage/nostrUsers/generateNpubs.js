#!/usr/bin/env node

/**
 * generateNpubs.js - Generate npub values from pubkeys using nip19.npubEncode
 * Usage: node generateNpubs.js <input_file> <output_file>
 */

const fs = require('fs');
const path = require('path');
const { nip19 } = require('nostr-tools');

// Function to generate npub from pubkey
function generateNpub(pubkey) {
    try {
        if (!pubkey) return null;
        
        // If pubkey is already npub, return as-is
        if (pubkey.startsWith('npub')) return pubkey;
        
        // Use nostr-tools nip19 to encode pubkey to npub
        return nip19.npubEncode(pubkey);
    } catch (error) {
        console.error(`Error generating npub for pubkey ${pubkey}:`, error.message);
        return null;
    }
}

// Function to log messages with timestamp
function logMessage(message) {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp}: ${message}`);
}

// Main function
async function main() {
    // Check command line arguments
    if (process.argv.length !== 4) {
        console.error('Usage: node generateNpubs.js <input_file> <output_file>');
        process.exit(1);
    }

    const inputFile = process.argv[2];
    const outputFile = process.argv[3];

    try {
        // Read input file
        logMessage(`Reading input file: ${inputFile}`);
        
        if (!fs.existsSync(inputFile)) {
            throw new Error(`Input file does not exist: ${inputFile}`);
        }

        const inputData = fs.readFileSync(inputFile, 'utf8');
        let users;

        try {
            users = JSON.parse(inputData);
        } catch (parseError) {
            throw new Error(`Invalid JSON in input file: ${parseError.message}`);
        }

        if (!Array.isArray(users)) {
            throw new Error('Input file must contain an array of user objects');
        }

        logMessage(`Processing ${users.length} users`);

        // Generate npubs for each user
        const results = [];
        let successCount = 0;
        let errorCount = 0;

        for (const user of users) {
            if (!user.pubkey) {
                logMessage(`Skipping user with missing pubkey`);
                errorCount++;
                continue;
            }

            const npub = generateNpub(user.pubkey);
            
            if (npub) {
                results.push({
                    pubkey: user.pubkey,
                    npub: npub
                });
                successCount++;
            } else {
                logMessage(`Failed to generate npub for pubkey: ${user.pubkey}`);
                errorCount++;
            }
        }

        logMessage(`Successfully generated ${successCount} npubs, ${errorCount} errors`);

        // Write results to output file
        logMessage(`Writing results to: ${outputFile}`);
        
        // Ensure output directory exists
        const outputDir = path.dirname(outputFile);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Write JSON output
        fs.writeFileSync(outputFile, JSON.stringify(results, null, 2), 'utf8');

        logMessage(`Successfully wrote ${results.length} npub records to ${outputFile}`);

        // Validate output file
        try {
            const outputData = fs.readFileSync(outputFile, 'utf8');
            JSON.parse(outputData);
            logMessage('Output file validation successful');
        } catch (validationError) {
            throw new Error(`Output file validation failed: ${validationError.message}`);
        }

        process.exit(0);

    } catch (error) {
        console.error(`Error in generateNpubs.js: ${error.message}`);
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

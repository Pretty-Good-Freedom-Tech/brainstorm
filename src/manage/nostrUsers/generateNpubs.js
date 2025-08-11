#!/usr/bin/env node

/**
 * generateNpubs.js - Generate npub values from pubkeys using nip19.npubEncode
 * Usage: node generateNpubs.js <input_file> <output_file>
 */

const fs = require('fs');
const path = require('path');
const { nip19 } = require('nostr-tools');

// Import structured logging utilities
const { emitTaskEvent } = require('../../utils/structuredLogging.js');

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

    // Emit structured event for task start
    await emitTaskEvent('TASK_START', 'generateNpubs', 'system', {
        message: 'Starting npub generation from pubkeys',
        task_type: 'npub_generation',
        operation: 'generate_npubs_from_pubkeys',
        input_file: inputFile,
        output_file: outputFile,
        phases: ['initialization_and_validation', 'json_processing', 'npub_generation', 'output_and_validation'],
        nip19_library: 'nostr-tools',
        category: 'maintenance',
        scope: 'system',
        parent_task: 'npubManager'
    });

    try {
        // Emit structured event for Phase 1 start
        await emitTaskEvent('PROGRESS', 'generateNpubs', 'system', {
            message: 'Starting Phase 1: Initialization and validation',
            phase: 'initialization_and_validation',
            step: 'phase_1_start',
            operation: 'generate_npubs_from_pubkeys',
            input_file: inputFile,
            scope: 'system'
        });

        // Read input file
        logMessage(`Reading input file: ${inputFile}`);
        
        if (!fs.existsSync(inputFile)) {
            throw new Error(`Input file does not exist: ${inputFile}`);
        }

        const inputData = fs.readFileSync(inputFile, 'utf8');
        let users;

        // Emit structured event for Phase 1 completion and Phase 2 start
        await emitTaskEvent('PROGRESS', 'generateNpubs', 'system', {
            message: 'Phase 1 completed, starting Phase 2: JSON processing',
            phase: 'json_processing',
            step: 'phase_2_start',
            operation: 'generate_npubs_from_pubkeys',
            input_file_validated: true,
            scope: 'system'
        });

        try {
            users = JSON.parse(inputData);
        } catch (parseError) {
            throw new Error(`Invalid JSON in input file: ${parseError.message}`);
        }

        if (!Array.isArray(users)) {
            throw new Error('Input file must contain an array of user objects');
        }

        logMessage(`Processing ${users.length} users`);

        // Emit structured event for Phase 2 completion and Phase 3 start
        await emitTaskEvent('PROGRESS', 'generateNpubs', 'system', {
            message: 'Phase 2 completed, starting Phase 3: Npub generation',
            phase: 'npub_generation',
            step: 'phase_3_start',
            operation: 'generate_npubs_from_pubkeys',
            json_parsed: true,
            total_users: users.length,
            scope: 'system'
        });

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

        // Emit structured event for Phase 3 completion and Phase 4 start
        await emitTaskEvent('PROGRESS', 'generateNpubs', 'system', {
            message: 'Phase 3 completed, starting Phase 4: Output and validation',
            phase: 'output_and_validation',
            step: 'phase_4_start',
            operation: 'generate_npubs_from_pubkeys',
            npub_generation_complete: true,
            success_count: successCount,
            error_count: errorCount,
            total_results: results.length,
            scope: 'system'
        });

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

        // Emit structured event for successful completion
        await emitTaskEvent('TASK_END', 'generateNpubs', 'system', {
            message: 'Npub generation completed successfully',
            status: 'success',
            task_type: 'npub_generation',
            operation: 'generate_npubs_from_pubkeys',
            phases_completed: ['initialization_and_validation', 'json_processing', 'npub_generation', 'output_and_validation'],
            input_file: inputFile,
            output_file: outputFile,
            total_users_processed: users.length,
            successful_npubs: successCount,
            failed_npubs: errorCount,
            total_results: results.length,
            nip19_library: 'nostr-tools',
            json_validated: true,
            category: 'maintenance',
            scope: 'system',
            parent_task: 'npubManager'
        });

        process.exit(0);

    } catch (error) {
        console.error(`Error in generateNpubs.js: ${error.message}`);
        
        // Emit structured event for error
        await emitTaskEvent('TASK_ERROR', 'generateNpubs', 'system', {
            message: 'Npub generation failed',
            error: 'npub_generation_failure',
            error_message: error.message,
            operation: 'generate_npubs_from_pubkeys',
            input_file: inputFile,
            output_file: outputFile,
            scope: 'system'
        });
        
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

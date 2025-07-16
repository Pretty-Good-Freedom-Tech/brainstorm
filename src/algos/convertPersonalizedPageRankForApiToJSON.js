#!/usr/bin/env node

/*
This script converts the output of personalizedPageRankForApi.sh into a JSON object
REF_PUBKEY is passed as an argument
Inputs:
- /tmp/personalizedPageRankForApi_${REF_PUBKEY}.txt
Outputs:
- /var/lib/brainstorm/api/personalizedPageRankForApi/${REF_PUBKEY}/scores.json

Format of /tmp/personalizedPageRankForApi_${REF_PUBKEY}.txt:
pubkey, score
"e5272de914bd301755c439b88e6959a43c9d2664831f093c51e9c799a16a102f", 1.0
"82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2", 0.010197954758888813
"6e468422dfb74a5738702a8823b9b28168abab8655faacb6853cd0ee15deee93", 0.006511804743068911
"04c915daefee38317fa734444acee390a8269fe5810b2241e5e6dd343dfbecc9", 0.006237767662376526
"32e1827635450ebb3c5a7d12c1f8e7b2b514439ac10a67eef3d9fd9c5c68e245", 0.006164443340432288
"088436cd039ff89074468fd327facf62784eeb37490e0a118ab9f14c9d2646cc", 0.005460606123982643
"eab0e756d32b80bcd464f3d844b8040303075a13eabc3599a762c9ac7ab91f4f", 0.005444869260823641
"3efdaebb1d8923ebd99c9e7ace3b4194ab45512e2be79c1b7d68d9243e0d2681", 0.005440176875596166
"3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d", 0.005215513516716255
"50d94fc2d8580c682b071a542f8b1e31a200b0508bab95a33bef0855df281d63", 0.004916516480126884
"472f440f29ef996e92a186b8d320ff180c855903882e59d50de1b8bd5669301e", 0.0048712476001957885
*/

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { createReadStream } = require('fs');
const { promisify } = require('util');

// Configuration
const BRAINSTORM_API_DIR = '/var/lib/brainstorm/api';
const BRAINSTORM_MODULE_ALGOS_DIR = '/usr/local/lib/node_modules/brainstorm/src/algos';
const BRAINSTORM_LOG_DIR = '/var/log/brainstorm';

// Get pubkey as an argument
const pubkey = process.argv[2];

// Check if pubkey is provided
if (!pubkey) {
    console.error('Please provide a pubkey as an argument');
    process.exit(1);
}

// Validate pubkey format (64 character hex string)
if (!/^[a-fA-F0-9]{64}$/.test(pubkey)) {
    console.error('Invalid pubkey format. Must be 64 character hex string.');
    process.exit(1);
}

// File paths
const inputFilePath = `/tmp/personalizedPageRankForApi_${pubkey}.txt`;
const outputDir = `/var/lib/brainstorm/api/personalizedPageRankForApi/${pubkey}`;
const outputFilePath = `${outputDir}/scores.json`;

// Check if input file exists
if (!fs.existsSync(inputFilePath)) {
    console.error(`Input file not found: ${inputFilePath}`);
    process.exit(1);
}

// Main processing function
async function processFile() {
    const startTime = Date.now();
    console.log(`Starting to process file: ${inputFilePath}`);
    
    try {
        // Create output directory if it doesn't exist
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Initialize scores object
        const scores = {};
        let lineCount = 0;
        let processedCount = 0;
        let isFirstLine = true;
        
        // Create readable stream with larger buffer for better performance
        const fileStream = createReadStream(inputFilePath, { 
            highWaterMark: 64 * 1024 // 64KB buffer
        });
        
        // Create readline interface
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });
        
        // Process lines using event-driven approach
        return new Promise((resolve, reject) => {
            rl.on('line', (line) => {
                lineCount++;
                
                // Skip header line
                if (isFirstLine) {
                    isFirstLine = false;
                    return;
                }
                
                // Skip empty lines
                if (!line.trim()) return;
                
                try {
                    // Parse line - handle CSV format with potential quotes
                    const trimmedLine = line.trim();
                    const commaIndex = trimmedLine.lastIndexOf(',');
                    
                    if (commaIndex === -1) {
                        console.warn(`Skipping malformed line ${lineCount}: ${line}`);
                        return;
                    }
                    
                    // Extract pubkey and score
                    let linePubkey = trimmedLine.substring(0, commaIndex).trim();
                    let scoreStr = trimmedLine.substring(commaIndex + 1).trim();
                    
                    // Remove quotes if present
                    linePubkey = linePubkey.replace(/^"|"$/g, '');
                    scoreStr = scoreStr.replace(/^"|"$/g, '');
                    
                    // Validate pubkey format
                    if (!/^[a-fA-F0-9]{64}$/.test(linePubkey)) {
                        console.warn(`Skipping invalid pubkey at line ${lineCount}: ${linePubkey}`);
                        return;
                    }
                    
                    // Parse score
                    const score = parseFloat(scoreStr);
                    if (isNaN(score)) {
                        console.warn(`Skipping invalid score at line ${lineCount}: ${scoreStr}`);
                        return;
                    }
                    
                    // Skip duplicates (keep first occurrence)
                    if (scores.hasOwnProperty(linePubkey)) {
                        return;
                    }
                    
                    // Add to scores
                    scores[linePubkey] = score;
                    processedCount++;
                    
                    // Progress reporting for large files
                    if (processedCount % 10000 === 0) {
                        console.log(`Processed ${processedCount} records...`);
                    }
                    
                } catch (error) {
                    console.warn(`Error processing line ${lineCount}: ${error.message}`);
                }
            });
            
            rl.on('close', () => {
                console.log(`Finished reading file. Processed ${processedCount} records from ${lineCount} lines.`);
                resolve(scores);
            });
            
            rl.on('error', (error) => {
                console.error(`Error reading file: ${error.message}`);
                reject(error);
            });
            
            // Handle stream errors
            fileStream.on('error', (error) => {
                console.error(`Error opening file: ${error.message}`);
                reject(error);
            });
        });
        
    } catch (error) {
        console.error(`Error during file processing: ${error.message}`);
        throw error;
    }
}

// Write JSON file function
async function writeJsonFile(scores) {
    try {
        console.log('Writing JSON file...');
        
        // Remove existing file if it exists
        if (fs.existsSync(outputFilePath)) {
            fs.unlinkSync(outputFilePath);
        }
        
        // Write scores to file with pretty formatting for readability
        const jsonContent = JSON.stringify(scores, null, 2);
        fs.writeFileSync(outputFilePath, jsonContent, 'utf8');
        
        console.log(`Successfully wrote ${Object.keys(scores).length} scores to: ${outputFilePath}`);
        
        // Get file size for reporting
        const stats = fs.statSync(outputFilePath);
        const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`Output file size: ${fileSizeMB} MB`);
        
    } catch (error) {
        console.error(`Error writing JSON file: ${error.message}`);
        throw error;
    }
}

// Main execution
async function main() {
    const startTime = Date.now();
    
    try {
        // Process the input file
        const scores = await processFile();
        
        // Write the JSON output
        await writeJsonFile(scores);
        
        const endTime = Date.now();
        const processingTime = ((endTime - startTime) / 1000).toFixed(2);
        
        console.log(`\nProcessing completed successfully in ${processingTime} seconds`);
        console.log(`Total unique pubkeys processed: ${Object.keys(scores).length}`);
        
        // Clean up input file
        try {
            fs.unlinkSync(inputFilePath);
            console.log(`Cleaned up input file: ${inputFilePath}`);
        } catch (cleanupError) {
            console.warn(`Warning: Could not clean up input file: ${cleanupError.message}`);
        }
        
        process.exit(0);
        
    } catch (error) {
        console.error(`\nFatal error: ${error.message}`);
        process.exit(1);
    }
}

// Run the main function
main();

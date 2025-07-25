/**
 * calculateReportsUpdates.js
 * 
 * This script compares reports data between strfry and Neo4j to determine which
 * reports need to be added to Neo4j.
 */

const fs = require('fs');
const path = require('path');

// Configuration
const config = {
  // Directory containing report files from strfry
  strfryDir: path.join(__dirname, 'currentRelationshipsFromStrfry/reports'),
  // Directory containing report files from Neo4j
  neo4jDir: path.join(__dirname, 'currentRelationshipsFromNeo4j/reports'),
  // Output directory for results
  outputDir: path.join(__dirname, 'json'),
  // Concurrency for batch processing
  concurrency: 10
};

/**
 * Ensure the output directory exists
 */
function ensureOutputDirectory() {
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
  }
}

/**
 * Log a message with timestamp
 * @param {string} message - Message to log
 */
function log(message) {
  const timestamp = new Date().getTime();
  console.log(`[${timestamp}]: calculateReportsUpdates - ${message}`);
}

/**
 * Process a single strfry report file and find reports to add
 * @param {string} strfryFile - Path to the strfry report file
 * @param {WriteStream} outputStream - Stream to write results to
 * @returns {Promise<number>} - Number of reports to add
 */
async function processStrfryFile(strfryFile, outputStream) {
  // Get the rater pubkey from the filename
  const filename = path.basename(strfryFile);
  
  // Skip summary files or non-json files
  if (filename === '_summary.json' || !filename.endsWith('.json')) {
    return 0;
  }
  
  const raterPubkey = filename.replace('.json', '');
  const neo4jFile = path.join(config.neo4jDir, filename);
  let reportsAdded = 0;
  const timestamp = Math.floor(Date.now() / 1000);
  
  try {
    // Read the strfry file
    const strfryData = JSON.parse(fs.readFileSync(strfryFile, 'utf8'));
    
    // Validate strfry data format
    if (!strfryData[raterPubkey]) {
      log(`Warning: Invalid strfry file format for ${raterPubkey}, skipping`);
      return 0;
    }
    
    // Check if this rater exists in Neo4j
    if (!fs.existsSync(neo4jFile)) {
      // This rater doesn't exist in Neo4j, all reports should be added
      for (const reportType in strfryData[raterPubkey]) {
        for (const ratee in strfryData[raterPubkey][reportType]) {
          // Generate a report object with report_type field
          const report = {
            pk_rater: raterPubkey,
            pk_ratee: ratee,
            report_type: reportType,
            timestamp
          };
          
          // Make sure we're properly handling write operation with backpressure
          const canContinue = outputStream.write(JSON.stringify(report) + '\n');
          if (!canContinue) {
            // If backpressure is detected, wait for the drain event
            await new Promise(resolve => outputStream.once('drain', resolve));
          }
          reportsAdded++;
        }
      }
      
      if (reportsAdded > 0) {
        // log(`Added ${reportsAdded} new reports for new rater ${raterPubkey}`);
      }
      return reportsAdded;
    }
    
    // Rater exists in Neo4j, compare reports
    const neo4jData = JSON.parse(fs.readFileSync(neo4jFile, 'utf8'));
    
    // Validate Neo4j data format
    if (!neo4jData[raterPubkey]) {
      log(`Warning: Invalid Neo4j file format for ${raterPubkey}, treating as empty`);
      
      // Treat as if the Neo4j file is empty, add all strfry reports
      for (const reportType in strfryData[raterPubkey]) {
        for (const ratee in strfryData[raterPubkey][reportType]) {
          // Generate a report object with report_type field
          const report = {
            pk_rater: raterPubkey,
            pk_ratee: ratee,
            report_type: reportType,
            timestamp
          };
          
          // Make sure we're properly handling write operation with backpressure
          const canContinue = outputStream.write(JSON.stringify(report) + '\n');
          if (!canContinue) {
            // If backpressure is detected, wait for the drain event
            await new Promise(resolve => outputStream.once('drain', resolve));
          }
          reportsAdded++;
        }
      }
      
      if (reportsAdded > 0) {
        // log(`Added ${reportsAdded} new reports for rater ${raterPubkey} with missing Neo4j data`);
      }
      return reportsAdded;
    }
    
    // Compare reports by report_type and ratee
    for (const reportType in strfryData[raterPubkey]) {
      // Check if this report type exists in Neo4j for this rater
      if (!neo4jData[raterPubkey][reportType]) {
        // This report type doesn't exist in Neo4j, add all ratees for this report type
        for (const ratee in strfryData[raterPubkey][reportType]) {
          const report = {
            pk_rater: raterPubkey,
            pk_ratee: ratee,
            report_type: reportType,
            timestamp
          };
          
          // Make sure we're properly handling write operation with backpressure
          const canContinue = outputStream.write(JSON.stringify(report) + '\n');
          if (!canContinue) {
            // If backpressure is detected, wait for the drain event
            await new Promise(resolve => outputStream.once('drain', resolve));
          }
          reportsAdded++;
        }
        continue; // Skip to next report type since we've added all for this type
      }
      
      // Report type exists, compare individual ratees
      for (const ratee in strfryData[raterPubkey][reportType]) {
        if (!neo4jData[raterPubkey][reportType][ratee]) {
          // This ratee doesn't exist in Neo4j for this report type, add it
          const report = {
            pk_rater: raterPubkey,
            pk_ratee: ratee,
            report_type: reportType,
            timestamp
          };
          
          // Make sure we're properly handling write operation with backpressure
          const canContinue = outputStream.write(JSON.stringify(report) + '\n');
          if (!canContinue) {
            // If backpressure is detected, wait for the drain event
            await new Promise(resolve => outputStream.once('drain', resolve));
          }
          reportsAdded++;
        }
      }
    }
    
    if (reportsAdded > 0) {
      // log(`Added ${reportsAdded} new reports for existing rater ${raterPubkey}`);
    }
    
    return reportsAdded;
  } catch (error) {
    log(`Error processing file ${strfryFile}: ${error.message}`);
    return 0;
  }
}

/**
 * Process files in batches to control memory usage
 * @param {Array<string>} files - Array of files to process
 * @param {WriteStream} outputStream - Stream to write results to
 * @param {number} concurrency - Number of files to process concurrently
 * @returns {Promise<number>} - Total number of reports to add
 */
async function processFilesInBatches(files, outputStream, concurrency) {
  let totalReportsAdded = 0;
  let processedFiles = 0;
  const totalFiles = files.length;
  
  // Process files in batches
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(file => processStrfryFile(file, outputStream)));
    
    // Update counters
    const batchReportsAdded = results.reduce((sum, count) => sum + count, 0);
    totalReportsAdded += batchReportsAdded;
    processedFiles += batch.length;
    
    // Report progress
    const progress = Math.round((processedFiles / totalFiles) * 100);
    log(`Progress: ${progress}% (${processedFiles}/${totalFiles}) - Added ${batchReportsAdded} reports in this batch`);
    
    // Force garbage collection if available
    if (global.gc) global.gc();
  }
  
  return totalReportsAdded;
}

/**
 * Main execution function
 */
async function main() {
  try {
    const startTime = Date.now();
    log('Starting calculation of reports to add to Neo4j');
    
    // Ensure output directory exists
    ensureOutputDirectory();
    
    // Create output file stream
    const outputFile = path.join(config.outputDir, 'reportsToAddToNeo4j.json');
    fs.writeFileSync(outputFile, ''); // Clear the file if it exists
    const outputStream = fs.createWriteStream(outputFile, {flags: 'w'});
    
    // Get all strfry report files
    let strfryFiles = [];
    if (fs.existsSync(config.strfryDir)) {
      strfryFiles = fs.readdirSync(config.strfryDir)
        .filter(file => file !== '_summary.json' && file.endsWith('.json'))
        .map(file => path.join(config.strfryDir, file));
    }
    
    log(`Found ${strfryFiles.length} rater files to process`);
    
    // Process files and find reports to add
    const totalReportsAdded = await processFilesInBatches(strfryFiles, outputStream, config.concurrency);
    
    // Make sure all data is flushed to disk
    await new Promise((resolve, reject) => {
      outputStream.end(() => {
        log('Output stream successfully closed');
        resolve();
      });
      outputStream.on('error', (err) => {
        log(`Error closing output stream: ${err.message}`);
        reject(err);
      });
    });
    
    // Log completion
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    log(`Completed calculation of reports to add to Neo4j in ${duration.toFixed(2)} seconds`);
    log(`Total reports to add: ${totalReportsAdded}`);
    log(`Output written to: ${outputFile}`);
    
    process.exit(0);
  } catch (error) {
    log(`ERROR: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Execute the main function
main();

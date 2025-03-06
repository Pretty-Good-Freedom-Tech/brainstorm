#!/usr/bin/env node

/**
 * generateNip85.js
 * 
 * ARCHIVED: This file is being archived on March 5, 2025 as part of a codebase cleanup.
 * The active version of this functionality is now maintained at bin/generate.js which uses the lib/generate.js module.
 * 
 * This script extracts data from Neo4j for NostrUsers with hops < 100 and hops not null,
 * and generates a nip85.json file with one JSON object per line.
 * The data will be published as kind 30382 events following the Trusted Assertions protocol (NIP-85).
 * 
 * For testing purposes, this script only outputs the top 5 users by personalizedPageRank.
 */

const fs = require('fs');
const path = require('path');
const neo4j = require('neo4j-driver');
const { execSync } = require('child_process');

// Get environment variables from hasenpfeffr.conf using source command
function getEnvVar(varName) {
  try {
    const value = execSync(`bash -c 'source /etc/hasenpfeffr.conf && echo $${varName}'`).toString().trim();
    return value;
  } catch (error) {
    console.error(`Error getting environment variable ${varName}:`, error.message);
    return null;
  }
}

// Helper function to safely convert Neo4j values to JavaScript types
function safeConvert(value) {
  if (value === null || value === undefined) {
    return 0;
  }
  
  if (typeof value === 'object' && typeof value.toNumber === 'function') {
    return value.toNumber();
  }
  
  return value;
}

// Main function
async function generateNip85() {
  console.log('Starting Nip85 data generation...');
  
  // Get Neo4j connection details from environment
  const NEO4J_URI = getEnvVar('NEO4J_URI');
  const NEO4J_USER = getEnvVar('NEO4J_USER');
  const NEO4J_PASSWORD = getEnvVar('NEO4J_PASSWORD');
  
  console.log(`NEO4J_URI: ${NEO4J_URI}`);
  console.log(`NEO4J_USER: ${NEO4J_USER}`);
  console.log(`NEO4J_PASSWORD: ${NEO4J_PASSWORD ? '******' : 'not set'}`);
  
  if (!NEO4J_URI || !NEO4J_USER || !NEO4J_PASSWORD) {
    console.error('Missing required Neo4j configuration in /etc/hasenpfeffr.conf');
    process.exit(1);
  }
  
  // Output file path
  const outputDir = '/home/ubuntu/hasenpfeffr/algos';
  const outputFile = path.join(outputDir, 'nip85.json');
  
  // Connect to Neo4j
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  );
  
  console.log('Connected to Neo4j database');
  
  const session = driver.session();
  
  try {
    // Cypher query to get the top 5 NostrUsers by personalizedPageRank
    const query = `
      MATCH (u:NostrUser)
      WHERE u.personalizedPageRank IS NOT NULL
      RETURN u.pubkey AS pubkey, u.hops AS hops, u.personalizedPageRank AS personalizedPageRank
      ORDER BY u.personalizedPageRank DESC
      LIMIT 5
    `;
    
    console.log('Executing Neo4j query to get top 5 users by personalizedPageRank...');
    const result = await session.run(query);
    
    // Create output file stream
    const outputStream = fs.createWriteStream(outputFile);
    
    console.log(`Processing ${result.records.length} NostrUser records...`);
    
    // Process each record and write to file
    let count = 0;
    for (const record of result.records) {
      const pubkey = record.get('pubkey');
      const hops = safeConvert(record.get('hops'));
      const personalizedPageRank = safeConvert(record.get('personalizedPageRank'));
      
      // Create formatted object for NIP-85 kind 30382 event
      const userObject = {
        pubkey,
        tags: [
          ['d', pubkey], // Use pubkey as the d tag value for uniqueness
          ['rank', '100'], // Set rank to 100 for all users as requested
          ['personalized_pageRank', personalizedPageRank.toString()],
          ['dos', hops ? hops.toString() : '0'] // Default to 0 if hops is null
        ]
      };
      
      // Write JSON object as a line to the file
      outputStream.write(JSON.stringify(userObject) + '\n');
      count++;
      
      console.log(`Processed user ${count}: pubkey=${pubkey}, personalizedPageRank=${personalizedPageRank}`);
    }
    
    // Close the output stream
    outputStream.end();
    
    console.log(`Successfully generated nip85.json with ${count} records`);
    
  } catch (error) {
    console.error('Error generating nip85.json:', error);
    process.exit(1);
  } finally {
    // Close the session and driver
    await session.close();
    await driver.close();
  }
}

// Run the main function
generateNip85().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

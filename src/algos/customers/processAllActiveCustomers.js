#!/usr/bin/env node
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

/**
 * Process all active customers by reading customers.json and running processCustomer.sh for each active customer
 */

// Load configuration from environment
function getConfigFromFile(key, defaultValue = '') {
  try {
    // Read the first few lines of /etc/brainstorm.conf to find the variable
    const configContent = fs.readFileSync('/etc/brainstorm.conf', 'utf8');
    const lines = configContent.split('\n');
    
    for (const line of lines) {
      if (line.startsWith(`${key}=`)) {
        return line.substring(key.length + 1).replace(/^"(.*)"$/, '$1');
      }
    }
    return defaultValue;
  } catch (err) {
    console.error(`Warning: Could not read config value for ${key}, using default: ${defaultValue}`);
    return defaultValue;
  }
}

// Configuration
const BRAINSTORM_MODULE_ALGOS_DIR = getConfigFromFile('BRAINSTORM_MODULE_ALGOS_DIR', '/opt/brainstorm/src/algos');
const SCRIPTS_DIR = path.join(BRAINSTORM_MODULE_ALGOS_DIR, 'customers');
const CUSTOMERS_DIR = '/var/lib/brainstorm/customers';
const CUSTOMERS_JSON = path.join(CUSTOMERS_DIR, 'customers.json');

/**
 * Log a message to console and optionally to a log file
 * @param {string} message - Message to log
 */
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} - ${message}`);
}

/**
 * Main function to process all active customers
 */
async function main() {
  try {
    log('Starting processAllActiveCustomers.js');
    
    // Check if customers.json exists
    if (!fs.existsSync(CUSTOMERS_JSON)) {
      log(`Error: Customers file not found at ${CUSTOMERS_JSON}`);
      process.exit(1);
    }
    
    // Read and parse the customers JSON file
    const customersData = JSON.parse(fs.readFileSync(CUSTOMERS_JSON, 'utf8'));
    
    if (!customersData.customers || typeof customersData.customers !== 'object') {
      log('Error: Invalid customers.json format - expected "customers" object');
      process.exit(1);
    }
    
    // Convert object to array and filter active customers
    const allCustomers = Object.values(customersData.customers);
    const activeCustomers = allCustomers.filter(customer => customer.status === 'active');
    
    log(`Found ${activeCustomers.length} active customers out of ${allCustomers.length} total`);
    
    // Process each active customer
    for (const customer of activeCustomers) {
      // Use directory as the customerId since that's how the filesystem will be organized
      const customerId = customer.directory || customer.name;
      const customerPubkey = customer.pubkey;
      
      log(`Processing customer: ${customer.name} (${customerId}) with pubkey ${customerPubkey}`);
      
      try {
        // Construct the command
        const command = `sudo bash ${SCRIPTS_DIR}/processCustomer.sh ${customerPubkey} ${customerId}`;
        log(`Executing: ${command}`);
        
        // Execute the command
        execSync(command, { stdio: 'inherit' });
        
        log(`Successfully completed processing for customer: ${customer.name}`);
      } catch (err) {
        log(`Error processing customer ${customer.name}: ${err.message}`);
        // Continue with other customers even if one fails
      }
    }
    
    log('Successfully processed all active customers');
  } catch (error) {
    log(`Failed to process customers: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function
main().catch(err => {
  log(`Unhandled error: ${err.message}`);
  process.exit(1);
});

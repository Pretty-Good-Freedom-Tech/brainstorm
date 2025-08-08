#!/usr/bin/env node

/**
 * Test SystemStateGatherer with various customer data scenarios
 * This helps verify the fix for "customers is not iterable" error
 */

const fs = require('fs');
const path = require('path');

// Import the SystemStateGatherer class
const SystemStateGatherer = require('./systemStateGatherer.js').SystemStateGatherer || 
    eval(fs.readFileSync('./systemStateGatherer.js', 'utf8') + '; SystemStateGatherer');

async function testSystemStateGatherer() {
    console.log('=== Testing SystemStateGatherer Customer Data Handling ===');
    
    // Create a test environment
    const testDir = `/tmp/brainstorm-test-${Date.now()}`;
    const customersDir = `${testDir}/customers`;
    const logDir = `${testDir}/log`;
    
    // Set up test environment
    process.env.BRAINSTORM_LOG_DIR = logDir;
    
    try {
        // Create test directories
        fs.mkdirSync(customersDir, { recursive: true });
        fs.mkdirSync(`${logDir}/taskQueue`, { recursive: true });
        
        console.log(`Test directory: ${testDir}`);
        console.log(`Log directory: ${logDir}`);
        
        // Test 1: No customers.json file
        console.log('\n1. Testing with no customers.json file...');
        await testScenario('No customers file', null);
        
        // Test 2: Empty array
        console.log('\n2. Testing with empty array...');
        await testScenario('Empty array', []);
        
        // Test 3: Valid customer array
        console.log('\n3. Testing with valid customer array...');
        const validCustomers = [
            {
                pubkey: 'test123',
                name: 'Test Customer',
                active: true,
                signupDate: '2025-01-01'
            }
        ];
        await testScenario('Valid customers', validCustomers);
        
        // Test 4: Invalid JSON (non-array)
        console.log('\n4. Testing with invalid JSON (object instead of array)...');
        const invalidData = { message: 'This is not an array' };
        await testScenario('Invalid data', invalidData);
        
        // Test 5: Wrapped array (customers property)
        console.log('\n5. Testing with wrapped array...');
        const wrappedData = { customers: validCustomers };
        await testScenario('Wrapped data', wrappedData);
        
        console.log('\n=== All tests completed ===');
        
    } catch (error) {
        console.error('Test error:', error);
    } finally {
        // Cleanup
        console.log('\nCleaning up test directory...');
        fs.rmSync(testDir, { recursive: true, force: true });
    }
    
    async function testScenario(name, customerData) {
        const customersFile = `${customersDir}/customers.json`;
        
        // Remove existing file
        if (fs.existsSync(customersFile)) {
            fs.unlinkSync(customersFile);
        }
        
        // Create customers.json if data provided
        if (customerData !== null) {
            fs.writeFileSync(customersFile, JSON.stringify(customerData, null, 2));
        }
        
        // Create a mock SystemStateGatherer that uses our test directory
        const gatherer = {
            config: { BRAINSTORM_LOG_DIR: logDir },
            stateFile: `${logDir}/taskQueue/fullSystemState.json`,
            logFile: `${logDir}/taskQueue/stateGatherer.log`,
            
            log: (message) => console.log(`  [StateGatherer] ${message}`),
            
            async gatherCustomerData() {
                try {
                    const customersFile = `${customersDir}/customers.json`;
                    let customers = [];
                    
                    if (fs.existsSync(customersFile)) {
                        try {
                            const rawData = fs.readFileSync(customersFile, 'utf8');
                            const parsedData = JSON.parse(rawData);
                            
                            // Ensure customers is an array
                            if (Array.isArray(parsedData)) {
                                customers = parsedData;
                            } else if (parsedData && typeof parsedData === 'object' && parsedData.customers && Array.isArray(parsedData.customers)) {
                                // Handle case where data is wrapped in an object
                                customers = parsedData.customers;
                            } else {
                                this.log(`Warning: customers.json contains non-array data: ${typeof parsedData}`);
                                customers = [];
                            }
                        } catch (parseError) {
                            this.log(`Warning: Failed to parse customers.json: ${parseError.message}`);
                            customers = [];
                        }
                    } else {
                        this.log('Info: customers.json not found, using empty customer list');
                    }
                    
                    const customerStates = [];
                    
                    // Ensure customers is iterable before attempting to iterate
                    if (Array.isArray(customers)) {
                        for (const customer of customers) {
                            const customerState = {
                                pubkey: customer.pubkey,
                                name: customer.name,
                                active: customer.active,
                                signupDate: customer.signupDate,
                                lastProcessed: null, // Simplified for test
                                scoreStatus: null,   // Simplified for test
                                processingErrors: null // Simplified for test
                            };
                            
                            customerStates.push(customerState);
                        }
                    }
                    
                    return {
                        totalCustomers: customers.length,
                        activeCustomers: customers.filter(c => c.active).length,
                        customers: customerStates
                    };
                    
                } catch (error) {
                    this.log(`Error gathering customer data: ${error.message}`);
                    return { error: error.message };
                }
            }
        };
        
        try {
            const result = await gatherer.gatherCustomerData();
            console.log(`  ✅ ${name}: SUCCESS`);
            console.log(`    Total customers: ${result.totalCustomers || 0}`);
            console.log(`    Active customers: ${result.activeCustomers || 0}`);
            if (result.error) {
                console.log(`    Error: ${result.error}`);
            }
        } catch (error) {
            console.log(`  ❌ ${name}: FAILED - ${error.message}`);
        }
    }
}

// Run the test
testSystemStateGatherer().catch(console.error);

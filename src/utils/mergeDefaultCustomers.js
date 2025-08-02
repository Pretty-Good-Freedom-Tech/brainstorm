#!/usr/bin/env node

/**
 * Merge Default Customers Utility
 * 
 * This script is used during installation/update processes to merge
 * default customers without overwriting existing customer data.
 * 
 * Usage: node mergeDefaultCustomers.js [--source-path=path] [--dry-run]
 */

const CustomerManager = require('./customerManager');
const path = require('path');

async function main() {
    const args = process.argv.slice(2);
    
    // Parse command line arguments
    let sourcePath = null;
    let dryRun = false;
    
    for (const arg of args) {
        if (arg.startsWith('--source-path=')) {
            sourcePath = arg.split('=')[1];
        } else if (arg === '--dry-run') {
            dryRun = true;
        }
    }

    // Default source path - look for customers.json in the package
    if (!sourcePath) {
        // Try multiple possible locations
        const possiblePaths = [
            '/usr/local/lib/node_modules/brainstorm/customers/customers.json',
            path.join(__dirname, '../../customers/customers.json'),
            path.join(process.cwd(), 'customers/customers.json')
        ];
        
        for (const testPath of possiblePaths) {
            try {
                const fs = require('fs');
                if (fs.existsSync(testPath)) {
                    sourcePath = testPath;
                    break;
                }
            } catch (error) {
                // Continue to next path
            }
        }
    }

    if (!sourcePath) {
        console.error('❌ Error: Could not find default customers.json file');
        console.error('   Tried locations:');
        console.error('   - /usr/local/lib/node_modules/brainstorm/customers/customers.json');
        console.error('   - ./customers/customers.json');
        console.error('   Use --source-path=<path> to specify location');
        process.exit(1);
    }

    console.log(`🔄 Merging default customers from: ${sourcePath}`);
    if (dryRun) {
        console.log('🔍 DRY RUN MODE - No changes will be made');
    }

    try {
        // Initialize CustomerManager
        const customerManager = new CustomerManager({
            customersDir: process.env.CUSTOMERS_DIR || '/var/lib/brainstorm/customers'
        });
        
        await customerManager.initialize();

        if (dryRun) {
            // Show what would be merged
            const fs = require('fs');
            const defaultCustomers = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
            const currentCustomers = await customerManager.getAllCustomers();
            
            console.log('\n📋 Analysis:');
            console.log(`Default customers file contains: ${Object.keys(defaultCustomers.customers).length} customers`);
            console.log(`Current customers file contains: ${Object.keys(currentCustomers.customers).length} customers`);
            
            const wouldAdd = [];
            const wouldSkip = [];
            
            for (const [name, customer] of Object.entries(defaultCustomers.customers)) {
                if (!currentCustomers.customers[name]) {
                    const existingCustomer = Object.values(currentCustomers.customers)
                        .find(c => c.pubkey === customer.pubkey);
                    
                    if (!existingCustomer) {
                        wouldAdd.push(name);
                    } else {
                        wouldSkip.push(`${name} (pubkey exists as ${existingCustomer.name})`);
                    }
                } else {
                    wouldSkip.push(`${name} (name already exists)`);
                }
            }
            
            console.log(`\n📊 Would add: ${wouldAdd.length} customers`);
            if (wouldAdd.length > 0) {
                wouldAdd.forEach(name => console.log(`  ✅ ${name}`));
            }
            
            console.log(`\n⏭️ Would skip: ${wouldSkip.length} customers`);
            if (wouldSkip.length > 0) {
                wouldSkip.forEach(item => console.log(`  ⏭️ ${item}`));
            }
            
            console.log('\n🔍 Run without --dry-run to perform the merge');
            
        } else {
            // Perform the actual merge
            const result = await customerManager.mergeDefaultCustomers(sourcePath);

            if (result.success) {
                console.log('\n✅ Merge completed successfully!');
                console.log(`   Added: ${result.added.length} customers`);
                console.log(`   Skipped: ${result.skipped.length} customers`);
                
                if (result.added.length > 0) {
                    console.log('\n📝 Added customers:');
                    result.added.forEach(name => console.log(`   ✅ ${name}`));
                }
                
                if (result.skipped.length > 0) {
                    console.log('\n⏭️ Skipped customers:');
                    result.skipped.forEach(item => console.log(`   ⏭️ ${item}`));
                }
                
                // Validate the result
                console.log('\n🔍 Validating merged data...');
                const validation = await customerManager.validateCustomerData();
                
                if (validation.valid) {
                    console.log('✅ Customer data validation passed');
                } else {
                    console.log('⚠️ Customer data validation found issues:');
                    validation.issues.forEach(issue => console.log(`   ❌ ${issue}`));
                }
                
            } else {
                console.error(`❌ Merge failed: ${result.reason}`);
                process.exit(1);
            }
        }

    } catch (error) {
        console.error('❌ Error during merge operation:', error.message);
        if (process.env.DEBUG) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

// Show help if requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
Merge Default Customers Utility

This script merges default customers from a source file into the current
customer database without overwriting existing customers.

Usage: node mergeDefaultCustomers.js [options]

Options:
  --source-path=<path>    Path to default customers.json file
  --dry-run              Show what would be merged without making changes
  --help, -h             Show this help message

Environment Variables:
  CUSTOMERS_DIR          Customer data directory (default: /var/lib/brainstorm/customers)
  DEBUG                  Show detailed error information

Examples:
  node mergeDefaultCustomers.js
  node mergeDefaultCustomers.js --dry-run
  node mergeDefaultCustomers.js --source-path=/path/to/customers.json
`);
    process.exit(0);
}

// Run the script
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error.message);
        if (process.env.DEBUG) {
            console.error(error.stack);
        }
        process.exit(1);
    });
}

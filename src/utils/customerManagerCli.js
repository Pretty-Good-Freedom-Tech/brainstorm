#!/usr/bin/env node

/**
 * CustomerManager CLI Utility
 * 
 * Command-line interface for testing and managing customer data
 * Usage: node customerManagerCli.js <command> [options]
 */

const CustomerManager = require('./customerManager');
const path = require('path');

// Initialize CustomerManager
const customerManager = new CustomerManager({
    customersDir: process.env.CUSTOMERS_DIR || '/var/lib/brainstorm/customers'
});

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    try {
        await customerManager.initialize();

        switch (command) {
            case 'list':
                await listCustomers();
                break;
            case 'get':
                await getCustomer(args[1]);
                break;
            case 'create':
                await createCustomer(args[1], args[2]);
                break;
            case 'update':
                await updateCustomer(args[1], args[2], args[3]);
                break;
            case 'delete':
                await deleteCustomer(args[1]);
                break;
            case 'backup':
                await backupCustomers(args[1]);
                break;
            case 'restore':
                await restoreCustomers(args[1], args[2] === '--overwrite');
                break;
            case 'merge-defaults':
                await mergeDefaults(args[1]);
                break;
            case 'validate':
                await validateData();
                break;
            case 'cache-stats':
                await cacheStats();
                break;
            case 'nip85-status':
                await testNip85Status(args[1], args[2] === '--include-events');
                break;
            default:
                showHelp();
        }
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

async function listCustomers() {
    console.log('📋 All Customers:');
    const customers = await customerManager.getAllCustomers();
    
    if (Object.keys(customers.customers).length === 0) {
        console.log('  No customers found');
        return;
    }

    for (const [name, customer] of Object.entries(customers.customers)) {
        console.log(`  • ${name} (ID: ${customer.id}, Status: ${customer.status})`);
        console.log(`    Pubkey: ${customer.pubkey}`);
        console.log(`    Directory: ${customer.directory}`);
        console.log('');
    }
}

async function getCustomer(pubkey) {
    if (!pubkey) {
        console.error('Usage: node customerManagerCli.js get <pubkey>');
        return;
    }

    console.log(`🔍 Getting customer with pubkey: ${pubkey}`);
    const customer = await customerManager.getCustomer(pubkey);
    
    if (!customer) {
        console.log('Customer not found');
        return;
    }

    console.log('Customer details:');
    console.log(JSON.stringify(customer, null, 2));
}

async function createCustomer(name, pubkey) {
    if (!name || !pubkey) {
        console.error('Usage: node customerManagerCli.js create <name> <pubkey>');
        return;
    }

    console.log(`➕ Creating customer: ${name}`);
    const customer = await customerManager.createCustomer({
        name,
        pubkey,
        status: 'active',
        comments: 'Created via CLI'
    });

    console.log('Customer created:');
    console.log(JSON.stringify(customer, null, 2));
}

async function updateCustomer(pubkey, field, value) {
    if (!pubkey || !field || !value) {
        console.error('Usage: node customerManagerCli.js update <pubkey> <field> <value>');
        return;
    }

    console.log(`✏️ Updating customer ${pubkey}: ${field} = ${value}`);
    const updateData = { [field]: value };
    const customer = await customerManager.updateCustomer(pubkey, updateData);

    console.log('Customer updated:');
    console.log(JSON.stringify(customer, null, 2));
}

async function deleteCustomer(pubkey) {
    if (!pubkey) {
        console.error('Usage: node customerManagerCli.js delete <pubkey>');
        return;
    }

    console.log(`🗑️ Deleting customer with pubkey: ${pubkey}`);
    const customer = await customerManager.deleteCustomer(pubkey);

    console.log('Customer deleted:');
    console.log(JSON.stringify(customer, null, 2));
}

async function backupCustomers(backupPath) {
    if (!backupPath) {
        backupPath = `/tmp/customer-backup-${Date.now()}`;
    }

    console.log(`💾 Backing up customers to: ${backupPath}`);
    const result = await customerManager.backupCustomerData(backupPath, {
        includeSecureKeys: true
    });

    console.log('Backup completed:');
    console.log(`  Path: ${result.backupPath}`);
    console.log(`  Files: ${result.manifest.files.length}`);
    console.log(`  Timestamp: ${result.manifest.timestamp}`);
}

async function restoreCustomers(backupPath, overwrite = false) {
    if (!backupPath) {
        console.error('Usage: node customerManagerCli.js restore <backup-path> [--overwrite]');
        return;
    }

    console.log(`📥 Restoring customers from: ${backupPath}`);
    console.log(`Overwrite mode: ${overwrite ? 'ON' : 'OFF'}`);
    
    const result = await customerManager.restoreCustomerData(backupPath, {
        merge: true,
        overwrite
    });

    console.log('Restore completed:');
    console.log(`  Restored: ${result.restored.length} items`);
    console.log(`  Skipped: ${result.skipped.length} items`);
    if (result.preRestoreBackup) {
        console.log(`  Pre-restore backup: ${result.preRestoreBackup}`);
    }
}

async function mergeDefaults(defaultPath) {
    console.log('🔄 Merging default customers...');
    const result = await customerManager.mergeDefaultCustomers(defaultPath);

    if (result.success) {
        console.log('Merge completed:');
        console.log(`  Added: ${result.added.length} customers`);
        console.log(`  Skipped: ${result.skipped.length} customers`);
        
        if (result.added.length > 0) {
            console.log('  Added customers:', result.added.join(', '));
        }
        if (result.skipped.length > 0) {
            console.log('  Skipped customers:', result.skipped.join(', '));
        }
    } else {
        console.log('Merge failed:', result.reason);
    }
}

async function validateData() {
    console.log('🔍 Validating customer data...');
    const result = await customerManager.validateCustomerData();

    if (result.valid) {
        console.log('✅ Customer data is valid');
    } else {
        console.log('❌ Customer data has issues:');
        result.issues.forEach(issue => console.log(`  • ${issue}`));
    }
}

async function testNip85Status(pubkey, includeEvents = false) {
    if (!pubkey) {
        console.log('❌ Error: Please provide a customer pubkey');
        console.log('Usage: node customerManagerCli.js nip85-status <pubkey> [--include-events]');
        return;
    }
    
    console.log('🔍 Testing NIP-85 Status Utility Methods');
    console.log('=' .repeat(60));
    console.log(`Customer Pubkey: ${pubkey}`);
    console.log(`Include Events: ${includeEvents}`);
    console.log('');
    
    try {
        // Test the main getNip85Status method
        console.log('🎯 Testing Main getNip85Status Method:');
        console.log('-'.repeat(40));
        
        const startTime = Date.now();
        const status = await customerManager.getNip85Status(pubkey, { 
            includeEvents, 
            includeRelayKeys: true 
        });
        const duration = Date.now() - startTime;
        
        console.log(`⏱️  Execution time: ${duration}ms`);
        console.log('');
        
        if (status.success) {
            console.log('✅ getNip85Status() - SUCCESS');
            console.log('');
            
            // Display Customer Info
            console.log('👤 Customer Information:');
            console.log(`   Has Relay Keys: ${status.customer.hasRelayKeys ? '✅' : '❌'}`);
            console.log(`   Relay Pubkey: ${status.customer.relayPubkey || 'None'}`);
            console.log('');
            
            // Display Kind 10040 Status
            console.log('📝 Kind 10040 Status:');
            console.log(`   Exists: ${status.kind10040.exists ? '✅' : '❌'}`);
            console.log(`   Relay Pubkey: ${status.kind10040.relayPubkey || 'None'}`);
            console.log(`   Matches Customer: ${status.kind10040.matches ? '✅' : '❌'}`);
            console.log(`   Match Reason: ${status.kind10040.matchDetails.reason}`);
            console.log(`   Match Message: ${status.kind10040.matchDetails.message}`);
            if (status.kind10040.timestamp) {
                const date = new Date(status.kind10040.timestamp * 1000);
                console.log(`   Timestamp: ${date.toISOString()} (${status.kind10040.timestamp})`);
            }
            if (status.kind10040.eventId) {
                console.log(`   Event ID: ${status.kind10040.eventId}`);
            }
            console.log('');
            
            // Display Kind 30382 Status
            console.log('📊 Kind 30382 Status:');
            console.log(`   Count: ${status.kind30382.count.toLocaleString()}`);
            console.log(`   Author Pubkey: ${status.kind30382.authorPubkey || 'None'}`);
            console.log(`   Author Matches: ${status.kind30382.authorMatches ? '✅' : '❌'}`);
            console.log(`   Author Match Reason: ${status.kind30382.authorMatchDetails.reason}`);
            console.log(`   Author Match Message: ${status.kind30382.authorMatchDetails.message}`);
            if (status.kind30382.latestTimestamp) {
                const date = new Date(status.kind30382.latestTimestamp * 1000);
                console.log(`   Latest Timestamp: ${date.toISOString()} (${status.kind30382.latestTimestamp})`);
            }
            console.log('');
            
            // Display Overall Status
            console.log('🎯 Overall NIP-85 Status:');
            console.log(`   Is Complete: ${status.overall.isComplete ? '✅' : '❌'}`);
            console.log(`   Needs Kind 10040 Update: ${status.overall.needsKind10040Update ? '⚠️  YES' : '✅ NO'}`);
            console.log(`   Needs Kind 10040 Creation: ${status.overall.needsKind10040Creation ? '⚠️  YES' : '✅ NO'}`);
            console.log(`   Has Active Kind 30382: ${status.overall.hasActiveKind30382 ? '✅' : '❌'}`);
            console.log(`   Kind 30382 Publishing Correctly: ${status.overall.kind30382PublishingCorrectly ? '✅' : '❌'}`);
            console.log(`   Summary: ${status.overall.summary}`);
            console.log('');
            
            // Display Events if included
            if (includeEvents) {
                console.log('📄 Event Data:');
                if (status.kind10040.event) {
                    console.log('   Kind 10040 Event:');
                    console.log('   ' + JSON.stringify(status.kind10040.event, null, 4).replace(/\n/g, '\n   '));
                    console.log('');
                }
                if (status.kind30382.latestEvent) {
                    console.log('   Latest Kind 30382 Event:');
                    console.log('   ' + JSON.stringify(status.kind30382.latestEvent, null, 4).replace(/\n/g, '\n   '));
                    console.log('');
                }
            }
            
        } else {
            console.log('❌ getNip85Status() - FAILED');
            console.log(`Error: ${status.error}`);
            console.log('');
        }
        
        // Test individual helper methods
        console.log('🔧 Testing Individual Helper Methods:');
        console.log('-'.repeat(40));
        
        // Test getCustomerRelayKeysStatus
        console.log('🔑 Testing getCustomerRelayKeysStatus():');
        try {
            const relayKeysStatus = await customerManager.getCustomerRelayKeysStatus(pubkey);
            console.log(`   ✅ Success - Has Keys: ${relayKeysStatus.hasRelayKeys}`);
            if (relayKeysStatus.relayPubkey) {
                console.log(`   Relay Pubkey: ${relayKeysStatus.relayPubkey}`);
            }
        } catch (error) {
            console.log(`   ❌ Error: ${error.message}`);
        }
        console.log('');
        
        // Test checkKind10040Status
        console.log('📝 Testing checkKind10040Status():');
        try {
            const kind10040Status = await customerManager.checkKind10040Status(pubkey, false);
            console.log(`   ✅ Success - Exists: ${kind10040Status.exists}`);
            if (kind10040Status.relayPubkey) {
                console.log(`   Relay Pubkey: ${kind10040Status.relayPubkey}`);
            }
        } catch (error) {
            console.log(`   ❌ Error: ${error.message}`);
        }
        console.log('');
        
        // Test checkKind30382Status
        console.log('📊 Testing checkKind30382Status():');
        try {
            const kind30382Status = await customerManager.checkKind30382Status(pubkey, false);
            console.log(`   ✅ Success - Count: ${kind30382Status.count}`);
            if (kind30382Status.authorPubkey) {
                console.log(`   Author Pubkey: ${kind30382Status.authorPubkey}`);
            }
        } catch (error) {
            console.log(`   ❌ Error: ${error.message}`);
        }
        console.log('');
        
        // Test compareRelayPubkeys
        console.log('⚖️  Testing compareRelayPubkeys():');
        const testPubkey1 = 'acc2b89da701a54682afb1eac0b48173cfb1d130851e33fc15176334000844db';
        const testPubkey2 = 'acc2b89da701a54682afb1eac0b48173cfb1d130851e33fc15176334000844db';
        const testPubkey3 = 'different123456789abcdef';
        
        const match1 = customerManager.compareRelayPubkeys(testPubkey1, testPubkey2);
        const match2 = customerManager.compareRelayPubkeys(testPubkey1, testPubkey3);
        const match3 = customerManager.compareRelayPubkeys(null, testPubkey1);
        const match4 = customerManager.compareRelayPubkeys(testPubkey1, null);
        
        console.log(`   Same pubkeys: ${match1.matches ? '✅' : '❌'} (${match1.reason})`);
        console.log(`   Different pubkeys: ${match2.matches ? '✅' : '❌'} (${match2.reason})`);
        console.log(`   Null customer key: ${match3.matches ? '✅' : '❌'} (${match3.reason})`);
        console.log(`   Null event key: ${match4.matches ? '✅' : '❌'} (${match4.reason})`);
        console.log('');
        
        console.log('🎉 NIP-85 Status Testing Complete!');
        
    } catch (error) {
        console.log('❌ Fatal Error during NIP-85 testing:');
        console.log(`Error: ${error.message}`);
        console.log(`Stack: ${error.stack}`);
    }
}

async function cacheStats() {
    console.log('📊 Cache Statistics:');
    const stats = customerManager.getCacheStats();
    console.log(`  Size: ${stats.size} items`);
    console.log(`  Keys: ${stats.keys.join(', ')}`);
}

function showHelp() {
    console.log(`
CustomerManager CLI Utility

Usage: node customerManagerCli.js <command> [options]

Commands:
  list                           List all customers
  get <pubkey>                   Get customer by pubkey
  create <name> <pubkey>         Create new customer
  update <pubkey> <field> <value> Update customer field
  delete <pubkey>                Delete customer
  backup [path]                  Backup customer data
  restore <path> [--overwrite]   Restore customer data
  merge-defaults [path]          Merge default customers
  validate                       Validate customer data integrity
  cache-stats                    Show cache statistics
  nip85-status <pubkey> [--include-events] Test NIP-85 status utility methods

Environment Variables:
  CUSTOMERS_DIR                  Customer data directory (default: /var/lib/brainstorm/customers)

Examples:
  node customerManagerCli.js list
  node customerManagerCli.js get e5272de914bd301755c439b88e6959a43c9d2664831f093c51e9c799a16a102f
  node customerManagerCli.js create testuser 1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
  node customerManagerCli.js backup /tmp/my-backup
  node customerManagerCli.js restore /tmp/my-backup
  node customerManagerCli.js validate
  node customerManagerCli.js nip85-status e5272de914bd301755c439b88e6959a43c9d2664831f093c51e9c799a16a102f
  node customerManagerCli.js nip85-status e5272de914bd301755c439b88e6959a43c9d2664831f093c51e9c799a16a102f --include-events
`);
}

// Run the CLI
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { customerManager };

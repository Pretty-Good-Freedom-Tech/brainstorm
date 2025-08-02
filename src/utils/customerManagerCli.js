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

Environment Variables:
  CUSTOMERS_DIR                  Customer data directory (default: /var/lib/brainstorm/customers)

Examples:
  node customerManagerCli.js list
  node customerManagerCli.js get e5272de914bd301755c439b88e6959a43c9d2664831f093c51e9c799a16a102f
  node customerManagerCli.js create testuser 1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
  node customerManagerCli.js backup /tmp/my-backup
  node customerManagerCli.js restore /tmp/my-backup
  node customerManagerCli.js validate
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

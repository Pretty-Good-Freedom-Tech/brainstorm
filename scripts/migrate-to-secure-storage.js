#!/usr/bin/env node

/**
 * Migration script to move existing relay keys from brainstorm.conf to secure storage
 * This script helps transition from the old plaintext storage to encrypted storage
 */

const fs = require('fs');
const path = require('path');
const { SecureKeyStorage } = require('../src/utils/secureKeyStorage');

async function migrateRelayKeys() {
    console.log('🔄 Migrating relay keys to secure storage...');
    console.log('============================================');
    
    try {
        // Initialize secure storage
        const secureStorage = new SecureKeyStorage();
        
        // Read brainstorm.conf
        const brainstormConfPath = '/etc/brainstorm.conf';
        if (!fs.existsSync(brainstormConfPath)) {
            console.log('❌ brainstorm.conf not found at:', brainstormConfPath);
            console.log('   Make sure Brainstorm is properly installed.');
            process.exit(1);
        }
        
        const brainstormConf = fs.readFileSync(brainstormConfPath, 'utf8');
        console.log('✅ Found brainstorm.conf');
        
        // Extract all customer relay keys using regex
        const customerKeyPattern = /CUSTOMER_([a-f0-9]+)_RELAY_(\w+)='([^']+)'/g;
        const customerKeys = {};
        
        let match;
        while ((match = customerKeyPattern.exec(brainstormConf)) !== null) {
            const [, pubkey, keyType, keyValue] = match;
            
            if (!customerKeys[pubkey]) {
                customerKeys[pubkey] = {};
            }
            
            customerKeys[pubkey][keyType.toLowerCase()] = keyValue;
        }
        
        const customerCount = Object.keys(customerKeys).length;
        console.log(`📊 Found ${customerCount} customers with relay keys`);
        
        if (customerCount === 0) {
            console.log('ℹ️  No customer relay keys found to migrate.');
            return;
        }
        
        // Migrate each customer's keys
        let migratedCount = 0;
        let skippedCount = 0;
        
        for (const [pubkey, keys] of Object.entries(customerKeys)) {
            console.log(`\n🔑 Processing customer: ${pubkey.substring(0, 16)}...`);
            
            // Check if we have all required keys
            if (!keys.pubkey || !keys.npub || !keys.privkey || !keys.nsec) {
                console.log(`   ⚠️  Incomplete key set, skipping`);
                skippedCount++;
                continue;
            }
            
            // Check if already migrated
            const existingKeys = await secureStorage.getRelayKeys(pubkey);
            if (existingKeys) {
                console.log(`   ℹ️  Already migrated, skipping`);
                skippedCount++;
                continue;
            }
            
            // Store in secure storage
            try {
                await secureStorage.storeRelayKeys(pubkey, {
                    pubkey: keys.pubkey,
                    npub: keys.npub,
                    privkey: keys.privkey,
                    nsec: keys.nsec
                });
                
                console.log(`   ✅ Migrated successfully`);
                migratedCount++;
            } catch (error) {
                console.log(`   ❌ Migration failed: ${error.message}`);
                skippedCount++;
            }
        }
        
        console.log('\n📈 Migration Summary:');
        console.log('====================');
        console.log(`✅ Successfully migrated: ${migratedCount} customers`);
        console.log(`⚠️  Skipped: ${skippedCount} customers`);
        
        if (migratedCount > 0) {
            console.log('\n🔒 Security Recommendations:');
            console.log('============================');
            console.log('1. Verify all keys migrated correctly by testing customer sign-in');
            console.log('2. Consider removing private keys from brainstorm.conf for security');
            console.log('3. Backup your secure storage master key safely');
            console.log('4. Test the new secure storage system thoroughly');
            
            console.log('\n⚠️  IMPORTANT: To remove private keys from brainstorm.conf:');
            console.log('   Run: node scripts/clean-brainstorm-conf.js');
            console.log('   This will remove PRIVKEY and NSEC entries while keeping public keys');
        }
        
        console.log('\n✅ Migration completed successfully!');
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error('\nTroubleshooting:');
        console.error('1. Make sure secure storage is properly configured');
        console.error('2. Check that RELAY_KEY_MASTER_KEY environment variable is set');
        console.error('3. Verify file permissions on storage directory');
        process.exit(1);
    }
}

// Run migration if called directly
if (require.main === module) {
    migrateRelayKeys().catch(console.error);
}

module.exports = { migrateRelayKeys };

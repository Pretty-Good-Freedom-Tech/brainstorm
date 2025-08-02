#!/usr/bin/env node

/**
 * Clean brainstorm.conf by removing private keys while keeping public keys
 * This script removes PRIVKEY and NSEC entries after migration to secure storage
 */

const fs = require('fs');
const path = require('path');

function cleanBrainstormConf() {
    console.log('🧹 Cleaning brainstorm.conf - removing private keys...');
    console.log('=====================================================');
    
    const brainstormConfPath = '/etc/brainstorm.conf';
    const backupPath = `/etc/brainstorm.conf.backup.${Date.now()}`;
    
    try {
        // Check if file exists
        if (!fs.existsSync(brainstormConfPath)) {
            console.log('❌ brainstorm.conf not found at:', brainstormConfPath);
            process.exit(1);
        }
        
        // Create backup
        console.log('📋 Creating backup...');
        fs.copyFileSync(brainstormConfPath, backupPath);
        console.log(`✅ Backup created: ${backupPath}`);
        
        // Read current content
        const content = fs.readFileSync(brainstormConfPath, 'utf8');
        
        // Remove private key lines
        const cleanedContent = content
            .split('\n')
            .filter(line => {
                // Remove lines containing PRIVKEY or NSEC
                return !line.includes('_RELAY_PRIVKEY=') && !line.includes('_RELAY_NSEC=');
            })
            .join('\n');
        
        // Count removed lines
        const originalLines = content.split('\n').length;
        const cleanedLines = cleanedContent.split('\n').length;
        const removedLines = originalLines - cleanedLines;
        
        // Write cleaned content
        fs.writeFileSync(brainstormConfPath, cleanedContent);
        
        console.log('\n📊 Cleaning Summary:');
        console.log('===================');
        console.log(`📄 Original lines: ${originalLines}`);
        console.log(`🗑️  Removed lines: ${removedLines}`);
        console.log(`📄 Final lines: ${cleanedLines}`);
        
        console.log('\n✅ brainstorm.conf cleaned successfully!');
        console.log('🔒 Private keys removed, public keys preserved');
        console.log(`💾 Backup available at: ${backupPath}`);
        
        if (removedLines === 0) {
            console.log('\nℹ️  No private keys found to remove.');
            console.log('   This might mean:');
            console.log('   • Keys were already cleaned');
            console.log('   • No customer relay keys exist');
            console.log('   • Keys are stored in different format');
        }
        
    } catch (error) {
        console.error('❌ Error cleaning brainstorm.conf:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    cleanBrainstormConf();
}

module.exports = { cleanBrainstormConf };

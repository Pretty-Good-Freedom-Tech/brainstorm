const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const lockfile = require('proper-lockfile');

/**
 * CustomerManager - Centralized customer data management for Brainstorm
 * 
 * Provides CRUD operations, backup/restore functionality, and data validation
 * for customer configurations while maintaining file-based storage approach.
 */
class CustomerManager {
    constructor(config = {}) {
        this.customersDir = config.customersDir || '/var/lib/brainstorm/customers';
        this.customersFile = path.join(this.customersDir, 'customers.json');
        this.lockTimeout = config.lockTimeout || 10000; // 10 seconds
        this.cache = new Map();
        this.cacheTimeout = config.cacheTimeout || 30000; // 30 seconds
    }

    /**
     * Initialize the customer manager and validate directory structure
     */
    async initialize() {
        try {
            // Ensure customers directory exists
            if (!fs.existsSync(this.customersDir)) {
                fs.mkdirSync(this.customersDir, { recursive: true });
                console.log(`Created customers directory: ${this.customersDir}`);
            }

            // Ensure customers.json exists
            if (!fs.existsSync(this.customersFile)) {
                const defaultCustomers = { customers: {} };
                await this.writeCustomersFile(defaultCustomers);
                console.log(`Created customers file: ${this.customersFile}`);
            }

            return true;
        } catch (error) {
            console.error('Failed to initialize CustomerManager:', error.message);
            throw error;
        }
    }

    /**
     * Get all customers from customers.json with caching
     */
    async getAllCustomers() {
        const cacheKey = 'all_customers';
        const cached = this.cache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
            return cached.data;
        }

        try {
            const data = fs.readFileSync(this.customersFile, 'utf8');
            const customers = JSON.parse(data);
            
            // Cache the result
            this.cache.set(cacheKey, {
                data: customers,
                timestamp: Date.now()
            });
            
            return customers;
        } catch (error) {
            if (error.code === 'ENOENT') {
                return { customers: {} };
            }
            throw new Error(`Failed to read customers file: ${error.message}`);
        }
    }

    /**
     * Get a specific customer by pubkey
     */
    async getCustomer(pubkey) {
        if (!pubkey) {
            throw new Error('Pubkey is required');
        }

        const allCustomers = await this.getAllCustomers();
        const customer = Object.values(allCustomers.customers).find(c => c.pubkey === pubkey);
        
        if (!customer) {
            return null;
        }

        // Load customer's directory data if it exists
        const customerDir = path.join(this.customersDir, customer.directory);
        if (fs.existsSync(customerDir)) {
            customer.directoryPath = customerDir;
            customer.preferences = await this.loadCustomerPreferences(customer.directory);
        }

        return customer;
    }

    /**
     * Get customer by name
     */
    async getCustomerByName(name) {
        if (!name) {
            throw new Error('Customer name is required');
        }

        const allCustomers = await this.getAllCustomers();
        const customer = allCustomers.customers[name];
        
        if (!customer) {
            return null;
        }

        return await this.getCustomer(customer.pubkey);
    }

    /**
     * Load customer preferences from their directory
     */
    async loadCustomerPreferences(customerDirectory) {
        const preferencesDir = path.join(this.customersDir, customerDirectory, 'preferences');
        const preferences = {};

        if (!fs.existsSync(preferencesDir)) {
            return preferences;
        }

        try {
            // Load graperank.conf
            const graperankPath = path.join(preferencesDir, 'graperank.conf');
            if (fs.existsSync(graperankPath)) {
                preferences.graperank = fs.readFileSync(graperankPath, 'utf8');
            }

            // Load observer.json
            const observerPath = path.join(preferencesDir, 'observer.json');
            if (fs.existsSync(observerPath)) {
                preferences.observer = JSON.parse(fs.readFileSync(observerPath, 'utf8'));
            }

            // Load whitelist.conf
            const whitelistPath = path.join(preferencesDir, 'whitelist.conf');
            if (fs.existsSync(whitelistPath)) {
                preferences.whitelist = fs.readFileSync(whitelistPath, 'utf8');
            }

            // Load blacklist.conf
            const blacklistPath = path.join(preferencesDir, 'blacklist.conf');
            if (fs.existsSync(blacklistPath)) {
                preferences.blacklist = fs.readFileSync(blacklistPath, 'utf8');
            }

        } catch (error) {
            console.warn(`Warning: Failed to load preferences for ${customerDirectory}: ${error.message}`);
        }

        return preferences;
    }

    /**
     * Create a new customer with atomic operations
     */
    async createCustomer(customerData) {
        if (!customerData.pubkey || !customerData.name) {
            throw new Error('Customer pubkey and name are required');
        }

        // Validate customer data
        this.validateSingleCustomer(customerData);

        const release = await lockfile.lock(this.customersFile, { 
            retries: 3, 
            minTimeout: 100,
            maxTimeout: this.lockTimeout 
        });

        try {
            const allCustomers = await this.getAllCustomers();
            
            // Check if customer already exists
            if (allCustomers.customers[customerData.name]) {
                throw new Error(`Customer with name '${customerData.name}' already exists`);
            }

            const existingCustomer = Object.values(allCustomers.customers).find(c => c.pubkey === customerData.pubkey);
            if (existingCustomer) {
                throw new Error(`Customer with pubkey '${customerData.pubkey}' already exists`);
            }

            // Assign next available ID
            const existingIds = Object.values(allCustomers.customers).map(c => c.id).filter(id => typeof id === 'number');
            const nextId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 0;

            // Prepare customer data
            const newCustomer = {
                id: nextId,
                status: customerData.status || 'active',
                directory: customerData.directory || customerData.name,
                name: customerData.name,
                pubkey: customerData.pubkey,
                observer_id: customerData.observer_id || customerData.pubkey,
                comments: customerData.comments || 'default'
            };

            // Add to customers object
            allCustomers.customers[customerData.name] = newCustomer;

            // Write updated customers file
            await this.writeCustomersFile(allCustomers);

            // Create customer directory structure
            await this.createCustomerDirectory(newCustomer);

            // Clear cache
            this.cache.clear();

            console.log(`Created customer: ${customerData.name} (ID: ${nextId})`);
            return newCustomer;

        } finally {
            await release();
        }
    }

    /**
     * Update an existing customer
     */
    async updateCustomer(pubkey, updateData) {
        if (!pubkey) {
            throw new Error('Pubkey is required');
        }

        const release = await lockfile.lock(this.customersFile, { 
            retries: 3, 
            minTimeout: 100,
            maxTimeout: this.lockTimeout 
        });

        try {
            const allCustomers = await this.getAllCustomers();
            let customerToUpdate = null;
            let customerName = null;

            // Find customer by pubkey
            for (const [name, customer] of Object.entries(allCustomers.customers)) {
                if (customer.pubkey === pubkey) {
                    customerToUpdate = customer;
                    customerName = name;
                    break;
                }
            }

            if (!customerToUpdate) {
                throw new Error(`Customer with pubkey '${pubkey}' not found`);
            }

            // Validate update data
            if (updateData.pubkey && updateData.pubkey !== pubkey) {
                throw new Error('Cannot change customer pubkey');
            }

            // Update customer data
            const updatedCustomer = { ...customerToUpdate, ...updateData };
            this.validateSingleCustomer(updatedCustomer);

            allCustomers.customers[customerName] = updatedCustomer;

            // Write updated customers file
            await this.writeCustomersFile(allCustomers);

            // Clear cache
            this.cache.clear();

            console.log(`Updated customer: ${customerName}`);
            return updatedCustomer;

        } finally {
            await release();
        }
    }

    /**
     * Delete a customer completely (IRREVERSIBLE)
     * 
     * This method performs a complete customer deletion including:
     * - Removal from customers.json
     * - Deletion of customer directory and all files
     * - Cleanup of secure relay keys
     * - Creation of deletion backup for audit trail
     * 
     * @param {string} pubkey - Customer's public key
     * @param {Object} options - Deletion options
     * @param {boolean} options.createBackup - Create backup before deletion (default: true)
     * @param {boolean} options.removeDirectory - Remove customer directory (default: true)
     * @param {boolean} options.removeSecureKeys - Remove secure relay keys (default: true)
     * @returns {Object} Deleted customer data and deletion summary
     */
    async deleteCustomer(pubkey, options = {}) {
        if (!pubkey) {
            throw new Error('Pubkey is required');
        }

        // Default options
        const opts = {
            createBackup: options.createBackup !== false, // default true
            removeDirectory: options.removeDirectory !== false, // default true
            removeSecureKeys: options.removeSecureKeys !== false, // default true
            ...options
        };

        const release = await lockfile.lock(this.customersFile, { 
            retries: 3, 
            minTimeout: 100,
            maxTimeout: this.lockTimeout 
        });

        let deletionSummary = {
            customerDeleted: false,
            directoryRemoved: false,
            secureKeysRemoved: false,
            backupCreated: false,
            errors: []
        };

        try {
            const allCustomers = await this.getAllCustomers();
            let customerToDelete = null;
            let customerName = null;

            // Find customer by pubkey
            for (const [name, customer] of Object.entries(allCustomers.customers)) {
                if (customer.pubkey === pubkey) {
                    customerToDelete = customer;
                    customerName = name;
                    break;
                }
            }

            if (!customerToDelete) {
                throw new Error(`Customer with pubkey '${pubkey}' not found`);
            }

            console.log(`Starting deletion of customer: ${customerName} (${pubkey})`);

            // Step 1: Create backup if requested
            if (opts.createBackup) {
                try {
                    await this.createDeletionBackup(customerToDelete);
                    deletionSummary.backupCreated = true;
                    console.log(`Created deletion backup for customer: ${customerName}`);
                } catch (error) {
                    const errorMsg = `Failed to create deletion backup: ${error.message}`;
                    deletionSummary.errors.push(errorMsg);
                    console.error(errorMsg);
                    // Continue with deletion even if backup fails
                }
            }

            // Step 2: Remove secure relay keys if requested
            if (opts.removeSecureKeys) {
                try {
                    await this.removeCustomerSecureKeys(customerToDelete);
                    deletionSummary.secureKeysRemoved = true;
                    console.log(`Removed secure keys for customer: ${customerName}`);
                } catch (error) {
                    const errorMsg = `Failed to remove secure keys: ${error.message}`;
                    deletionSummary.errors.push(errorMsg);
                    console.error(errorMsg);
                    // Continue with deletion even if secure key removal fails
                }
            }

            // Step 3: Remove customer directory if requested
            if (opts.removeDirectory) {
                try {
                    await this.removeCustomerDirectory(customerToDelete);
                    deletionSummary.directoryRemoved = true;
                    console.log(`Removed directory for customer: ${customerName}`);
                } catch (error) {
                    const errorMsg = `Failed to remove customer directory: ${error.message}`;
                    deletionSummary.errors.push(errorMsg);
                    console.error(errorMsg);
                    // Continue with deletion even if directory removal fails
                }
            }

            // Step 4: Remove from customers.json (this is the critical step)
            delete allCustomers.customers[customerName];
            await this.writeCustomersFile(allCustomers);
            deletionSummary.customerDeleted = true;

            // Clear cache
            this.cache.clear();

            console.log(`Successfully deleted customer: ${customerName}`);
            
            return {
                deletedCustomer: customerToDelete,
                deletionSummary: deletionSummary
            };

        } finally {
            await release();
        }
    }

    /**
     * Create a backup before customer deletion for audit trail
     */
    async createDeletionBackup(customer) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.join(this.customersDir, '.deleted-backups');
        const backupFile = path.join(backupDir, `deleted-${customer.name}-${timestamp}.json`);

        // Ensure backup directory exists
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const backupData = {
            deletedAt: new Date().toISOString(),
            customer: customer,
            backupReason: 'customer-deletion'
        };

        fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
        console.log(`Created deletion backup: ${backupFile}`);
    }

    /**
     * Remove customer directory and all contents
     */
    async removeCustomerDirectory(customer) {
        const customerDir = path.join(this.customersDir, customer.directory);
        
        if (fs.existsSync(customerDir)) {
            // Use recursive removal
            fs.rmSync(customerDir, { recursive: true, force: true });
            console.log(`Removed customer directory: ${customerDir}`);
        } else {
            console.log(`Customer directory not found (already removed?): ${customerDir}`);
        }
    }

    /**
     * Remove customer's secure relay keys
     */
    async removeCustomerSecureKeys(customer) {
        try {
            // Import secure key storage if available
            const SecureKeyStorage = require('./secureKeyStorage');
            const secureStorage = new SecureKeyStorage();
            
            // Try to remove the customer's relay keys
            const keyId = `customer-${customer.id}-relay`;
            await secureStorage.deleteKey(keyId);
            console.log(`Removed secure keys for customer: ${customer.name}`);
        } catch (error) {
            // If secure storage is not available or key doesn't exist, that's okay
            if (error.code === 'MODULE_NOT_FOUND' || error.message.includes('not found')) {
                console.log(`No secure keys found for customer: ${customer.name}`);
            } else {
                throw error;
            }
        }
    }

    /**
     * List active customers
     */
    async listActiveCustomers() {
        const allCustomers = await this.getAllCustomers();
        return Object.values(allCustomers.customers).filter(customer => customer.status === 'active');
    }

    /**
     * Search customers by criteria
     */
    async searchCustomers(criteria = {}) {
        const allCustomers = await this.getAllCustomers();
        let results = Object.values(allCustomers.customers);

        if (criteria.status) {
            results = results.filter(customer => customer.status === criteria.status);
        }

        if (criteria.name) {
            const namePattern = new RegExp(criteria.name, 'i');
            results = results.filter(customer => namePattern.test(customer.name));
        }

        if (criteria.pubkey) {
            results = results.filter(customer => customer.pubkey.includes(criteria.pubkey));
        }

        return results;
    }

    /**
     * Create customer directory structure
     */
    async createCustomerDirectory(customer) {
        const customerDir = path.join(this.customersDir, customer.directory);
        const preferencesDir = path.join(customerDir, 'preferences');
        const resultsDir = path.join(customerDir, 'results');

        // Create directories
        fs.mkdirSync(customerDir, { recursive: true });
        fs.mkdirSync(preferencesDir, { recursive: true });
        fs.mkdirSync(resultsDir, { recursive: true });

        // Copy default preferences from template if available
        const defaultDir = path.join(this.customersDir, 'default');
        if (fs.existsSync(defaultDir)) {
            const defaultPreferencesDir = path.join(defaultDir, 'preferences');
            if (fs.existsSync(defaultPreferencesDir)) {
                // Copy default preference files
                const files = fs.readdirSync(defaultPreferencesDir);
                for (const file of files) {
                    const sourcePath = path.join(defaultPreferencesDir, file);
                    const destPath = path.join(preferencesDir, file);
                    fs.copyFileSync(sourcePath, destPath);
                }
            }
        }

        console.log(`Created customer directory: ${customerDir}`);
    }

    /**
     * Write customers.json file atomically
     */
    async writeCustomersFile(customersData) {
        const tempFile = `${this.customersFile}.tmp`;
        
        try {
            // Write to temporary file first
            fs.writeFileSync(tempFile, JSON.stringify(customersData, null, 2), 'utf8');
            
            // Atomic rename
            fs.renameSync(tempFile, this.customersFile);
            
        } catch (error) {
            // Clean up temp file if it exists
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
            throw error;
        }
    }

    /**
     * Validate customer data structure
     */
    validateSingleCustomer(customerData) {
        const required = ['name', 'pubkey'];
        for (const field of required) {
            if (!customerData[field]) {
                throw new Error(`Customer ${field} is required`);
            }
        }

        // Validate pubkey format (64 character hex string)
        if (!/^[a-fA-F0-9]{64}$/.test(customerData.pubkey)) {
            throw new Error('Invalid pubkey format. Must be 64 character hex string.');
        }

        // Validate name format (alphanumeric and underscores only)
        if (!/^[a-zA-Z0-9_]+$/.test(customerData.name)) {
            throw new Error('Invalid customer name. Only alphanumeric characters and underscores allowed.');
        }

        // Validate status
        const validStatuses = ['active', 'inactive', 'suspended'];
        if (customerData.status && !validStatuses.includes(customerData.status)) {
            throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
        }
    }

    /**
     * Backup customer data to specified directory
     */
    async backupCustomerData(backupPath, options = {}) {
        const { includeSecureKeys = false, compress = false } = options;
        
        try {
            // Ensure backup directory exists
            if (!fs.existsSync(backupPath)) {
                fs.mkdirSync(backupPath, { recursive: true });
            }

            const backupManifest = {
                timestamp: new Date().toISOString(),
                version: '1.0',
                includeSecureKeys,
                files: []
            };

            // Backup customers.json
            const customersBackupPath = path.join(backupPath, 'customers.json');
            fs.copyFileSync(this.customersFile, customersBackupPath);
            backupManifest.files.push('customers.json');

            // Backup all customer directories
            const allCustomers = await this.getAllCustomers();
            for (const [name, customer] of Object.entries(allCustomers.customers)) {
                const sourceDir = path.join(this.customersDir, customer.directory);
                const backupDir = path.join(backupPath, customer.directory);
                
                if (fs.existsSync(sourceDir)) {
                    await this.copyDirectory(sourceDir, backupDir);
                    backupManifest.files.push(customer.directory);
                }
            }

            // Optionally backup secure keys (metadata only, not actual keys)
            if (includeSecureKeys) {
                const secureKeysPath = '/var/lib/brainstorm/secure-keys';
                try {
                    if (fs.existsSync(secureKeysPath)) {
                        // Test if we can read the directory
                        const keyFiles = fs.readdirSync(secureKeysPath);
                        const secureKeysBackupPath = path.join(backupPath, 'secure-keys-manifest.json');
                        const keyManifest = {
                            timestamp: new Date().toISOString(),
                            keyFiles: keyFiles.filter(f => f.endsWith('.enc')),
                            note: 'Actual keys must be backed up separately with proper security'
                        };
                        fs.writeFileSync(secureKeysBackupPath, JSON.stringify(keyManifest, null, 2));
                        backupManifest.files.push('secure-keys-manifest.json');
                        console.log('✅ Secure keys manifest included in backup');
                    } else {
                        console.log('⚠️ Secure keys directory not found, skipping');
                    }
                } catch (error) {
                    if (error.code === 'EACCES') {
                        console.log('⚠️ No permission to read secure keys directory, skipping');
                        console.log('   Run as brainstorm user or with sudo to include secure keys');
                    } else {
                        console.log(`⚠️ Failed to backup secure keys: ${error.message}`);
                    }
                    // Continue with backup even if secure keys fail
                }
            }

            // Write backup manifest
            const manifestPath = path.join(backupPath, 'backup-manifest.json');
            fs.writeFileSync(manifestPath, JSON.stringify(backupManifest, null, 2));

            console.log(`Customer data backed up to: ${backupPath}`);
            console.log(`Backed up ${backupManifest.files.length} items`);
            
            return {
                success: true,
                backupPath,
                manifest: backupManifest
            };

        } catch (error) {
            console.error('Failed to backup customer data:', error.message);
            throw error;
        }
    }

    /**
     * Restore customer data from backup
     */
    async restoreCustomerData(backupPath, options = {}) {
        const { merge = true, overwrite = false, dryRun = false } = options;
        
        try {
            // Validate backup directory
            const manifestPath = path.join(backupPath, 'backup-manifest.json');
            if (!fs.existsSync(manifestPath)) {
                throw new Error('Invalid backup: backup-manifest.json not found');
            }

            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            console.log(`Restoring backup from ${manifest.timestamp}`);

            if (dryRun) {
                console.log('DRY RUN - No changes will be made');
                console.log(`Would restore ${manifest.files.length} items:`);
                manifest.files.forEach(file => console.log(`  - ${file}`));
                return { success: true, dryRun: true, manifest };
            }

            // Create backup of current state before restore
            const preRestoreBackup = path.join(path.dirname(backupPath), `pre-restore-${Date.now()}`);
            await this.backupCustomerData(preRestoreBackup);
            console.log(`Created pre-restore backup: ${preRestoreBackup}`);

            const restoredItems = [];
            const skippedItems = [];

            // Restore customers.json
            const backupCustomersFile = path.join(backupPath, 'customers.json');
            if (fs.existsSync(backupCustomersFile)) {
                if (merge) {
                    await this.mergeCustomersFile(backupCustomersFile, overwrite);
                } else {
                    fs.copyFileSync(backupCustomersFile, this.customersFile);
                }
                restoredItems.push('customers.json');
            }

            // Restore customer directories
            const backupCustomers = JSON.parse(fs.readFileSync(backupCustomersFile, 'utf8'));
            for (const [name, customer] of Object.entries(backupCustomers.customers)) {
                const backupDir = path.join(backupPath, customer.directory);
                const targetDir = path.join(this.customersDir, customer.directory);
                
                if (fs.existsSync(backupDir)) {
                    if (!fs.existsSync(targetDir) || overwrite) {
                        await this.copyDirectory(backupDir, targetDir);
                        restoredItems.push(customer.directory);
                    } else {
                        skippedItems.push(`${customer.directory} (already exists)`);
                    }
                }
            }

            // Clear cache after restore
            this.cache.clear();

            console.log(`Restore completed:`);
            console.log(`  Restored: ${restoredItems.length} items`);
            console.log(`  Skipped: ${skippedItems.length} items`);
            
            return {
                success: true,
                restored: restoredItems,
                skipped: skippedItems,
                preRestoreBackup
            };

        } catch (error) {
            console.error('Failed to restore customer data:', error.message);
            throw error;
        }
    }

    /**
     * Merge default customers without overwriting existing ones
     */
    async mergeDefaultCustomers(defaultCustomersPath = null) {
        try {
            // Use provided path or look for default customers in the package
            const sourcePath = defaultCustomersPath || path.join(__dirname, '../../customers/customers.json');
            
            if (!fs.existsSync(sourcePath)) {
                console.warn(`Default customers file not found: ${sourcePath}`);
                return { success: false, reason: 'Default customers file not found' };
            }

            const defaultCustomers = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
            const currentCustomers = await this.getAllCustomers();
            
            const added = [];
            const skipped = [];

            // Merge customers that don't already exist
            for (const [name, customer] of Object.entries(defaultCustomers.customers)) {
                if (!currentCustomers.customers[name]) {
                    // Check if pubkey already exists under different name
                    const existingCustomer = Object.values(currentCustomers.customers)
                        .find(c => c.pubkey === customer.pubkey);
                    
                    if (!existingCustomer) {
                        currentCustomers.customers[name] = customer;
                        added.push(name);
                        
                        // Copy customer directory if it exists
                        const defaultDir = path.join(path.dirname(sourcePath), customer.directory);
                        const targetDir = path.join(this.customersDir, customer.directory);
                        
                        if (fs.existsSync(defaultDir) && !fs.existsSync(targetDir)) {
                            await this.copyDirectory(defaultDir, targetDir);
                        }
                    } else {
                        skipped.push(`${name} (pubkey exists as ${existingCustomer.name})`);
                    }
                } else {
                    skipped.push(`${name} (name already exists)`);
                }
            }

            // Write updated customers file if changes were made
            if (added.length > 0) {
                await this.writeCustomersFile(currentCustomers);
                this.cache.clear();
            }

            console.log(`Merge completed:`);
            console.log(`  Added: ${added.length} customers`);
            console.log(`  Skipped: ${skipped.length} customers`);
            
            return {
                success: true,
                added,
                skipped
            };

        } catch (error) {
            console.error('Failed to merge default customers:', error.message);
            throw error;
        }
    }

    /**
     * Merge customers.json files
     */
    async mergeCustomersFile(backupCustomersFile, overwrite = false) {
        const backupCustomers = JSON.parse(fs.readFileSync(backupCustomersFile, 'utf8'));
        const currentCustomers = await this.getAllCustomers();
        
        let merged = false;
        
        for (const [name, customer] of Object.entries(backupCustomers.customers)) {
            if (!currentCustomers.customers[name] || overwrite) {
                currentCustomers.customers[name] = customer;
                merged = true;
            }
        }
        
        if (merged) {
            await this.writeCustomersFile(currentCustomers);
            this.cache.clear();
        }
        
        return merged;
    }

    /**
     * Copy directory recursively
     */
    async copyDirectory(source, destination) {
        if (!fs.existsSync(destination)) {
            fs.mkdirSync(destination, { recursive: true });
        }
        
        const items = fs.readdirSync(source);
        
        for (const item of items) {
            const sourcePath = path.join(source, item);
            const destPath = path.join(destination, item);
            
            const stat = fs.statSync(sourcePath);
            
            if (stat.isDirectory()) {
                await this.copyDirectory(sourcePath, destPath);
            } else {
                fs.copyFileSync(sourcePath, destPath);
            }
        }
    }

    /**
     * Validate customer data integrity
     */
    async validateCustomerData() {
        const issues = [];
        
        try {
            const allCustomers = await this.getAllCustomers();
            const pubkeys = new Set();
            const ids = new Set();
            
            for (const [name, customer] of Object.entries(allCustomers.customers)) {
                // Check for duplicate pubkeys
                if (pubkeys.has(customer.pubkey)) {
                    issues.push(`Duplicate pubkey: ${customer.pubkey} (customer: ${name})`);
                } else {
                    pubkeys.add(customer.pubkey);
                }
                
                // Check for duplicate IDs
                if (ids.has(customer.id)) {
                    issues.push(`Duplicate ID: ${customer.id} (customer: ${name})`);
                } else {
                    ids.add(customer.id);
                }
                
                // Check if customer directory exists
                const customerDir = path.join(this.customersDir, customer.directory);
                if (!fs.existsSync(customerDir)) {
                    issues.push(`Missing directory: ${customer.directory} (customer: ${name})`);
                }
                
                // Validate customer data structure
                try {
                    this.validateSingleCustomer(customer);
                } catch (error) {
                    issues.push(`Invalid data for ${name}: ${error.message}`);
                }
            }
            
        } catch (error) {
            issues.push(`Failed to validate customers.json: ${error.message}`);
        }
        
        return {
            valid: issues.length === 0,
            issues
        };
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }
}

module.exports = CustomerManager;

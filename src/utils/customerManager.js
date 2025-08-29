const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const lockfile = require('proper-lockfile');
const archiver = require('archiver');
const { getCustomerRelayKeys } = require('./customerRelayKeys.js');

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

            // get time in seconds (unix)
            const signed_up = Math.floor(Date.now() / 1000);
            // Prepare customer data
            const newCustomer = {
                id: nextId,
                display_name: customerData.display_name || customerData.name,
                status: customerData.status || 'active',
                directory: customerData.directory || customerData.name,
                name: customerData.name,
                pubkey: customerData.pubkey,
                observer_id: customerData.observer_id || customerData.pubkey,
                comments: customerData.comments || 'default',
                subscription: {
                    service_tier: customerData.service_tier || 'free',
                    when_signed_up: signed_up,
                    update_interval: customerData.update_interval || 604800 // free tier: update scores once a week
                }
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
     * Change customer status (activate/deactivate)
     * @param {string} pubkey - Customer's public key
     * @param {string} newDisplayName - New display name
     * @returns {Object} Status change result
     */
    async changeCustomerDisplayName(pubkey, newDisplayName) {
        if (!pubkey) {
            throw new Error('Pubkey is required');
        }

        if (!newDisplayName) {
            throw new Error('New display name is required');
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
                throw new Error(`Customer with pubkey ${pubkey} not found`);
            }

            const oldDisplayName = customerToUpdate.display_name;
            if (oldDisplayName === newDisplayName) {
                return {
                    success: true,
                    message: `Customer ${customerName} is already ${newDisplayName}`,
                    customer: customerToUpdate,
                    statusChanged: false
                };
            }

            // Update the status
            customerToUpdate.display_name = newDisplayName;
            customerToUpdate.lastModified = new Date().toISOString();

            // Write back to file
            await this.writeCustomersFile(allCustomers);

            // Clear cache
            this.cache.clear();

            console.log(`Changed customer ${customerName} display name from ${oldDisplayName} to ${newDisplayName}`);

            return {
                success: true,
                message: `Customer ${customerName} display name changed from ${oldDisplayName} to ${newDisplayName}`,
                customer: customerToUpdate,
                statusChanged: true,
                oldDisplayName: oldDisplayName,
                newDisplayName: newDisplayName
            };

        } finally {
            await release();
        }
    }

    /**
     * Change customer status (activate/deactivate)
     * @param {string} pubkey - Customer's public key
     * @param {string} newStatus - New status ('active' or 'inactive')
     * @returns {Object} Status change result
     */
    async changeCustomerStatus(pubkey, newStatus) {
        if (!pubkey) {
            throw new Error('Pubkey is required');
        }

        if (!['active', 'inactive'].includes(newStatus)) {
            throw new Error('Status must be either "active" or "inactive"');
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
                throw new Error(`Customer with pubkey ${pubkey} not found`);
            }

            const oldStatus = customerToUpdate.status;
            if (oldStatus === newStatus) {
                return {
                    success: true,
                    message: `Customer ${customerName} is already ${newStatus}`,
                    customer: customerToUpdate,
                    statusChanged: false
                };
            }

            // Update the status
            customerToUpdate.status = newStatus;
            customerToUpdate.lastModified = new Date().toISOString();

            // Write back to file
            await this.writeCustomersFile(allCustomers);

            // Clear cache
            this.cache.clear();

            console.log(`Changed customer ${customerName} status from ${oldStatus} to ${newStatus}`);

            return {
                success: true,
                message: `Customer ${customerName} status changed from ${oldStatus} to ${newStatus}`,
                customer: customerToUpdate,
                statusChanged: true,
                oldStatus: oldStatus,
                newStatus: newStatus
            };

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

            // Step 2.5: Remove customer relay keys from brainstorm.conf
            try {
                this.removeCustomerFromBrainstormConf(customerToDelete);
                deletionSummary.brainstormConfCleaned = true;
                console.log(`Cleaned brainstorm.conf for customer: ${customerName}`);
            } catch (error) {
                const errorMsg = `Failed to clean brainstorm.conf: ${error.message}`;
                deletionSummary.errors.push(errorMsg);
                console.error(errorMsg);
                // Continue with deletion even if conf cleanup fails
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
     * Remove customer's relay keys from brainstorm.conf
     */
    removeCustomerFromBrainstormConf(customer) {
        try {
            const confPath = '/etc/brainstorm.conf';
            if (!fs.existsSync(confPath)) {
                console.log('brainstorm.conf not found, skipping relay key cleanup');
                return;
            }
            
            let confContent = fs.readFileSync(confPath, 'utf8');
            const customerPubkey = customer.pubkey;
            
            // Remove all relay key entries for this customer
            const patterns = [
                new RegExp(`CUSTOMER_${customerPubkey}_RELAY_PUBKEY='[^']*'\n?`, 'g'),
                new RegExp(`CUSTOMER_${customerPubkey}_RELAY_NPUB='[^']*'\n?`, 'g'),
                new RegExp(`CUSTOMER_${customerPubkey}_RELAY_PRIVKEY='[^']*'\n?`, 'g'),
                new RegExp(`CUSTOMER_${customerPubkey}_RELAY_NSEC='[^']*'\n?`, 'g')
            ];
            
            let removedCount = 0;
            patterns.forEach(pattern => {
                const matches = confContent.match(pattern);
                if (matches) {
                    removedCount += matches.length;
                    confContent = confContent.replace(pattern, '');
                }
            });
            
            if (removedCount > 0) {
                // Write back the cleaned content
                fs.writeFileSync(confPath, confContent);
                console.log(`Removed ${removedCount} relay key entries from brainstorm.conf for customer: ${customer.name}`);
            } else {
                console.log(`No relay key entries found in brainstorm.conf for customer: ${customer.name}`);
            }
        } catch (error) {
            console.error(`Error removing customer relay keys from brainstorm.conf:`, error.message);
            // Don't throw - this is cleanup, not critical
        }
    }

    /**
     * Remove customer's secure relay keys
     */
    async removeCustomerSecureKeys(customer) {
        try {
            // Import secure key storage if available
            const { SecureKeyStorage } = require('./secureKeyStorage');
            const secureStorage = new SecureKeyStorage();
            
            // Try to remove the customer's relay keys using their pubkey
            const deleted = await secureStorage.deleteRelayKeys(customer.pubkey);
            if (deleted) {
                console.log(`Removed secure keys for customer: ${customer.name}`);
            } else {
                console.log(`No secure keys found for customer: ${customer.name}`);
            }
        } catch (error) {
            // If secure storage is not available or key doesn't exist, that's okay
            if (error.code === 'MODULE_NOT_FOUND' || error.message.includes('not found') || error.message.includes('Master key required')) {
                console.log(`No secure keys found or secure storage not available for customer: ${customer.name}`);
            } else {
                console.error(`Error removing secure keys for customer ${customer.name}:`, error.message);
                throw error;
            }
        }
    }

    /**
     * List active customers
     */
    async listActiveCustomers() {
        const allCustomers = await this.getAllCustomers();
        // let's return all customers, even the ones who are inactive
        return Object.values(allCustomers.customers);
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

            // Optionally include secure keys manifest with relay nsec per customer
            if (includeSecureKeys) {
                const secureKeysPath = '/var/lib/brainstorm/secure-keys';
                try {
                    if (fs.existsSync(secureKeysPath)) {
                        const keyFiles = fs.readdirSync(secureKeysPath);
                        const secureKeysBackupPath = path.join(backupPath, 'secure-keys-manifest.json');
                        const customersWithKeys = [];
                        for (const [name, customer] of Object.entries(allCustomers.customers)) {
                            try {
                                const relayKeys = await getCustomerRelayKeys(customer.pubkey);
                                if (relayKeys && relayKeys.nsec) {
                                    customersWithKeys.push({
                                        name,
                                        id: customer.id,
                                        customer_pubkey: customer.pubkey,
                                        relay_pubkey: relayKeys.pubkey || null,
                                        relay_npub: relayKeys.npub || '',
                                        relay_nsec: relayKeys.nsec
                                    });
                                }
                            } catch (e) {
                                console.log(`⚠️ Failed to read relay keys for ${name}: ${e.message}`);
                            }
                        }
                        const keyManifest = {
                            schemaVersion: '1.1',
                            timestamp: new Date().toISOString(),
                            keyFiles: keyFiles.filter(f => f.endsWith('.enc')),
                            customers: customersWithKeys,
                            note: 'Includes sensitive relay secrets (nsec). Handle and store securely.'
                        };
                        fs.writeFileSync(secureKeysBackupPath, JSON.stringify(keyManifest, null, 2));
                        backupManifest.files.push('secure-keys-manifest.json');
                        console.log('✅ Secure keys manifest (with nsec) included in backup');
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

            // If requested, compress the entire backup directory into a .zip
            if (compress) {
                const zipPath = `${backupPath}.zip`;
                await new Promise((resolve, reject) => {
                    const output = fs.createWriteStream(zipPath);
                    const archive = archiver('zip', { zlib: { level: 9 } });

                    output.on('close', resolve);
                    output.on('error', reject);
                    archive.on('error', reject);

                    archive.pipe(output);
                    archive.directory(backupPath, false);
                    archive.finalize();
                });

                // Remove the uncompressed directory after successful compression
                try {
                    fs.rmSync(backupPath, { recursive: true, force: true });
                } catch (e) {
                    console.warn(`Warning: Failed to remove temp backup directory '${backupPath}': ${e.message}`);
                }

                console.log(`Customer data backed up to: ${zipPath}`);
                console.log(`Backed up ${backupManifest.files.length} items (compressed)`);

                return {
                    success: true,
                    backupPath: zipPath,
                    manifest: backupManifest
                };
            }

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
            let mergeResult = null;

            // Restore customers.json
            const backupCustomersFile = path.join(backupPath, 'customers.json');
            if (fs.existsSync(backupCustomersFile)) {
                if (merge) {
                    mergeResult = await this.mergeCustomersFile(backupCustomersFile, overwrite);
                } else {
                    // Non-merge path: write atomically with lock
                    const data = JSON.parse(fs.readFileSync(backupCustomersFile, 'utf8'));
                    const release = await lockfile.lock(this.customersFile, {
                        retries: 3,
                        minTimeout: 100,
                        maxTimeout: this.lockTimeout
                    });
                    try {
                        await this.writeCustomersFile(data);
                        this.cache.clear();
                    } finally {
                        await release();
                    }
                }
                restoredItems.push('customers.json');

                // If we merged, include a summary entry in the restored items for visibility
                if (merge && mergeResult) {
                    console.log('[restore] customers.json merge summary:', JSON.stringify(mergeResult));
                }
            }

            // Restore customer directories (only if customers.json is present)
            if (fs.existsSync(backupCustomersFile)) {
                const backupCustomers = JSON.parse(fs.readFileSync(backupCustomersFile, 'utf8'));
                let eligibleNames = null;
                if (merge && mergeResult) {
                    const added = Array.isArray(mergeResult.added) ? mergeResult.added : [];
                    const updated = Array.isArray(mergeResult.updated) ? mergeResult.updated : [];
                    eligibleNames = new Set([...added, ...updated]);
                }

                for (const [name, customer] of Object.entries(backupCustomers.customers)) {
                    try {
                        // Only copy directories for customers that were actually merged (added or updated)
                        if (eligibleNames && !eligibleNames.has(name)) {
                            skippedItems.push(`${customer.directory} (skipped - merge did not add/update this customer)`);
                            continue;
                        }

                        const backupDir = path.join(backupPath, customer.directory);
                        const targetDir = path.join(this.customersDir, customer.directory);
                        
                        if (!fs.existsSync(backupDir)) {
                            skippedItems.push(`${customer.directory} (missing in restore set)`);
                            continue;
                        }

                        if (!fs.existsSync(targetDir) || overwrite) {
                            await this.copyDirectory(backupDir, targetDir);
                            restoredItems.push(customer.directory);
                        } else {
                            skippedItems.push(`${customer.directory} (already exists)`);
                        }
                    } catch (e) {
                        console.error(`[restore] Error copying directory for ${name}: ${e.message}`);
                        skippedItems.push(`${customer.directory} (error: ${e.message})`);
                    }
                }
            }

            // Restore secure relay keys (if a manifest is present) for customers actually restored
            try {
                const secureKeysManifestPath = path.join(backupPath, 'secure-keys-manifest.json');
                if (fs.existsSync(secureKeysManifestPath)) {
                    const manifestJson = JSON.parse(fs.readFileSync(secureKeysManifestPath, 'utf8'));
                    const entries = Array.isArray(manifestJson.customers) ? manifestJson.customers : [];
                    
                    // Determine which customers from the backup were actually merged (added/updated)
                    const eligibleNames = (merge && mergeResult)
                        ? new Set([...(Array.isArray(mergeResult.added) ? mergeResult.added : []), ...(Array.isArray(mergeResult.updated) ? mergeResult.updated : [])])
                        : null;
                    
                    // Build set of eligible pubkeys based on customers.json content
                    const eligiblePubkeys = new Set();
                    try {
                        const backupCustomers = JSON.parse(fs.readFileSync(backupCustomersFile, 'utf8'));
                        for (const [name, c] of Object.entries(backupCustomers.customers || {})) {
                            if ((!eligibleNames || eligibleNames.has(name)) && c && c.pubkey) {
                                eligiblePubkeys.add(c.pubkey);
                            }
                        }
                    } catch (_) { /* ignore */ }
                    
                    // Store keys only for eligible customers
                    if (entries.length > 0 && eligiblePubkeys.size > 0) {
                        const { SecureKeyStorage } = require('./secureKeyStorage');
                        const secureStorage = new SecureKeyStorage();
                        let storedCount = 0;
                        for (const item of entries) {
                            try {
                                const customerPubkey = item.customer_pubkey || item.pubkey;
                                if (!customerPubkey || !eligiblePubkeys.has(customerPubkey)) continue;
                                
                                const nsec = item.relay_nsec || item.relay_nsec || null;
                                const payload = {
                                    nsec,
                                    pubkey: item.relay_pubkey || null,
                                    npub: item.relay_npub || null
                                };
                                
                                if (payload.nsec) {
                                    await secureStorage.storeRelayKeys(customerPubkey, payload);
                                    storedCount++;
                                } else {
                                    console.warn(`[restore] secure-keys-manifest entry for ${customerPubkey} missing nsec; skipping`);
                                }
                            } catch (e) {
                                console.error(`[restore] Failed to store secure keys for manifest entry: ${e.message}`);
                            }
                        }
                        if (storedCount > 0) {
                            restoredItems.push('secure-keys-manifest.json');
                            console.log(`[restore] Stored secure relay keys for ${storedCount} customer(s)`);
                        }
                    }
                }
            } catch (e) {
                console.error(`[restore] Error processing secure-keys-manifest.json: ${e.message}`);
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
     * Merge customers.json files with locking, unique ID enforcement, and comments update
     * - Ensures no ID collisions with existing customers
     * - Sets comments to "Added via restore interface" for added/updated customers
     * - Returns a detailed merge summary for logging/UX
     */
    async mergeCustomersFile(backupCustomersFile, overwrite = false) {
        const backupCustomers = JSON.parse(fs.readFileSync(backupCustomersFile, 'utf8'));

        const release = await lockfile.lock(this.customersFile, {
            retries: 3,
            minTimeout: 100,
            maxTimeout: this.lockTimeout
        });

        const result = {
            merged: false,
            added: [],
            updated: [],
            skipped: [], // array of { name, reason }
            reassignedIds: [], // array of { name, oldId, newId }
            commentsUpdated: [],
            errors: []
        };

        try {
            const currentCustomers = await this.getAllCustomers();

            // Build sets/maps for quick checks
            const existingIds = new Set();
            const pubkeyToName = new Map();
            let maxId = -1;

            for (const [existingName, existingCustomer] of Object.entries(currentCustomers.customers)) {
                if (typeof existingCustomer.id === 'number') {
                    existingIds.add(existingCustomer.id);
                    if (existingCustomer.id > maxId) maxId = existingCustomer.id;
                }
                if (existingCustomer.pubkey) {
                    pubkeyToName.set(existingCustomer.pubkey, existingName);
                }
            }

            const getNextId = () => {
                maxId = maxId + 1;
                existingIds.add(maxId);
                return maxId;
            };

            // Iterate backup customers and merge with rules
            for (const [name, customer] of Object.entries(backupCustomers.customers || {})) {
                try {
                    // Prepare normalized payload (ensure name present before validation)
                    const payload = { ...customer };
                    payload.name = name;
                    payload.display_name = payload.display_name || name;
                    payload.directory = payload.directory || name;
                    payload.comments = 'Added via restore interface';

                    // Validate normalized payload
                    this.validateSingleCustomer(payload);

                    const existingByName = currentCustomers.customers[name];
                    const otherNameWithPubkey = pubkeyToName.get(payload.pubkey);

                    // If another customer already has this pubkey under a different name, avoid creating duplicates
                    if (!existingByName && otherNameWithPubkey && otherNameWithPubkey !== name) {
                        const reason = `pubkey exists as '${otherNameWithPubkey}'`;
                        console.warn(`[restore] Skipping customer '${name}': ${reason}`);
                        result.skipped.push({ name, reason });
                        continue;
                    }

                    if (existingByName) {
                        if (!overwrite) {
                            const reason = 'name exists and overwrite=false';
                            console.warn(`[restore] Skipping customer '${name}': ${reason}`);
                            result.skipped.push({ name, reason });
                            continue;
                        }

                        // Preserve existing ID to avoid conflicts
                        const oldId = existingByName.id;
                        if (typeof oldId === 'number') {
                            payload.id = oldId;
                        } else {
                            // Assign a new ID if existing has no numeric id
                            const newId = getNextId();
                            payload.id = newId;
                            result.reassignedIds.push({ name, oldId: oldId ?? null, newId });
                        }

                        // Perform update
                        currentCustomers.customers[name] = payload;
                        result.updated.push(name);
                        result.commentsUpdated.push(name);
                        result.merged = true;
                        console.log(`[restore] Updated customer '${name}' (ID ${payload.id})`);
                    } else {
                        // Assign unique ID
                        let desiredId = payload.id;
                        if (typeof desiredId !== 'number' || existingIds.has(desiredId)) {
                            const newId = getNextId();
                            if (typeof desiredId === 'number') {
                                result.reassignedIds.push({ name, oldId: desiredId, newId });
                            }
                            desiredId = newId;
                        }
                        payload.id = desiredId;

                        // Insert new
                        currentCustomers.customers[name] = payload;
                        existingIds.add(payload.id);
                        if (payload.id > maxId) maxId = payload.id;
                        pubkeyToName.set(payload.pubkey, name);
                        result.added.push(name);
                        result.commentsUpdated.push(name);
                        result.merged = true;
                        console.log(`[restore] Added customer '${name}' (ID ${payload.id})`);
                    }
                } catch (e) {
                    console.error(`[restore] Error merging customer '${name}': ${e.message}`);
                    result.errors.push(`merge ${name}: ${e.message}`);
                }
            }

            if (result.merged) {
                await this.writeCustomersFile(currentCustomers);
                this.cache.clear();
            }

            return result;
        } finally {
            await release();
        }
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
     * Get GrapeRank preset for a customer by analyzing their graperank.conf file
     * @param {string} customerPubkey - Customer's public key
     * @returns {Promise<Object>} Preset analysis result
     */
    async getGrapeRankPreset(customerPubkey) {
        try {
            // Validate customer exists
            const customer = await this.getCustomer(customerPubkey);
            if (!customer) {
                return {
                    preset: 'Customer Not Found',
                    error: 'Customer does not exist',
                    customerPubkey
                };
            }

            // Construct path to customer's graperank.conf file
            const customerDir = path.join(this.customersDir, customer.name);
            const grapeRankConfigPath = path.join(customerDir, 'preferences', 'graperank.conf');

            // Check if config file exists
            if (!fs.existsSync(grapeRankConfigPath)) {
                return {
                    preset: 'Config File Not Found',
                    error: 'GrapeRank configuration file does not exist',
                    configPath: grapeRankConfigPath,
                    customer: {
                        name: customer.name,
                        id: customer.id,
                        pubkey: customerPubkey
                    }
                };
            }

            // Read and parse the configuration file
            const configContent = fs.readFileSync(grapeRankConfigPath, 'utf8');
            const configData = this.parseGrapeRankConfig(configContent);

            if (configData.error) {
                return {
                    preset: 'Error',
                    error: configData.error,
                    configPath: grapeRankConfigPath,
                    customer: {
                        name: customer.name,
                        id: customer.id,
                        pubkey: customerPubkey
                    }
                };
            }

            // Determine preset by comparing live values to presets
            const presetResult = this.determineGrapeRankPreset(configData);

            return {
                preset: presetResult.preset,
                details: presetResult.details,
                configPath: grapeRankConfigPath,
                customer: {
                    name: customer.name,
                    id: customer.id,
                    pubkey: customerPubkey
                },
                parameters: configData.parameters,
                liveValues: configData.liveValues,
                presetValues: configData.presetValues
            };

        } catch (error) {
            console.error('Error getting GrapeRank preset:', error);
            return {
                preset: 'Error',
                error: error.message,
                customerPubkey
            };
        }
    }

    /**
     * Parse GrapeRank configuration file and extract parameters
     * @param {string} configContent - Raw configuration file content
     * @returns {Object} Parsed configuration data
     */
    parseGrapeRankConfig(configContent) {
        try {
            const lines = configContent.split('\n');
            const exports = {};

            // Extract all export statements
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('export ') && trimmed.includes('=')) {
                    const exportMatch = trimmed.match(/^export\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
                    if (exportMatch) {
                        const [, key, value] = exportMatch;
                        // Parse the value, handling quotes and special cases
                        let parsedValue = value.trim();
                        if (parsedValue.startsWith("'") && parsedValue.endsWith("'")) {
                            parsedValue = parsedValue.slice(1, -1);
                        } else if (parsedValue.startsWith('"') && parsedValue.endsWith('"')) {
                            parsedValue = parsedValue.slice(1, -1);
                        } else if (parsedValue === 'true') {
                            parsedValue = true;
                        } else if (parsedValue === 'false') {
                            parsedValue = false;
                        } else if (!isNaN(parsedValue) && parsedValue !== '') {
                            parsedValue = parseFloat(parsedValue);
                        }
                        exports[key] = parsedValue;
                    }
                }
            }

            // Extract parameter list
            if (!exports.PARAMETER_LIST) {
                return {
                    error: 'PARAMETER_LIST not found in configuration file'
                };
            }

            let parameterList;
            try {
                parameterList = JSON.parse(exports.PARAMETER_LIST);
            } catch (e) {
                return {
                    error: 'PARAMETER_LIST is not valid JSON'
                };
            }

            // Extract live values for each parameter
            const liveValues = {};
            const presetValues = {
                permissive: {},
                default: {},
                restrictive: {}
            };

            for (const param of parameterList) {
                // Get live value
                if (exports[param] === undefined) {
                    return {
                        error: `Live parameter ${param} not found in configuration file`
                    };
                }
                liveValues[param] = exports[param];

                // Get preset values
                const permissiveKey = `${param}_permissive`;
                const defaultKey = `${param}_default`;
                const restrictiveKey = `${param}_restrictive`;

                if (exports[permissiveKey] === undefined) {
                    return {
                        error: `Preset parameter ${permissiveKey} not found in configuration file`
                    };
                }
                if (exports[defaultKey] === undefined) {
                    return {
                        error: `Preset parameter ${defaultKey} not found in configuration file`
                    };
                }
                if (exports[restrictiveKey] === undefined) {
                    return {
                        error: `Preset parameter ${restrictiveKey} not found in configuration file`
                    };
                }

                presetValues.permissive[param] = exports[permissiveKey];
                presetValues.default[param] = exports[defaultKey];
                presetValues.restrictive[param] = exports[restrictiveKey];
            }

            return {
                parameters: parameterList,
                liveValues,
                presetValues,
                allExports: exports
            };

        } catch (error) {
            return {
                error: `Failed to parse configuration file: ${error.message}`
            };
        }
    }

    /**
     * Determine GrapeRank preset by comparing live values to presets
     * @param {Object} configData - Parsed configuration data
     * @returns {Object} Preset determination result
     */
    determineGrapeRankPreset(configData) {
        const { parameters, liveValues, presetValues } = configData;
        
        // Check if live values match permissive preset
        let matchesPermissive = true;
        let matchesDefault = true;
        let matchesRestrictive = true;
        
        const comparisonDetails = {};
        
        for (const param of parameters) {
            const liveValue = liveValues[param];
            const permissiveValue = presetValues.permissive[param];
            const defaultValue = presetValues.default[param];
            const restrictiveValue = presetValues.restrictive[param];
            
            comparisonDetails[param] = {
                live: liveValue,
                permissive: permissiveValue,
                default: defaultValue,
                restrictive: restrictiveValue,
                matchesPermissive: this.valuesEqual(liveValue, permissiveValue),
                matchesDefault: this.valuesEqual(liveValue, defaultValue),
                matchesRestrictive: this.valuesEqual(liveValue, restrictiveValue)
            };
            
            if (!comparisonDetails[param].matchesPermissive) {
                matchesPermissive = false;
            }
            if (!comparisonDetails[param].matchesDefault) {
                matchesDefault = false;
            }
            if (!comparisonDetails[param].matchesRestrictive) {
                matchesRestrictive = false;
            }
        }
        
        // Determine preset
        let preset;
        if (matchesPermissive) {
            preset = 'Permissive';
        } else if (matchesDefault) {
            preset = 'Default';
        } else if (matchesRestrictive) {
            preset = 'Restrictive';
        } else {
            preset = 'Custom';
        }
        
        return {
            preset,
            details: {
                matchesPermissive,
                matchesDefault,
                matchesRestrictive,
                parameterComparisons: comparisonDetails
            }
        };
    }

    /**
     * Compare two values for equality, handling different types appropriately
     * @param {*} value1 - First value
     * @param {*} value2 - Second value
     * @returns {boolean} Whether values are equal
     */
    valuesEqual(value1, value2) {
        // Handle exact equality
        if (value1 === value2) {
            return true;
        }
        
        // Handle string/number comparisons
        if (typeof value1 === 'string' && typeof value2 === 'number') {
            return parseFloat(value1) === value2;
        }
        if (typeof value1 === 'number' && typeof value2 === 'string') {
            return value1 === parseFloat(value2);
        }
        
        // Handle boolean/string comparisons
        if (typeof value1 === 'boolean' && typeof value2 === 'string') {
            return value1.toString() === value2;
        }
        if (typeof value1 === 'string' && typeof value2 === 'boolean') {
            return value1 === value2.toString();
        }
        
        return false;
    }

    /**
     * Update GrapeRank preset for a customer
     * @param {string} customerPubkey - Customer's public key
     * @param {string} newPreset - New preset to apply (permissive, default, restrictive)
     * @returns {Promise<Object>} Update result
     */
    async updateGrapeRankPreset(customerPubkey, newPreset) {
        try {
            // Validate customer exists
            const customer = await this.getCustomer(customerPubkey);
            if (!customer) {
                return {
                    success: false,
                    error: 'Customer does not exist',
                    customerPubkey
                };
            }

            // Validate preset value
            const validPresets = ['permissive', 'default', 'restrictive'];
            if (!validPresets.includes(newPreset.toLowerCase())) {
                return {
                    success: false,
                    error: `Invalid preset. Must be one of: ${validPresets.join(', ')}`,
                    customerPubkey,
                    customer: {
                        name: customer.name,
                        id: customer.id
                    }
                };
            }

            // Construct path to customer's graperank.conf file
            const customerDir = path.join(this.customersDir, customer.name);
            const grapeRankConfigPath = path.join(customerDir, 'preferences', 'graperank.conf');

            // Check if config file exists
            if (!fs.existsSync(grapeRankConfigPath)) {
                return {
                    success: false,
                    error: 'GrapeRank configuration file does not exist',
                    configPath: grapeRankConfigPath,
                    customer: {
                        name: customer.name,
                        id: customer.id,
                        pubkey: customerPubkey
                    }
                };
            }

            // Read and parse the current configuration
            const configContent = fs.readFileSync(grapeRankConfigPath, 'utf8');
            const configData = this.parseGrapeRankConfig(configContent);

            if (configData.error) {
                return {
                    success: false,
                    error: `Failed to parse configuration: ${configData.error}`,
                    configPath: grapeRankConfigPath,
                    customer: {
                        name: customer.name,
                        id: customer.id,
                        pubkey: customerPubkey
                    }
                };
            }

            // Create backup of original file
            const backupPath = `${grapeRankConfigPath}.backup.${Date.now()}`;
            fs.copyFileSync(grapeRankConfigPath, backupPath);

            try {
                // Update the configuration with new preset values
                const updatedConfig = this.applyPresetToConfig(configContent, configData, newPreset);
                
                // Write the updated configuration
                fs.writeFileSync(grapeRankConfigPath, updatedConfig, 'utf8');
                
                // Verify the update was successful
                const verificationData = this.parseGrapeRankConfig(updatedConfig);
                const verificationResult = this.determineGrapeRankPreset(verificationData);
                
                const expectedPreset = newPreset.charAt(0).toUpperCase() + newPreset.slice(1);
                if (verificationResult.preset !== expectedPreset) {
                    throw new Error(`Preset verification failed. Expected ${expectedPreset}, got ${verificationResult.preset}`);
                }
                
                // Clean up backup file on success
                fs.unlinkSync(backupPath);
                
                return {
                    success: true,
                    message: `Successfully updated GrapeRank preset to ${expectedPreset}`,
                    oldPreset: this.determineGrapeRankPreset(configData).preset,
                    newPreset: expectedPreset,
                    configPath: grapeRankConfigPath,
                    customer: {
                        name: customer.name,
                        id: customer.id,
                        pubkey: customerPubkey
                    },
                    backupCreated: backupPath,
                    timestamp: new Date().toISOString()
                };
                
            } catch (updateError) {
                // Restore backup on failure
                if (fs.existsSync(backupPath)) {
                    fs.copyFileSync(backupPath, grapeRankConfigPath);
                    fs.unlinkSync(backupPath);
                }
                
                throw new Error(`Failed to update configuration: ${updateError.message}`);
            }

        } catch (error) {
            console.error('Error updating GrapeRank preset:', error);
            return {
                success: false,
                error: error.message,
                customerPubkey
            };
        }
    }

    /**
     * Apply preset values to configuration content
     * @param {string} originalContent - Original configuration file content
     * @param {Object} configData - Parsed configuration data
     * @param {string} preset - Preset to apply (permissive, default, restrictive)
     * @returns {string} Updated configuration content
     */
    applyPresetToConfig(originalContent, configData, preset) {
        const { parameters, presetValues } = configData;
        let updatedContent = originalContent;
        
        console.log(`Applying preset '${preset}' with parameters:`, parameters);
        
        // Update each parameter with the new preset values
        for (const param of parameters) {
            const newValue = presetValues[preset][param];
            
            console.log(`Updating parameter ${param}: ${newValue}`);
            
            // Create more flexible regex to match the export line
            // This matches: export PARAM_NAME=value (with optional whitespace)
            const paramRegex = new RegExp(`^(export\s+${param}\s*=).*$`, 'gm');
            
            // Format the new value properly to match original format
            let formattedValue;
            if (typeof newValue === 'string') {
                formattedValue = `'${newValue}'`;
            } else if (typeof newValue === 'boolean') {
                formattedValue = newValue.toString();
            } else if (typeof newValue === 'number') {
                formattedValue = newValue.toString();
            } else {
                formattedValue = `'${newValue}'`;
            }
            
            // Create the replacement line
            const newLine = `export ${param}=${formattedValue}`;
            
            // Check if the parameter exists in the content
            const matches = originalContent.match(paramRegex);
            if (matches && matches.length > 0) {
                console.log(`Found existing line for ${param}:`, matches[0]);
                console.log(`Replacing with:`, newLine);
                updatedContent = updatedContent.replace(paramRegex, newLine);
            } else {
                console.warn(`Parameter ${param} not found in configuration file`);
                // If parameter doesn't exist, add it at the end
                updatedContent += `\n${newLine}`;
            }
        }
        
        console.log('Configuration update completed');
        return updatedContent;
    }

    /**
     * GENERALIZED CONFIGURATION MANAGEMENT METHODS
     * These methods work with any .conf file that has PARAMETER_LIST and PRESET_LIST
     */

    /**
     * Get configuration preset for any config type
     * @param {string} customerPubkey - Customer's public key
     * @param {string} configType - Configuration type (e.g., 'whitelist', 'blacklist', 'graperank')
     * @returns {Promise<Object>} Preset analysis result
     */
    async getConfigPreset(customerPubkey, configType) {
        try {
            // Validate customer exists
            const customer = await this.getCustomer(customerPubkey);
            if (!customer) {
                return {
                    preset: 'Customer Not Found',
                    error: 'Customer does not exist',
                    customerPubkey,
                    configType
                };
            }

            // Construct path to customer's config file
            const customerDir = path.join(this.customersDir, customer.name);
            const configPath = path.join(customerDir, 'preferences', `${configType}.conf`);

            // Check if config file exists
            if (!fs.existsSync(configPath)) {
                return {
                    preset: 'Config File Not Found',
                    error: `Configuration file ${configType}.conf does not exist`,
                    configPath,
                    customer: {
                        name: customer.name,
                        id: customer.id,
                        pubkey: customerPubkey
                    },
                    configType
                };
            }

            // Read and parse the configuration
            const configContent = fs.readFileSync(configPath, 'utf8');
            const configData = this.parseGeneralConfig(configContent);

            if (configData.error) {
                return {
                    preset: 'Error',
                    error: configData.error,
                    configPath,
                    customer: {
                        name: customer.name,
                        id: customer.id,
                        pubkey: customerPubkey
                    },
                    configType
                };
            }

            // Determine the current preset
            const presetResult = this.determineGeneralPreset(configData);

            return {
                preset: presetResult.preset,
                configPath,
                parameterCount: configData.parameters ? configData.parameters.length : 0,
                availablePresets: configData.availablePresets || [],
                customer: {
                    name: customer.name,
                    id: customer.id,
                    pubkey: customerPubkey
                },
                configType,
                details: presetResult.details
            };

        } catch (error) {
            console.error(`Error getting ${configType} preset:`, error);
            return {
                preset: 'Error',
                error: error.message,
                customerPubkey,
                configType
            };
        }
    }

    /**
     * Parse any configuration file with PARAMETER_LIST and PRESET_LIST
     * @param {string} configContent - Configuration file content
     * @returns {Object} Parsed configuration data
     */
    parseGeneralConfig(configContent) {
        try {
            const lines = configContent.split('\n');
            const exports = {};

            // Parse all export statements
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('export ') && trimmed.includes('=')) {
                    const exportMatch = trimmed.match(/^export\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
                    if (exportMatch) {
                        const [, key, value] = exportMatch;
                        // Parse the value, handling quotes and special cases
                        let parsedValue = value.trim();
                        if (parsedValue.startsWith("'") && parsedValue.endsWith("'")) {
                            parsedValue = parsedValue.slice(1, -1);
                        } else if (parsedValue.startsWith('"') && parsedValue.endsWith('"')) {
                            parsedValue = parsedValue.slice(1, -1);
                        } else if (parsedValue === 'true') {
                            parsedValue = true;
                        } else if (parsedValue === 'false') {
                            parsedValue = false;
                        } else if (!isNaN(parsedValue) && parsedValue !== '') {
                            parsedValue = parseFloat(parsedValue);
                        }
                        exports[key] = parsedValue;
                    }
                }
            }

            // Extract parameter list
            if (!exports.PARAMETER_LIST) {
                return {
                    error: 'PARAMETER_LIST not found in configuration file'
                };
            }

            let parameterList;
            try {
                parameterList = JSON.parse(exports.PARAMETER_LIST);
            } catch (e) {
                return {
                    error: 'PARAMETER_LIST is not valid JSON'
                };
            }

            // Extract preset list (new feature)
            let availablePresets = ['permissive', 'default', 'restrictive']; // Default fallback
            if (exports.PRESET_LIST) {
                try {
                    availablePresets = JSON.parse(exports.PRESET_LIST);
                } catch (e) {
                    console.warn('PRESET_LIST is not valid JSON, using default presets');
                }
            }

            // Extract live values for each parameter
            const liveValues = {};
            const presetValues = {};

            // Initialize preset values structure
            for (const preset of availablePresets) {
                presetValues[preset] = {};
            }

            for (const param of parameterList) {
                // Get live value
                if (exports[param] !== undefined) {
                    liveValues[param] = exports[param];
                }

                // Get preset values
                for (const preset of availablePresets) {
                    const presetKey = `${param}_${preset.toLowerCase()}`;
                    console.log(`Looking for preset key: ${presetKey}`);
                    if (exports[presetKey] !== undefined) {
                        console.log(`Found preset value: ${presetKey} = ${exports[presetKey]}`);
                        presetValues[preset][param] = exports[presetKey];
                    } else {
                        console.log(`Preset key not found: ${presetKey}`);
                    }
                }
            }

            return {
                parameters: parameterList,
                availablePresets,
                liveValues,
                presetValues,
                allExports: exports
            };

        } catch (error) {
            return {
                error: `Failed to parse configuration: ${error.message}`
            };
        }
    }

    /**
     * Determine which preset matches the current live values
     * @param {Object} configData - Parsed configuration data
     * @returns {Object} Preset determination result
     */
    determineGeneralPreset(configData) {
        const { parameters, availablePresets, liveValues, presetValues } = configData;
        
        console.log('=== PRESET DETERMINATION DEBUG ===');
        console.log('Available presets:', availablePresets);
        console.log('Parameters:', parameters);
        console.log('Live values:', liveValues);
        console.log('Preset values:', presetValues);
        
        // Check each available preset
        for (const preset of availablePresets) {
            let matches = true;
            const mismatches = [];
            
            console.log(`\n--- Checking preset: ${preset} ---`);
            
            for (const param of parameters) {
                const liveValue = liveValues[param];
                const presetValue = presetValues[preset][param];
                
                console.log(`Parameter ${param}:`);
                console.log(`  Live: ${liveValue} (type: ${typeof liveValue})`);
                console.log(`  Preset: ${presetValue} (type: ${typeof presetValue})`);
                
                const isEqual = this.valuesEqual(liveValue, presetValue);
                console.log(`  Equal: ${isEqual}`);
                
                if (!isEqual) {
                    matches = false;
                    mismatches.push({
                        parameter: param,
                        liveValue,
                        presetValue,
                        liveType: typeof liveValue,
                        presetType: typeof presetValue
                    });
                }
            }
            
            console.log(`Preset ${preset} matches: ${matches}`);
            if (mismatches.length > 0) {
                console.log('Mismatches:', mismatches);
            }
            
            if (matches) {
                const presetName = preset.charAt(0).toUpperCase() + preset.slice(1);
                console.log(`=== MATCH FOUND: ${presetName} ===`);
                return {
                    preset: presetName,
                    details: {
                        matchedPreset: preset,
                        allParametersMatch: true,
                        availablePresets
                    }
                };
            }
        }
        
        // No preset matches - it's custom
        console.log('=== NO MATCH FOUND - CUSTOM ===');
        return {
            preset: 'Custom',
            details: {
                matchedPreset: null,
                allParametersMatch: false,
                availablePresets,
                note: 'Configuration does not match any available preset'
            }
        };
    }

    /**
     * Update configuration preset for any config type
     * @param {string} customerPubkey - Customer's public key
     * @param {string} configType - Configuration type (e.g., 'whitelist', 'blacklist')
     * @param {string} newPreset - New preset to apply
     * @returns {Promise<Object>} Update result
     */
    async updateConfigPreset(customerPubkey, configType, newPreset) {
        try {
            // Validate customer exists
            const customer = await this.getCustomer(customerPubkey);
            if (!customer) {
                return {
                    success: false,
                    error: 'Customer does not exist',
                    customerPubkey,
                    configType
                };
            }

            // Construct path to customer's config file
            const customerDir = path.join(this.customersDir, customer.name);
            const configPath = path.join(customerDir, 'preferences', `${configType}.conf`);

            // Check if config file exists
            if (!fs.existsSync(configPath)) {
                return {
                    success: false,
                    error: `Configuration file ${configType}.conf does not exist`,
                    configPath,
                    customer: {
                        name: customer.name,
                        id: customer.id,
                        pubkey: customerPubkey
                    },
                    configType
                };
            }

            // Read and parse the current configuration
            const configContent = fs.readFileSync(configPath, 'utf8');
            const configData = this.parseGeneralConfig(configContent);

            if (configData.error) {
                return {
                    success: false,
                    error: `Failed to parse configuration: ${configData.error}`,
                    configPath,
                    customer: {
                        name: customer.name,
                        id: customer.id,
                        pubkey: customerPubkey
                    },
                    configType
                };
            }

            // Validate preset is available
            if (!configData.availablePresets.includes(newPreset.toLowerCase())) {
                return {
                    success: false,
                    error: `Invalid preset '${newPreset}'. Available presets: ${configData.availablePresets.join(', ')}`,
                    customerPubkey,
                    configType,
                    availablePresets: configData.availablePresets,
                    customer: {
                        name: customer.name,
                        id: customer.id
                    }
                };
            }

            // Create backup of original file
            const backupPath = `${configPath}.backup.${Date.now()}`;
            fs.copyFileSync(configPath, backupPath);

            try {
                // Update the configuration with new preset values
                const updatedConfig = this.applyGeneralPresetToConfig(configContent, configData, newPreset.toLowerCase());
                
                // Write the updated configuration
                fs.writeFileSync(configPath, updatedConfig, 'utf8');
                
                // Verify the update was successful
                const verificationData = this.parseGeneralConfig(updatedConfig);
                const verificationResult = this.determineGeneralPreset(verificationData);
                
                const expectedPreset = newPreset.charAt(0).toUpperCase() + newPreset.slice(1);
                if (verificationResult.preset !== expectedPreset) {
                    throw new Error(`Preset verification failed. Expected ${expectedPreset}, got ${verificationResult.preset}`);
                }
                
                // Clean up backup file on success
                fs.unlinkSync(backupPath);
                
                return {
                    success: true,
                    message: `Successfully updated ${configType} preset to ${expectedPreset}`,
                    oldPreset: this.determineGeneralPreset(configData).preset,
                    newPreset: expectedPreset,
                    configPath,
                    configType,
                    customer: {
                        name: customer.name,
                        id: customer.id,
                        pubkey: customerPubkey
                    },
                    timestamp: new Date().toISOString()
                };
                
            } catch (updateError) {
                // Restore backup on failure
                if (fs.existsSync(backupPath)) {
                    fs.copyFileSync(backupPath, configPath);
                    fs.unlinkSync(backupPath);
                }
                
                throw new Error(`Failed to update configuration: ${updateError.message}`);
            }

        } catch (error) {
            console.error(`Error updating ${configType} preset:`, error);
            return {
                success: false,
                error: error.message,
                customerPubkey,
                configType
            };
        }
    }

    /**
     * Apply preset values to any configuration content
     * @param {string} originalContent - Original configuration file content
     * @param {Object} configData - Parsed configuration data
     * @param {string} preset - Preset to apply
     * @returns {string} Updated configuration content
     */
    applyGeneralPresetToConfig(originalContent, configData, preset) {
        const { parameters, presetValues } = configData;
        let updatedContent = originalContent;
        
        console.log(`Applying preset '${preset}' with parameters:`, parameters);
        
        // Update each parameter with the new preset values
        for (const param of parameters) {
            const newValue = presetValues[preset][param];
            
            console.log(`Updating parameter ${param}: ${newValue}`);
            
            // Format the new value properly to match original format
            let formattedValue;
            if (typeof newValue === 'string') {
                formattedValue = `'${newValue}'`;
            } else if (typeof newValue === 'boolean') {
                formattedValue = newValue.toString();
            } else if (typeof newValue === 'number') {
                formattedValue = newValue.toString();
            } else {
                formattedValue = `'${newValue}'`;
            }
            
            // Create the replacement line
            const newLine = `export ${param}=${formattedValue}`;
            
            console.log(`\n=== DEBUGGING PARAMETER REPLACEMENT FOR ${param} ===`);
            console.log(`Looking for parameter: ${param}`);
            console.log(`New line to insert: ${newLine}`);
            
            // Create more robust regex patterns to match the export line
            // Try multiple patterns to handle different spacing and formats
            const regexPatterns = [
                new RegExp(`^export\s+${param}\s*=.*$`, 'gm'),
                new RegExp(`^export\s+${param}=.*$`, 'gm'),
                new RegExp(`^\s*export\s+${param}\s*=.*$`, 'gm'),
                new RegExp(`^export ${param}=.*$`, 'gm'),
                new RegExp(`export ${param}=.*$`, 'gm')
            ];
            
            let replaced = false;
            
            // Debug: Show lines that contain the parameter name
            const lines = updatedContent.split('\n');
            const matchingLines = lines.filter(line => line.includes(param));
            console.log(`Lines containing '${param}':`, matchingLines);
            
            // Try each regex pattern
            for (let i = 0; i < regexPatterns.length; i++) {
                const paramRegex = regexPatterns[i];
                console.log(`Trying regex pattern ${i + 1}: ${paramRegex.source}`);
                
                const matches = updatedContent.match(paramRegex);
                if (matches && matches.length > 0) {
                    console.log(`✅ MATCH FOUND with pattern ${i + 1}:`, matches[0]);
                    console.log(`Replacing with:`, newLine);
                    
                    // Check if the existing line already has the correct value
                    const existingLine = matches[0];
                    if (existingLine === newLine) {
                        console.log(`✅ PARAMETER ALREADY HAS CORRECT VALUE - no change needed`);
                        replaced = true;
                        break;
                    }
                    
                    // Perform the replacement
                    const oldContent = updatedContent;
                    updatedContent = updatedContent.replace(paramRegex, newLine);
                    
                    if (oldContent !== updatedContent) {
                        console.log(`✅ REPLACEMENT SUCCESSFUL - content changed`);
                        replaced = true;
                        break;
                    } else {
                        console.log(`❌ REPLACEMENT FAILED - content unchanged despite different values`);
                        console.log(`  Existing: '${existingLine}'`);
                        console.log(`  New:      '${newLine}'`);
                    }
                } else {
                    console.log(`❌ No match with pattern ${i + 1}`);
                }
            }
            
            if (!replaced) {
                console.warn(`❌ Parameter ${param} not found in configuration file, adding at end`);
                console.log(`Current content length: ${updatedContent.length}`);
                // If parameter doesn't exist, add it at the end
                updatedContent += `\n${newLine}`;
                console.log(`New content length: ${updatedContent.length}`);
            }
            
            console.log(`=== END DEBUGGING FOR ${param} ===\n`);
        }
        
        console.log('Configuration update completed');
        return updatedContent;
    }

    // ===== NIP-85 STATUS UTILITY METHODS =====
    
    /**
     * Get comprehensive NIP-85 status for a customer
     * @param {string} pubkey - Customer pubkey
     * @param {Object} options - Configuration options
     * @param {boolean} options.includeEvents - Whether to include full event data (default: false)
     * @param {boolean} options.includeRelayKeys - Whether to include relay key data (default: true)
     * @returns {Promise<Object>} Comprehensive NIP-85 status
     */
    async getNip85Status(pubkey, options = {}) {
        const {
            includeEvents = false,
            includeRelayKeys = true
        } = options;
        
        try {
            // Get customer relay keys status
            const relayKeysStatus = includeRelayKeys ? 
                await this.getCustomerRelayKeysStatus(pubkey) : 
                { hasRelayKeys: false, relayPubkey: null };
            
            // Get Kind 10040 status
            const kind10040Status = await this.checkKind10040Status(pubkey, includeEvents);
            
            // Get Kind 30382 status
            const kind30382Status = await this.checkKind30382Status(pubkey, includeEvents);
            
            // Determine relay pubkey match for Kind 10040
            const kind10040RelayMatch = this.compareRelayPubkeys(
                relayKeysStatus.relayPubkey,
                kind10040Status.relayPubkey
            );
            
            // Determine relay pubkey match for Kind 30382
            const kind30382AuthorMatch = this.compareRelayPubkeys(
                relayKeysStatus.relayPubkey,
                kind30382Status.authorPubkey
            );
            
            // Calculate overall status
            const overall = this.calculateOverallNip85Status({
                hasRelayKeys: relayKeysStatus.hasRelayKeys,
                kind10040Exists: kind10040Status.exists,
                kind10040Matches: kind10040RelayMatch.matches,
                kind30382Count: kind30382Status.count,
                kind30382AuthorMatches: kind30382AuthorMatch.matches
            });
            
            return {
                success: true,
                customer: {
                    pubkey,
                    hasRelayKeys: relayKeysStatus.hasRelayKeys,
                    relayPubkey: relayKeysStatus.relayPubkey,
                    ...(includeRelayKeys && relayKeysStatus.relayKeys ? { relayKeys: relayKeysStatus.relayKeys } : {})
                },
                kind10040: {
                    exists: kind10040Status.exists,
                    relayPubkey: kind10040Status.relayPubkey,
                    matches: kind10040RelayMatch.matches,
                    matchDetails: kind10040RelayMatch,
                    timestamp: kind10040Status.timestamp,
                    eventId: kind10040Status.eventId,
                    ...(includeEvents && kind10040Status.event ? { event: kind10040Status.event } : {})
                },
                kind30382: {
                    count: kind30382Status.count,
                    latestTimestamp: kind30382Status.latestTimestamp,
                    authorPubkey: kind30382Status.authorPubkey,
                    authorMatches: kind30382AuthorMatch.matches,
                    authorMatchDetails: kind30382AuthorMatch,
                    ...(includeEvents && kind30382Status.latestEvent ? { latestEvent: kind30382Status.latestEvent } : {})
                },
                overall
            };
            
        } catch (error) {
            console.error('Error getting NIP-85 status:', error);
            return {
                success: false,
                error: error.message,
                customer: { pubkey, hasRelayKeys: false, relayPubkey: null },
                kind10040: { exists: false, matches: false },
                kind30382: { count: 0, authorMatches: false },
                overall: { isComplete: false, needsKind10040Update: true, summary: 'Error checking status' }
            };
        }
    }
    
    /**
     * Get customer relay keys status
     * @param {string} pubkey - Customer pubkey
     * @returns {Promise<Object>} Relay keys status
     */
    async getCustomerRelayKeysStatus(pubkey) {
        try {
            const { getCustomerRelayKeys } = require('./customerRelayKeys');
            const relayKeys = await getCustomerRelayKeys(pubkey);
            
            if (relayKeys && relayKeys.pubkey) {
                return {
                    hasRelayKeys: true,
                    relayPubkey: relayKeys.pubkey,
                    relayKeys: relayKeys
                };
            } else {
                return {
                    hasRelayKeys: false,
                    relayPubkey: null,
                    relayKeys: null
                };
            }
        } catch (error) {
            console.error('Error checking customer relay keys:', error);
            return {
                hasRelayKeys: false,
                relayPubkey: null,
                relayKeys: null,
                error: error.message
            };
        }
    }
    
    /**
     * Check Kind 10040 status for a customer
     * @param {string} pubkey - Customer pubkey
     * @param {boolean} includeEvent - Whether to include full event data
     * @returns {Promise<Object>} Kind 10040 status
     */
    async checkKind10040Status(pubkey, includeEvent = false) {
        try {
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);
            
            // Use strfry to check for Kind 10040 events
            const scanCmd = `sudo strfry scan '{"kinds":[10040], "authors":["${pubkey}"], "limit": 1}'`;
            const { stdout } = await execAsync(scanCmd);
            
            if (stdout.trim()) {
                const lines = stdout.trim().split('\n');
                const eventLine = lines[lines.length - 1]; // Get the last (most recent) event
                const event = JSON.parse(eventLine);
                
                // Extract relay pubkey from tags
                const relayPubkey = this.extractRelayPubkeyFromKind10040(event);
                
                return {
                    exists: true,
                    relayPubkey,
                    timestamp: event.created_at,
                    eventId: event.id,
                    ...(includeEvent ? { event } : {})
                };
            } else {
                return {
                    exists: false,
                    relayPubkey: null,
                    timestamp: null,
                    eventId: null,
                    event: null
                };
            }
        } catch (error) {
            console.error('Error checking Kind 10040 status:', error);
            return {
                exists: false,
                relayPubkey: null,
                timestamp: null,
                eventId: null,
                event: null,
                error: error.message
            };
        }
    }
    
    /**
     * Check Kind 30382 status for a customer
     * @param {string} pubkey - Customer pubkey (this is the customer's main pubkey, not relay pubkey)
     * @param {boolean} includeEvent - Whether to include full event data
     * @returns {Promise<Object>} Kind 30382 status
     */
    async checkKind30382Status(pubkey, includeEvent = false) {
        try {
            // First get the customer's relay pubkey to check for Kind 30382 events
            const relayKeysStatus = await this.getCustomerRelayKeysStatus(pubkey);
            
            if (!relayKeysStatus.hasRelayKeys) {
                return {
                    count: 0,
                    latestTimestamp: null,
                    authorPubkey: null,
                    latestEvent: null,
                    error: 'No customer relay keys found'
                };
            }
            
            const relayPubkey = relayKeysStatus.relayPubkey;
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);
            
            // Get count of Kind 30382 events authored by the relay
            const countCmd = `sudo strfry scan --count '{"kinds":[30382], "authors":["${relayPubkey}"]}'`;
            const { stdout: countOutput } = await execAsync(countCmd);
            const count = parseInt(countOutput.trim()) || 0;
            
            if (count > 0) {
                // Get the most recent Kind 30382 event
                const scanCmd = `sudo strfry scan '{"kinds":[30382], "authors":["${relayPubkey}"], "limit": 1}'`;
                const { stdout } = await execAsync(scanCmd);
                
                if (stdout.trim()) {
                    const lines = stdout.trim().split('\n');
                    const eventLine = lines[lines.length - 1];
                    const latestEvent = JSON.parse(eventLine);
                    
                    return {
                        count,
                        latestTimestamp: latestEvent.created_at,
                        authorPubkey: latestEvent.pubkey,
                        ...(includeEvent ? { latestEvent } : {})
                    };
                }
            }
            
            return {
                count,
                latestTimestamp: null,
                authorPubkey: null,
                latestEvent: null
            };
            
        } catch (error) {
            console.error('Error checking Kind 30382 status:', error);
            return {
                count: 0,
                latestTimestamp: null,
                authorPubkey: null,
                latestEvent: null,
                error: error.message
            };
        }
    }
    
    /**
     * Extract relay pubkey from Kind 10040 event tags
     * @param {Object} event - Kind 10040 event
     * @returns {string|null} Relay pubkey or null if not found
     */
    extractRelayPubkeyFromKind10040(event) {
        if (!event || !event.tags || !Array.isArray(event.tags)) {
            return null;
        }
        
        // Look for tag with "30382:rank" as first element
        const relayTag = event.tags.find(tag => 
            Array.isArray(tag) && 
            tag.length >= 2 && 
            tag[0] === '30382:rank'
        );
        
        return relayTag && relayTag[1] ? relayTag[1] : null;
    }
    
    /**
     * Compare two relay pubkeys and provide detailed match information
     * @param {string|null} customerRelayPubkey - Customer's relay pubkey
     * @param {string|null} eventRelayPubkey - Event's relay pubkey
     * @returns {Object} Comparison result
     */
    compareRelayPubkeys(customerRelayPubkey, eventRelayPubkey) {
        if (!customerRelayPubkey) {
            return {
                matches: false,
                reason: 'no_customer_relay_key',
                message: 'Customer has no relay keys'
            };
        }
        
        if (!eventRelayPubkey) {
            return {
                matches: false,
                reason: 'no_event_relay_key',
                message: 'Event has no relay pubkey'
            };
        }
        
        const matches = customerRelayPubkey === eventRelayPubkey;
        
        return {
            matches,
            reason: matches ? 'match' : 'mismatch',
            message: matches ? 'Relay pubkeys match' : 'Relay pubkeys do not match',
            customerRelayPubkey,
            eventRelayPubkey
        };
    }
    
    /**
     * Calculate overall NIP-85 status based on individual components
     * @param {Object} components - Individual status components
     * @returns {Object} Overall status assessment
     */
    calculateOverallNip85Status(components) {
        const {
            hasRelayKeys,
            kind10040Exists,
            kind10040Matches,
            kind30382Count,
            kind30382AuthorMatches
        } = components;
        
        // Determine if setup is complete
        const isComplete = hasRelayKeys && kind10040Exists && kind10040Matches;
        
        // Determine if Kind 10040 needs updating
        const needsKind10040Update = hasRelayKeys && kind10040Exists && !kind10040Matches;
        
        // Determine if Kind 10040 needs creation
        const needsKind10040Creation = hasRelayKeys && !kind10040Exists;
        
        // Determine summary message
        let summary;
        if (!hasRelayKeys) {
            summary = 'No relay keys found - setup required';
        } else if (needsKind10040Creation) {
            summary = 'Kind 10040 event needs to be created';
        } else if (needsKind10040Update) {
            summary = 'Kind 10040 event exists but needs updating';
        } else if (isComplete) {
            summary = 'Complete NIP-85 setup';
        } else {
            summary = 'Partial NIP-85 setup';
        }
        
        return {
            isComplete,
            needsKind10040Update,
            needsKind10040Creation,
            hasActiveKind30382: kind30382Count > 0,
            kind30382PublishingCorrectly: kind30382AuthorMatches,
            summary,
            components
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

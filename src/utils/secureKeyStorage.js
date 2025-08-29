const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const nostrTools = require('nostr-tools');

/**
 * Secure Key Storage System for Brainstorm
 * Provides multiple storage backends for relay keys without vendor lock-in
 */

class SecureKeyStorage {
    constructor(config = {}) {
        this.storageType = config.storageType || process.env.RELAY_KEY_STORAGE || 'encrypted-file';
        this.masterKey = config.masterKey || process.env.RELAY_KEY_MASTER_KEY;
        this.storagePath = config.storagePath || '/var/lib/brainstorm/secure-keys';
        
        // If no master key in environment, try to read from file
        if (!this.masterKey) {
            this.masterKey = this.loadMasterKeyFromFile();
        }
        
        if (!this.masterKey) {
            throw new Error('Master key required for secure key storage. Set RELAY_KEY_MASTER_KEY environment variable or ensure master key file exists.');
        }
        
        this.initializeStorage();
    }
    
    /**
     * Load master key from file system as fallback
     * Tries multiple common locations for master key files
     */
    loadMasterKeyFromFile() {
        const possiblePaths = [
            path.join(this.storagePath, '.master-key'),
            '/etc/brainstorm/relay-master.key',
            path.join(process.env.HOME || '/root', '.brainstorm/relay-master.key')
        ];
        
        for (const keyPath of possiblePaths) {
            try {
                if (fs.existsSync(keyPath)) {
                    const masterKey = fs.readFileSync(keyPath, 'utf8').trim();
                    if (masterKey && masterKey.length > 0) {
                        console.log(`Loaded master key from: ${keyPath}`);
                        return masterKey;
                    }
                }
            } catch (error) {
                // Continue to next path if this one fails
                continue;
            }
        }
        
        return null;
    }
    
    /**
     * Initialize storage backend
     */
    initializeStorage() {
        switch (this.storageType) {
            case 'encrypted-file':
                this.ensureStorageDirectory();
                break;
            case 'sqlite':
                this.initializeSQLite();
                break;
            case 'vault':
                this.initializeVault();
                break;
            default:
                throw new Error(`Unsupported storage type: ${this.storageType}`);
        }
    }
    
    /**
     * Encrypt sensitive data using AES-256-GCM
     */
    encrypt(data) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipher('aes-256-gcm', this.masterKey);
        
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const authTag = cipher.getAuthTag();
        
        return {
            encrypted,
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex')
        };
    }
    
    /**
     * Decrypt sensitive data
     */
    decrypt(encryptedData) {
        const decipher = crypto.createDecipher('aes-256-gcm', this.masterKey);
        decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
        
        let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }
    
    /**
     * Store relay keys securely
     */
    async storeRelayKeys(customerPubkey, keys) {
        // Normalize inputs and derive any missing fields from nsec/privkey
        if (!keys || typeof keys !== 'object') {
            throw new Error('keys object is required');
        }

        let privBytes = null;     // Uint8Array | Buffer
        let privHex = null;       // string (hex)
        let nsecStr = keys.nsec || null; // may be undefined/null
        let pubHex = keys.pubkey || null; // 64-char hex
        let npubStr = keys.npub || null;  // npub1...

        try {
            // Determine private key bytes from either nsec or privkey
            if (keys.privkey) {
                const pk = String(keys.privkey);
                if (pk.startsWith('nsec')) {
                    // Some callers may mistakenly pass nsec as privkey
                    const decoded = nostrTools.nip19.decode(pk);
                    privBytes = decoded.data;
                } else if (/^[0-9a-fA-F]{64}$/.test(pk)) {
                    privHex = pk.toLowerCase();
                    privBytes = Buffer.from(privHex, 'hex');
                }
            }

            if (!privBytes && nsecStr) {
                const n = String(nsecStr);
                if (n.startsWith('nsec')) {
                    const decoded = nostrTools.nip19.decode(n);
                    privBytes = decoded.data;
                } else if (/^[0-9a-fA-F]{64}$/.test(n)) {
                    privHex = n.toLowerCase();
                    privBytes = Buffer.from(privHex, 'hex');
                    // Ensure nsec string form too
                    nsecStr = nostrTools.nip19.nsecEncode(privBytes);
                }
            }

            // If we have private key bytes, ensure we fill all derived fields
            if (privBytes) {
                if (!privHex) privHex = Buffer.from(privBytes).toString('hex');
                if (!nsecStr) nsecStr = nostrTools.nip19.nsecEncode(privBytes);
                if (!pubHex) pubHex = nostrTools.getPublicKey(privBytes);
                if (!npubStr && pubHex) npubStr = nostrTools.nip19.npubEncode(pubHex);
            }

            // Final validation — at minimum we must have an nsec or privkey
            if (!nsecStr && !privHex) {
                throw new Error('Missing nsec/privkey. Provide at least one to store relay keys.');
            }
        } catch (e) {
            console.error(`Failed to normalize relay keys for ${customerPubkey}: ${e.message}`);
            throw e;
        }

        const keyData = {
            pubkey: pubHex || keys.pubkey || null,
            npub: npubStr || keys.npub || null,
            privkey: this.encrypt(privHex || String(keys.privkey || '')),
            nsec: this.encrypt(nsecStr || String(keys.nsec || '')),
            createdAt: new Date().toISOString()
        };
        
        switch (this.storageType) {
            case 'encrypted-file':
                return this.storeToEncryptedFile(customerPubkey, keyData);
            case 'sqlite':
                return this.storeToSQLite(customerPubkey, keyData);
            case 'vault':
                return this.storeToVault(customerPubkey, keyData);
            default:
                throw new Error(`Unsupported storage type: ${this.storageType}`);
        }
    }
    
    /**
     * Retrieve relay keys securely
     */
    async getRelayKeys(customerPubkey) {
        let keyData;
        
        switch (this.storageType) {
            case 'encrypted-file':
                keyData = this.getFromEncryptedFile(customerPubkey);
                break;
            case 'sqlite':
                keyData = this.getFromSQLite(customerPubkey);
                break;
            case 'vault':
                keyData = await this.getFromVault(customerPubkey);
                break;
            default:
                throw new Error(`Unsupported storage type: ${this.storageType}`);
        }
        
        if (!keyData) return null;
        
        // Decrypt sensitive fields
        return {
            pubkey: keyData.pubkey,
            npub: keyData.npub,
            privkey: this.decrypt(keyData.privkey),
            nsec: this.decrypt(keyData.nsec),
            createdAt: keyData.createdAt
        };
    }
    
    /**
     * Check if customer has stored keys
     */
    async hasRelayKeys(customerPubkey) {
        const keys = await this.getRelayKeys(customerPubkey);
        return keys !== null;
    }
    
    /**
     * Delete relay keys for a customer
     */
    async deleteRelayKeys(customerPubkey) {
        switch (this.storageType) {
            case 'encrypted-file':
                return this.deleteFromEncryptedFile(customerPubkey);
            case 'sqlite':
                return this.deleteFromSQLite(customerPubkey);
            case 'vault':
                return await this.deleteFromVault(customerPubkey);
            default:
                throw new Error(`Unsupported storage type: ${this.storageType}`);
        }
    }
    
    // ========== ENCRYPTED FILE STORAGE ==========
    
    ensureStorageDirectory() {
        if (!fs.existsSync(this.storagePath)) {
            fs.mkdirSync(this.storagePath, { recursive: true, mode: 0o750 });
        }
    }
    
    storeToEncryptedFile(customerPubkey, keyData) {
        const filePath = path.join(this.storagePath, `${customerPubkey}.json`);
        const encryptedContent = this.encrypt(JSON.stringify(keyData));
        
        fs.writeFileSync(filePath, JSON.stringify(encryptedContent), { mode: 0o640 });
        console.log(`Relay keys stored securely for customer: ${customerPubkey}`);
    }
    
    getFromEncryptedFile(customerPubkey) {
        const filePath = path.join(this.storagePath, `${customerPubkey}.json`);
        
        if (!fs.existsSync(filePath)) {
            return null;
        }
        
        try {
            const encryptedContent = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const decryptedContent = this.decrypt(encryptedContent);
            return JSON.parse(decryptedContent);
        } catch (error) {
            console.error(`Error reading encrypted keys for ${customerPubkey}:`, error.message);
            return null;
        }
    }
    
    deleteFromEncryptedFile(customerPubkey) {
        const filePath = path.join(this.storagePath, `${customerPubkey}.json`);
        
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`Deleted encrypted keys for customer: ${customerPubkey}`);
            return true;
        } else {
            console.log(`No encrypted keys found for customer: ${customerPubkey}`);
            return false;
        }
    }
    
    // ========== SQLITE STORAGE (Placeholder) ==========
    
    initializeSQLite() {
        // TODO: Implement SQLite with SQLCipher
        throw new Error('SQLite storage not yet implemented');
    }
    
    storeToSQLite(customerPubkey, keyData) {
        // TODO: Implement SQLite storage
        throw new Error('SQLite storage not yet implemented');
    }
    
    getFromSQLite(customerPubkey) {
        // TODO: Implement SQLite retrieval
        throw new Error('SQLite storage not yet implemented');
    }
    
    deleteFromSQLite(customerPubkey) {
        // TODO: Implement SQLite deletion
        throw new Error('SQLite storage not yet implemented');
    }
    
    // ========== VAULT STORAGE (Placeholder) ==========
    
    initializeVault() {
        // TODO: Implement Vault integration
        throw new Error('Vault storage not yet implemented');
    }
    
    async storeToVault(customerPubkey, keyData) {
        // TODO: Implement Vault storage
        throw new Error('Vault storage not yet implemented');
    }
    
    async getFromVault(customerPubkey) {
        // TODO: Implement Vault retrieval
        throw new Error('Vault storage not yet implemented');
    }
    
    async deleteFromVault(customerPubkey) {
        // TODO: Implement Vault deletion
        throw new Error('Vault storage not yet implemented');
    }
}

module.exports = { SecureKeyStorage };

#!/usr/bin/env node

/**
 * Brainstorm Configuration Utility
 * 
 * Provides cross-platform access to Brainstorm configuration variables
 * for both Node.js and bash environments.
 * 
 * This module reads /etc/brainstorm.conf and provides consistent
 * environment variable expansion for script paths in taskRegistry.json
 */

const fs = require('fs');
const path = require('path');

class BrainstormConfig {
    constructor() {
        this.configPath = '/etc/brainstorm.conf';
        this.variables = {};
        this.loadConfig();
    }

    /**
     * Load configuration from /etc/brainstorm.conf
     */
    loadConfig() {
        try {
            if (!fs.existsSync(this.configPath)) {
                console.warn(`[BrainstormConfig] Config file not found: ${this.configPath}`);
                this.loadFallbackConfig();
                return;
            }

            const configContent = fs.readFileSync(this.configPath, 'utf8');
            this.parseConfig(configContent);
        } catch (error) {
            console.warn(`[BrainstormConfig] Failed to load config: ${error.message}`);
            this.loadFallbackConfig();
        }
    }

    /**
     * Parse bash-style configuration file
     */
    parseConfig(content) {
        const lines = content.split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            // Skip comments and empty lines
            if (trimmed.startsWith('#') || trimmed === '') {
                continue;
            }
            
            // Parse variable assignments (VAR=value or VAR="value")
            const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
            if (match) {
                const [, varName, varValue] = match;
                
                // Remove quotes if present
                let cleanValue = varValue.replace(/^["']|["']$/g, '');
                
                // Expand variables in the value (e.g., ${BRAINSTORM_MODULE_BASE_DIR}src/)
                cleanValue = this.expandVariables(cleanValue);
                
                this.variables[varName] = cleanValue;
            }
        }
    }

    /**
     * Expand variables in a string (e.g., ${VAR} or $VAR)
     */
    expandVariables(value) {
        // Handle ${VAR} format
        value = value.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (match, varName) => {
            return this.variables[varName] || process.env[varName] || match;
        });
        
        // Handle $VAR format (but not at word boundaries to avoid conflicts)
        value = value.replace(/\$([A-Z_][A-Z0-9_]*)/g, (match, varName) => {
            return this.variables[varName] || process.env[varName] || match;
        });
        
        return value;
    }

    /**
     * Load fallback configuration for development/testing
     */
    loadFallbackConfig() {
        const baseDir = process.env.BRAINSTORM_MODULE_BASE_DIR || '/usr/local/lib/node_modules/brainstorm/';
        
        this.variables = {
            BRAINSTORM_MODULE_BASE_DIR: baseDir,
            BRAINSTORM_MODULE_SRC_DIR: path.join(baseDir, 'src/'),
            BRAINSTORM_MODULE_ALGOS_DIR: path.join(baseDir, 'src/algos'),
            BRAINSTORM_MODULE_MANAGE_DIR: path.join(baseDir, 'src/manage'),
            BRAINSTORM_MODULE_PIPELINE_DIR: path.join(baseDir, 'src/pipeline'),
            BRAINSTORM_LOG_DIR: '/var/log/brainstorm',
            BRAINSTORM_BASE_DIR: '/var/lib/brainstorm'
        };
    }

    /**
     * Get a configuration variable
     */
    get(varName) {
        return this.variables[varName] || process.env[varName];
    }

    /**
     * Get all configuration variables
     */
    getAll() {
        return { ...this.variables };
    }

    /**
     * Expand environment variables in a script path
     * This is the main method for expanding taskRegistry.json script paths
     */
    expandScriptPath(scriptPath) {
        if (!scriptPath) return scriptPath;
        
        let expanded = scriptPath;
        
        // Replace all known variables
        for (const [varName, varValue] of Object.entries(this.variables)) {
            const pattern = new RegExp(`\\$${varName}\\b|\\$\\{${varName}\\}`, 'g');
            expanded = expanded.replace(pattern, varValue);
        }
        
        return expanded;
    }

    /**
     * Static method to create singleton instance
     */
    static getInstance() {
        if (!BrainstormConfig.instance) {
            BrainstormConfig.instance = new BrainstormConfig();
        }
        return BrainstormConfig.instance;
    }
}

// Export singleton instance
module.exports = BrainstormConfig.getInstance();

// For CLI usage
if (require.main === module) {
    const config = BrainstormConfig.getInstance();
    
    if (process.argv[2] === 'expand' && process.argv[3]) {
        // CLI usage: node brainstormConfig.js expand "$BRAINSTORM_MODULE_SRC_DIR/manage/syncWoT.sh"
        console.log(config.expandScriptPath(process.argv[3]));
    } else if (process.argv[2] === 'get' && process.argv[3]) {
        // CLI usage: node brainstormConfig.js get BRAINSTORM_MODULE_SRC_DIR
        console.log(config.get(process.argv[3]));
    } else if (process.argv[2] === 'list') {
        // CLI usage: node brainstormConfig.js list
        console.log(JSON.stringify(config.getAll(), null, 2));
    } else {
        console.log('Usage:');
        console.log('  node brainstormConfig.js expand "$BRAINSTORM_MODULE_SRC_DIR/path/to/script.sh"');
        console.log('  node brainstormConfig.js get VARIABLE_NAME');
        console.log('  node brainstormConfig.js list');
    }
}

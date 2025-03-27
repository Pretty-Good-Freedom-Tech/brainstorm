/**
 * Hasenpfeffr Client-Side Configuration
 * 
 * This module loads configuration from the server and provides
 * a consistent way to access configuration values in client-side code.
 */

// Initialize configuration object
const HasenpfeffrConfig = {
    // Default configuration (will be overridden by server config)
    baseUrl: './',
    relay: {
        url: null,
        pubkey: null
    },
    version: '1.0.0',
    
    // Initialization state
    _initialized: false,
    _initializing: false,
    _initPromise: null,
    _initCallbacks: [],
    
    /**
     * Initialize configuration by loading from server
     * @returns {Promise} Promise that resolves when configuration is loaded
     */
    init: function() {
        // If already initialized, return resolved promise
        if (this._initialized) {
            return Promise.resolve(this);
        }
        
        // If initialization is in progress, return the existing promise
        if (this._initializing && this._initPromise) {
            return this._initPromise;
        }
        
        // Start initialization
        this._initializing = true;
        
        // Determine the base URL for API calls
        const baseApiUrl = window.location.pathname.includes('/control/') ? '/control' : '';
        
        // Create promise for initialization
        this._initPromise = fetch(`${baseApiUrl}/api/config`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load configuration: ${response.status} ${response.statusText}`);
                }
                return response.json();
            })
            .then(config => {
                // Update configuration with server values
                Object.assign(this, config);
                
                // Mark as initialized
                this._initialized = true;
                this._initializing = false;
                
                // Call any registered callbacks
                this._initCallbacks.forEach(callback => callback(this));
                
                return this;
            })
            .catch(error => {
                console.error('Error loading configuration:', error);
                
                // Mark as not initializing anymore, but not initialized
                this._initializing = false;
                
                // Throw the error to be caught by caller
                throw error;
            });
        
        return this._initPromise;
    },
    
    /**
     * Register a callback to be called when configuration is initialized
     * @param {Function} callback Function to call when configuration is initialized
     */
    onInit: function(callback) {
        if (typeof callback !== 'function') {
            console.error('onInit requires a function callback');
            return;
        }
        
        // If already initialized, call callback immediately
        if (this._initialized) {
            callback(this);
            return;
        }
        
        // Otherwise, add to callbacks list
        this._initCallbacks.push(callback);
        
        // Start initialization if not already started
        if (!this._initializing) {
            this.init();
        }
    },
    
    /**
     * Get a configuration value
     * @param {string} key Configuration key (dot notation supported)
     * @param {*} defaultValue Default value if key not found
     * @returns {*} Configuration value or default value
     */
    get: function(key, defaultValue = null) {
        // If not initialized, warn and return default
        if (!this._initialized) {
            console.warn('Configuration not initialized. Call HasenpfeffrConfig.init() first.');
            return defaultValue;
        }
        
        // Split key by dots for nested properties
        const parts = key.split('.');
        
        // Start with the root object
        let value = this;
        
        // Traverse the object
        for (const part of parts) {
            if (value === undefined || value === null || !Object.prototype.hasOwnProperty.call(value, part)) {
                return defaultValue;
            }
            value = value[part];
        }
        
        return value;
    },
    
    /**
     * Get the base URL for assets
     * @returns {string} Base URL for assets
     */
    getBaseUrl: function() {
        return this.baseUrl || './';
    },
    
    /**
     * Get the full URL for an asset
     * @param {string} path Asset path
     * @returns {string} Full URL for the asset
     */
    getAssetUrl: function(path) {
        const baseUrl = this.getBaseUrl();
        
        // Ensure path doesn't start with a slash if baseUrl ends with one
        if (baseUrl.endsWith('/') && path.startsWith('/')) {
            path = path.substring(1);
        }
        
        return baseUrl + path;
    }
};

// Auto-initialize when the script is loaded
HasenpfeffrConfig.init().catch(error => {
    console.warn('Failed to auto-initialize configuration:', error);
});

/**
 * Hasenpfeffr Header Component JavaScript
 * This script handles the authentication status and relay link functionality
 * for the Hasenpfeffr header component.
 */

// Load the configuration script if it's not already loaded
function loadConfigScript() {
    return new Promise((resolve, reject) => {
        if (window.HasenpfeffrConfig) {
            resolve(window.HasenpfeffrConfig);
            return;
        }

        const script = document.createElement('script');
        script.src = './js/config.js';
        script.onload = () => {
            if (window.HasenpfeffrConfig) {
                resolve(window.HasenpfeffrConfig);
            } else {
                reject(new Error('Config script loaded but HasenpfeffrConfig not found'));
            }
        };
        script.onerror = () => {
            reject(new Error('Failed to load config script'));
        };
        document.head.appendChild(script);
    });
}

function initializeHeader() {
    const userInfo = document.getElementById('userInfo');
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    const signInLink = document.getElementById('signInLink');
    const relayLink = document.getElementById('relayLink');

    // Determine the base URL for API calls
    const baseApiUrl = window.location.pathname.includes('/control/') ? '/control' : '';

    // Check authentication status
    fetch(`${baseApiUrl}/api/auth/status`)
        .then(response => response.json())
        .catch(() => fetch(`${baseApiUrl}/api/auth/status`).then(response => response.json()))
        .then(data => {
            if (data && data.authenticated) {
                // User is authenticated
                userInfo.style.display = 'flex';
                signInLink.style.display = 'none';
                
                // Set user avatar with first letter of pubkey
                if (data.pubkey) {
                    userAvatar.textContent = data.pubkey.substring(0, 1).toUpperCase();
                    userName.textContent = `${data.pubkey.substring(0, 8)}...`;
                }
            } else {
                // User is not authenticated
                userInfo.style.display = 'none';
                signInLink.style.display = 'inline-block';
            }
        })
        .catch(error => {
            console.error('Error checking authentication status:', error);
        });

    // Set up the relay link with the correct domain if it exists
    if (relayLink) {
        // Try to load config first
        loadConfigScript()
            .then(config => {
                // Use relay URL from config if available
                if (config.relay && config.relay.url) {
                    relayLink.href = config.relay.url;
                    return;
                }
                
                // Fall back to API call if config doesn't have relay URL
                return fetch(`${baseApiUrl}/api/status`)
                    .then(response => response.json())
                    .then(data => {
                        if (data && data.strfryDomain) {
                            // Set the relay link to the /strfry/ path
                            let domain = data.strfryDomain;
                            if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
                                domain = 'https://' + domain;
                            }
                            relayLink.href = `${domain}/strfry/`;
                        }
                    });
            })
            .catch(error => {
                // Fall back to API call if config loading fails
                console.warn('Failed to load config, falling back to API:', error);
                fetch(`${baseApiUrl}/api/status`)
                    .then(response => response.json())
                    .then(data => {
                        if (data && data.strfryDomain) {
                            // Set the relay link to the /strfry/ path
                            let domain = data.strfryDomain;
                            if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
                                domain = 'https://' + domain;
                            }
                            relayLink.href = `${domain}/strfry/`;
                        }
                    })
                    .catch(err => {
                        console.error('Error setting relay link:', err);
                    });
            });
    }
}

// Initialize the header when the DOM is loaded
document.addEventListener('DOMContentLoaded', initializeHeader);

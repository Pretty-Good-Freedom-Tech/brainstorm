/**
 * Hasenpfeffr Header Component JavaScript
 * This script handles the authentication status and relay link functionality
 * for the Hasenpfeffr header component.
 */

function initializeHeader() {
    const userInfo = document.getElementById('userInfo');
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    const signInLink = document.getElementById('signInLink');
    const relayLink = document.getElementById('relayLink');

    // Check authentication status
    fetch('/control/api/auth/status')
        .then(response => response.json())
        .catch(() => fetch('/control/api/auth/status').then(response => response.json()))
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
        fetch('/control/api/status')
            .then(response => response.json())
            .catch(() => fetch('/control/api/status').then(response => response.json()))
            .then(data => {
                if (data && data.strfryDomain) {
                    // Set the relay link to the /strfry/ path
                    let domain = data.strfryDomain;
                    if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
                        domain = 'https://' + domain;
                    }
                    relayLink.href = `${domain}/strfry/`;
                    console.log('Set relay link to:', `${domain}/strfry/`);
                }
            })
            .catch(error => {
                console.error('Error fetching STRFRY_DOMAIN:', error);
            });
    }
}

// Initialize the header when the DOM is loaded
document.addEventListener('DOMContentLoaded', initializeHeader);

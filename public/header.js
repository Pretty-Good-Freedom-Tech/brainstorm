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
                
                // Set default user avatar with first letter of pubkey
                if (data.pubkey) {
                    userAvatar.textContent = data.pubkey.substring(0, 1).toUpperCase();
                    userName.textContent = `${data.pubkey.substring(0, 8)}...`;
                    
                    // Fetch user profile information from kind 0 event
                    fetchUserProfile(data.pubkey);
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

/**
 * Fetch user profile information from kind 0 event
 * @param {string} pubkey - User's public key
 */
function fetchUserProfile(pubkey) {
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    
    // Fetch user profile from kind 0 event
    fetch(`/api/get-kind0?pubkey=${encodeURIComponent(pubkey)}`)
        .catch(() => fetch(`/control/api/get-kind0?pubkey=${encodeURIComponent(pubkey)}`))
        .then(response => response.json())
        .then(result => {
            if (result.success && result.data) {
                try {
                    // Parse the kind 0 event content
                    const event = result.data;
                    const content = JSON.parse(event.content);
                    
                    // Update user name if available
                    if (content.name || content.display_name) {
                        userName.textContent = content.display_name || content.name;
                        userName.title = pubkey; // Set the full pubkey as title for hover
                    }
                    
                    // Update user avatar if picture is available
                    if (content.picture) {
                        // Clear the text content
                        userAvatar.textContent = '';
                        
                        // Create an image element
                        const img = document.createElement('img');
                        img.src = content.picture;
                        img.alt = content.name || pubkey.substring(0, 8);
                        img.style.width = '100%';
                        img.style.height = '100%';
                        img.style.borderRadius = '50%';
                        img.style.objectFit = 'cover';
                        
                        // Handle image loading errors
                        img.onerror = () => {
                            // Revert to first letter of name or pubkey
                            userAvatar.textContent = (content.name ? content.name.substring(0, 1) : pubkey.substring(0, 1)).toUpperCase();
                        };
                        
                        // Add the image to the avatar container
                        userAvatar.appendChild(img);
                    } else if (content.name) {
                        // If no picture but name is available, use first letter of name
                        userAvatar.textContent = content.name.substring(0, 1).toUpperCase();
                    }
                    
                    // Add tooltip with additional information if available
                    let tooltipContent = pubkey;
                    if (content.about) {
                        tooltipContent = `${content.about}\n\n${pubkey}`;
                    }
                    userAvatar.title = tooltipContent;
                    
                } catch (error) {
                    console.error('Error parsing profile data:', error);
                }
            }
        })
        .catch(error => {
            console.error('Error fetching user profile:', error);
        });
}

// Initialize the header when the DOM is loaded
document.addEventListener('DOMContentLoaded', initializeHeader);

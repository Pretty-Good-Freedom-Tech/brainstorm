/**
 * Hasenpfeffr Header Component JavaScript
 * This script handles the authentication status and relay link functionality
 * for the Hasenpfeffr header component.
 */

// Flag to track if constraints have been checked already
let constraintsChecked = false;

/**
 * Check if Neo4j constraints and indexes are set up, and trigger setup if not
 */

function checkNeo4jConstraints() {
    // Prevent multiple checks
    if (constraintsChecked) {
        console.log('Neo4j constraints check already performed, skipping...');
        return;
    }
    
    console.log('Checking Neo4j constraints and indexes status...');
    constraintsChecked = true;
    
    // First check if constraints have been created
    fetch('/control/api/status/neo4j-constraints')
        .then(response => response.json())
        .then(data => {
            console.log('Neo4j constraints status:', data);
            
            if (data && data.constraintsTimestamp === 0) {
                console.log('Neo4j constraints and indexes have not been set up, initiating setup...');
                
                if (confirm('Neo4j constraints and indexes have not been set up. Would you like to set them up now?\n\n NOTE: Make sure you have setup the neo4j password at the neo4j browser!! Otherwise the setup will fail. Do this at http://yourCoolSite.com:7474 and log in with neo4j / neo4j.')) {
                    // Trigger setup if user confirms
                    setupNeo4jConstraints();
                }
            } else {
                console.log('Neo4j constraints and indexes are already set up.');
            }
        })
        .catch(error => {
            console.error('Error checking Neo4j constraints status:', error);
        });
}

/**
 * Set up Neo4j constraints and indexes
 */

function setupNeo4jConstraints() {
    console.log('Setting up Neo4j constraints and indexes...');
    
    fetch('/control/api/neo4j-setup-constraints-and-indexes', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
    })
    .then(response => response.json())
    .then(data => {
        console.log('Neo4j constraints setup response:', data);
        if (data.success) {
            alert('Neo4j constraints and indexes have been set up successfully!');
        } else {
            alert('Error setting up Neo4j constraints and indexes: ' + (data.error || 'Unknown error'));
        }
    })
    .catch(error => {
        console.error('Error setting up Neo4j constraints:', error);
        alert('Error setting up Neo4j constraints and indexes: ' + error.message);
    });
}

function initializeHeader() {
    const userInfo = document.getElementById('userInfo');
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    const signInLink = document.getElementById('signInLink');
    const relayLink = document.getElementById('relayLink');

    // Check Neo4j constraints and indexes
    checkNeo4jConstraints();

    // Check authentication status
    fetch('/control/api/auth/status')
        .then(response => response.json())
        .then(data => {
            if (data && data.authenticated) {
                // User is authenticated
                if (userInfo) { userInfo.style.display = 'flex' }
                if (signInLink) { signInLink.style.display = 'none' }
                
                // Set default user avatar with first letter of pubkey
                if (data.pubkey) {
                    if (userAvatar) { userAvatar.textContent = data.pubkey.substring(0, 1).toUpperCase() }
                    if (userName) { userName.textContent = `${data.pubkey.substring(0, 8)}...` }
                    
                    // Fetch user profile information from kind 0 event
                    fetchUserProfile(data.pubkey);
                }
            } else {
                // User is not authenticated
                if (userInfo) { userInfo.style.display = 'none' }
                if (signInLink) { signInLink.style.display = 'inline-block' }
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
    
    // Highlight the current page in the navbar
    highlightCurrentPage();
}

/**
 * Highlights the current page in the navigation bar
 */
function highlightCurrentPage() {
    // Get all navigation buttons
    const navButtons = document.querySelectorAll('.nav-btn');
    if (!navButtons || navButtons.length === 0) return;
    
    // Get the current page path
    const currentPath = window.location.pathname;
    console.log('Current path:', currentPath);
    
    // Clear any existing highlights first
    navButtons.forEach(button => {
        button.classList.remove('active-page');
    });
    
    // Flag to track if any button was highlighted
    let buttonHighlighted = false;
    
    // Check each button to see if its href matches the current path
    navButtons.forEach(button => {
        // Get the path from the button's href
        const buttonPath = new URL(button.href).pathname;
        console.log('Button path:', buttonPath, 'for button:', button.textContent);
        
        // Special case for home page
        if (buttonPath === '/control/' || buttonPath === '/control/index.html') {
            if (currentPath === '/control/' || currentPath === '/control/index.html') {
                button.classList.add('active-page');
                buttonHighlighted = true;
            }
        } 
        // Special case for Strfry Relay (root path)
        else if (buttonPath === '/') {
            if (currentPath === '/' || currentPath === '/index.html') {
                button.classList.add('active-page');
                buttonHighlighted = true;
            }
        }
        // For other pages, check for exact match or matching filename
        else if (currentPath === buttonPath || 
                (currentPath.split('/').pop() === buttonPath.split('/').pop() && 
                 buttonPath !== '/' && buttonPath !== '/control/')) {
            button.classList.add('active-page');
            buttonHighlighted = true;
        }
    });
    
    // If no button was highlighted and we're on a subpage, highlight the parent section
    if (!buttonHighlighted) {
        // Extract the first part of the path after /control/
        const pathParts = currentPath.split('/');
        if (pathParts.length >= 3 && pathParts[1] === 'control') {
            // Get the base name without extension and split by hyphen
            const pageName = pathParts[2].split('.')[0];
            const mainSection = pageName.split('-')[0];
            
            console.log('Looking for section match for:', mainSection);
            
            // Try to find a button that contains this section
            navButtons.forEach(button => {
                const buttonText = button.textContent.toLowerCase();
                const buttonPath = new URL(button.href).pathname;
                const buttonPageName = buttonPath.split('/').pop().split('.')[0];
                
                // Skip the home and root buttons for this matching
                if (buttonPath === '/control/' || buttonPath === '/control/index.html' || buttonPath === '/') {
                    return;
                }
                
                // Check if button text or button filename contains the section name
                if (buttonText.includes(mainSection.toLowerCase()) || 
                    buttonPageName.includes(mainSection.toLowerCase())) {
                    console.log('Found section match:', buttonText);
                    button.classList.add('active-page');
                }
            });
        }
    }
}

/**
 * Fetch user profile information from kind 0 event
 * @param {string} pubkey - User's public key
 */
function fetchUserProfile(pubkey) {
    // Get DOM elements again in case they've changed
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    
    // Ensure elements exist before proceeding
    if (!userAvatar || !userName) {
        console.error('User avatar or name elements not found');
        return;
    }
    
    // Fetch user profile from kind 0 event
    fetch(`/control/api/get-kind0?pubkey=${encodeURIComponent(pubkey)}`)
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

// Wait for DOM to be fully loaded before initializing
document.addEventListener('DOMContentLoaded', function() {
    // Small delay to ensure all elements are properly loaded
    setTimeout(initializeHeader, 50);
});

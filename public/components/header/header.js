/**
 * Brainstorm Header Bundle
 * This script combines both the header component functionality and the auto-loading feature.
 * Simply include this single script in your page, and everything will be handled automatically.
 * 
 * Usage: <script src="/control/components/header/header-bundle.js"></script>
 */

/**
 * Load the appropriate navbar based on the current page
 * nav1.html is the default for specific pages and nav2.html for everything else
 * UPDATE August 2025:
 * nav_visitor: someone who is not signed in
 * nav_guest: signed in, but not customer or owner
 * nav_customer: signed in & is customer
 * nav_owner: signed in & is owner
 */
function loadNavbar(classification) {
    const navbarContainer = document.getElementById('navbar-container');
    if (!navbarContainer) {
        console.error('Navbar container not found');
        return;
    }
    
    // Get the current page path
    const currentPath = window.location.pathname;
    console.log('Loading navbar for path:', currentPath);
    
    // Choose which navbar to load - nav1.html for index and about, nav2.html for everything else
    let navbarPath = '/components/header/navbars/nav2.html';

    switch (classification) {
        case 'unauthenticated':
            navbarPath = '/components/header/navbars/nav_unauthenticated.html';
            break;
        case 'guest':
            navbarPath = '/components/header/navbars/nav_guest.html';
            break;
        case 'customer':
            navbarPath = '/components/header/navbars/nav_customer.html';
            break;
        case 'owner':
            navbarPath = '/components/header/navbars/nav_owner.html';
            break;
        default:
            navbarPath = '/components/header/navbars/nav_basic_content.html';
            break;
    }

    if (
        currentPath === ''
        || currentPath === '/'
        || currentPath === '/index.html'
        || currentPath === '/control'
        || currentPath === '/control/'
        || currentPath === '/control/index.html'
        || currentPath === '/sign-up.html'
    ) {
        navbarPath = '/components/header/navbars/nav_basic_content.html';
    }

    if (
        currentPath === '/profile-search.html'
        || currentPath === '/profiles.html'
        || currentPath === '/nip56.html'
    ) {
        navbarPath = '/components/header/navbars/nav_basic_content.html';
    }  

    if (currentPath === '/about.html' || currentPath === '/about-trusted-assertions.html') {
        navbarPath = '/components/header/navbars/nav_info.html';
    }
    /*
    if (
        currentPath === '/home.html' 
        || currentPath === '/nip85.html' 
        || currentPath === '/manage-customers.html' 
        || currentPath === '/manage-customer.html'
        || currentPath === '/task-explorer.html' 
        || currentPath === '/task.html'
        || currentPath === '/nip87.html' 
        || currentPath === '/nip56.html' 
        || currentPath === '/profiles.html' 
        || currentPath === '/about.html'
        || currentPath === '/subscribe.html'
        || currentPath === '/profile.html'
        || currentPath === '/grapevine-analysis.html'
        || currentPath === '/test.html'
        || currentPath === '/search.html'
        || currentPath === '/npub-or-pubkey-search.html'
        || currentPath === '/follow-recs.html'
        || currentPath === '/neo4j-performance-metrics.html'
        || currentPath === '/service-management-dashboard.html'
        || currentPath === '/task-watchdog-dashboard.html'
        || currentPath === '/task-behavior-analytics-dashboard.html'
        || currentPath === '/neo4j-error-logs.html'
        || currentPath === '/neo4j-resource-config.html'
        || currentPath === '/add-new-customer.html'
        || currentPath === '/control/home.html' 
        || currentPath === '/control/nip85.html' 
        || currentPath === '/control/nip87.html' 
        || currentPath === '/control/nip56.html' 
        || currentPath === '/control/profiles.html' 
        || currentPath === '/control/about.html'
        || currentPath === '/control/subscribe.html'
        || currentPath === '/control/profile.html'
        || currentPath === '/control/test.html'
        || currentPath === '/control/search.html'
        || currentPath === '/control/follow-recs.html'
    ) {
        navbarPath = '/components/header/navbars/nav1.html';
    }

    if (
        currentPath === ''
        || currentPath === '/'
        || currentPath === '/index.html'
        || currentPath === '/control'
        || currentPath === '/control/'
        || currentPath === '/control/index.html'
        || currentPath === '/sign-up.html'
    ) {
        navbarPath = '/components/header/navbars/nav_sparse.html';
    }  

    if (
        currentPath === '/test.html'
    ) {
        navbarPath = '/components/header/navbars/nav3.html';
    }


    if (
        currentPath === '/personalized-recommendations.html'
    ) {
        navbarPath = '/components/header/navbars/personalized-recommendations.html';
    }

    if (
        currentPath === '/customer.html'
        || currentPath === '/customers.html'
        || currentPath === '/my-account.html'
        || currentPath === '/create-customer-relays.html'
    ) {
        navbarPath = '/components/header/navbars/nav_customer.html';
    }
    */
  
    // First fetch the Neo4j Browser URL
    fetch('/api/status')
        .then(response => response.json())
        .catch(() => fetch('/api/status').then(response => response.json()))
        .then(data => {
            let neo4jBrowserUrl = data && data.neo4jBrowserUrl ? data.neo4jBrowserUrl : 'http://localhost:7474';
            console.log('Neo4j Browser URL:', neo4jBrowserUrl);
            
            // Now fetch the navbar with the Neo4j Browser URL
            return fetch(navbarPath)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`Failed to load navbar: ${response.status} ${response.statusText}`);
                    }
                    return response.text();
                })
                .then(html => {
                    // Replace placeholder with actual Neo4j Browser URL
                    html = html.replace('${BRAINSTORM_NEO4J_BROWSER_URL}', neo4jBrowserUrl);
                    
                    // Insert the navbar HTML into the container
                    navbarContainer.innerHTML = html;
                    
                    // After loading the navbar, highlight the current page
                    setTimeout(highlightCurrentPage, 0);
                    
                    // Initialize the hamburger menu
                    initializeHamburgerMenu();
                });
        })
        .catch(error => {
            console.error('Error loading navbar:', error);
            // Fallback to default nav2.html if there's an error
            if (navbarPath !== '/control/components/header/navbars/nav2.html') {
                console.log('Attempting to load default navbar instead...');
                fetch('/control/components/header/navbars/nav2.html')
                    .then(response => response.text())
                    .then(html => {
                        navbarContainer.innerHTML = html;
                        setTimeout(highlightCurrentPage, 0);
                    })
                    .catch(fallbackError => {
                        console.error('Error loading default navbar:', fallbackError);
                    });
            }
        });
}

/**
 * Add user classification indicator to the header
 */
function addUserClassificationIndicator(classification, customerName) {
    // Remove any existing classification indicator
    const existingIndicator = document.getElementById('userClassification');
    if (existingIndicator) {
        existingIndicator.remove();
    }

    const userInfo = document.getElementById('userInfo');
    if (!userInfo) return;

    // Create classification indicator element
    const indicator = document.createElement('span');
    indicator.id = 'userClassification';
    indicator.style.cssText = `
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 10px;
        margin-left: 8px;
        font-weight: bold;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    `;

    // Set indicator text and styling based on classification
    switch (classification) {
        case 'owner':
            indicator.textContent = 'OWNER';
            indicator.style.backgroundColor = '#4CAF50';
            indicator.style.color = 'white';
            indicator.title = 'You are the Brainstorm instance owner';
            break;
        case 'customer':
            // indicator.textContent = customerName ? 'CUSTOMER: ' + customerName.toUpperCase() : 'CUSTOMER';
            indicator.textContent = 'CUSTOMER';
            indicator.style.backgroundColor = '#2196F3';
            indicator.style.color = 'white';
            indicator.title = `You are a Brainstorm customer: ${customerName || 'Unknown'}`;
            break;
        case 'guest':
            indicator.textContent = 'GUEST';
            indicator.style.backgroundColor = '#9E9E9E';
            indicator.style.color = 'white';
            indicator.title = 'You are a guest';
            break;
        case 'unauthenticated':
            break;
        default:
            return; // Don't add indicator for unknown classifications
    }

    // Insert the indicator after the user name
    const userName = document.getElementById('userName');
    if (userName && userName.nextSibling) {
        userInfo.insertBefore(indicator, userName.nextSibling);
    } else {
        userInfo.appendChild(indicator);
    }
}

/**
 * Initialize the header component once it's loaded
 */
function initializeHeader() {
    const userInfo = document.getElementById('userInfo');
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    const signInLink = document.getElementById('signInLink');
    const relayLink = document.getElementById('relayLink');
    const logoutLink = document.getElementById('logoutLink');

    // Check authentication status and user classification
    fetch('/api/auth/user-classification')
        .then(response => response.json())
        .then(data => {
            if (data && data.success && data.classification) {
                // Load the appropriate navbar
                loadNavbar(data.classification);
            } else {
                // Load the default navbar
                loadNavbar('unauthenticated');
            }
            if (data && data.success && data.classification !== 'unauthenticated') {
                // User is authenticated
                if (userInfo) { userInfo.style.display = 'flex' }
                if (signInLink) { signInLink.style.display = 'none' }
                if (logoutLink) { logoutLink.style.display = 'inline-block' }
                
                // Set default user avatar with first letter of pubkey
                if (data.pubkey) {
                    if (userAvatar) { userAvatar.textContent = data.pubkey.substring(0, 1).toUpperCase() }
                    if (userName) { userName.textContent = `${data.pubkey.substring(0, 8)}...` }
                    
                    // Add user classification indicator
                    addUserClassificationIndicator(data.classification, data.customerName);
                    
                    // Fetch user profile information from kind 0 event
                    fetchUserProfile(data.pubkey);
                }
            } else {
                // User is not authenticated
                if (userInfo) { userInfo.style.display = 'none' }
                if (signInLink) { signInLink.style.display = 'inline-block' }
                if (logoutLink) { logoutLink.style.display = 'none' }
            }
        })
        .catch(error => {
            console.error('Error checking user classification:', error);
            // Fallback to basic auth check
            fetch('/api/auth/status')
                .then(response => response.json())
                .then(data => {
                    if (data && data.authenticated) {
                        if (userInfo) { userInfo.style.display = 'flex' }
                        if (signInLink) { signInLink.style.display = 'none' }
                        if (logoutLink) { logoutLink.style.display = 'inline-block' }
                        
                        if (data.pubkey) {
                            if (userAvatar) { userAvatar.textContent = data.pubkey.substring(0, 1).toUpperCase() }
                            if (userName) { userName.textContent = `${data.pubkey.substring(0, 8)}...` }
                            fetchUserProfile(data.pubkey);
                        }
                    } else {
                        if (userInfo) { userInfo.style.display = 'none' }
                        if (signInLink) { signInLink.style.display = 'inline-block' }
                        if (logoutLink) { logoutLink.style.display = 'none' }
                    }
                })
                .catch(fallbackError => {
                    console.error('Error with fallback auth check:', fallbackError);
                });
        });

    // Set up the relay link with the correct domain if it exists
    if (relayLink) {
        fetch('/api/status')
            .then(response => response.json())
            .catch(() => fetch('/api/status').then(response => response.json()))
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

    // Set up the logout link
    if (logoutLink) {
        logoutLink.addEventListener('click', logout);
    }
}

/**
 * Handle user logout 
 * This function sends a request to the server to clear the user's session,
 * then redirects to the landing page
 */
function logout() {
    fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Logout failed');
        }
        return response.json();
    })
    .then(data => {
        console.log('Logout successful:', data);
        // Redirect to landing page after successful logout
        window.location.href = '/index.html';
    })
    .catch(error => {
        console.error('Error during logout:', error);
        // Even if there's an error, redirect to the landing page
        window.location.href = '/index.html';
    });
}

/**
 * Highlight the current page in the navigation bar
 */
function highlightCurrentPage() {
    // Get the current path
    const currentPath = window.location.pathname;
    console.log('Highlighting current page for path:', currentPath);
    
    // All navbar items - the "components-header-*" classes are dynamically added
    // We need to find all anchor tags in the navbar
    const navItems = document.querySelectorAll('.navbar a');
    
    // Map of path prefixes to highlight for specific pages
    const pathMappings = {
        '/overview.html': '/overview',
        '/index.html': '/index',
        '/nip85.html': '/nip85',
        '/nip56.html': '/nip56',
        '/nip85-control-panel.html': '/nip85',
        '/nip87.html': '/nip87',
        '/about.html': '/about',
        '/about-trusted-assertions.html': '/about-trusted-assertions',
        '/reconciliation.html': '/reconciliation',
        '/profiles.html': '/profiles',
        '/profile.html': '/profile',
        '/graperank-control-panel.html': '/graperank',
        '/network-visualization.html': '/network-visualization',
        '/neo4j-control-panel.html': '/neo4j-control-panel',
        '/personalized-recommendations.html': '/personalized-recommendations',
        '/subscribe.html': '/subscribe',
        '/search.html': '/search',
        '/npub-or-pubkey-search.html': '/npub-or-pubkey-search',
        '/follow-recs.html': '/follow-recs',
        '/customer.html': '/customer',
        '/customers.html': '/customers',
        '/my-account.html': '/my-account',
        '/manage-customer.html': '/manage-customer',
        '/manage-customers.html': '/manage-customers',
        '/create-customer-relays.html': '/create-customer-relays',
        '/task-dashboard.html': '/task-dashboard',
        '/task-explorer.html': '/task-explorer',
        '/task.html': '/task',
        '/neo4j-performance-metrics.html': '/neo4j-performance-metrics',
        '/service-management-dashboard.html': '/service-management-dashboard',
        '/task-watchdog-dashboard.html': '/task-watchdog-dashboard',
        '/task-behavior-analytics-dashboard.html': '/task-behavior-analytics-dashboard',
        '/neo4j-error-logs.html': '/neo4j-error-logs',
        '/neo4j-resource-config.html': '/neo4j-resource-config',
        '/neo4j-control-panel.html': '/neo4j-control-panel',
        '/add-new-customer.html': '/add-new-customer',
        '/customer-import-export.html': '/customer-import-export',

        '/control/overview.html': '/control/overview',
        '/control/index.html': '/control/index',
        '/control/nip85.html': '/control/nip85',
        '/control/nip56.html': '/control/nip56',
        '/control/nip85-control-panel.html': '/control/nip85',
        '/control/nip87.html': '/control/nip87',
        '/control/about.html': '/control/about',
        '/control/reconciliation.html': '/control/reconciliation',
        '/control/profiles.html': '/control/profiles',
        '/control/profile.html': '/control/profile',
        '/control/graperank-control-panel.html': '/control/graperank',
        '/control/network-visualization.html': '/control/network-visualization',
        '/control/neo4j-control-panel.html': '/control/neo4j-control-panel',
        '/control/personalized-recommendations.html': '/control/personalized-recommendations',
        '/control/subscribe.html': '/control/subscribe',
        '/control/search.html': '/control/search',
        '/control/follow-recs.html': '/control/follow-recs'
    };
    
    // Get the matching prefix for the current path
    let matchingPrefix = null;
    for (const [path, prefix] of Object.entries(pathMappings)) {
        // if (currentPath === path || currentPath.startsWith(prefix)) {
        if (currentPath === path || currentPath === prefix + '.html') {
            matchingPrefix = prefix;
            break;
        }
    }
    
    if (!matchingPrefix) {
        // Try to extract a base prefix for other pages
        const parts = currentPath.split('/');
        if (parts.length >= 3) {
            const lastPart = parts[parts.length - 1];
            matchingPrefix = lastPart.split('.')[0]; // Remove file extension
        }
    }
    
    if (matchingPrefix) {
        console.log('Matching prefix for highlighting:', matchingPrefix + '.html');
        
        // Check each navbar item and highlight if it matches
        navItems.forEach(item => {
            if (item.href.includes(matchingPrefix + '.html')) {
                item.classList.add('active-page');
                console.log('Highlighted item:', item.textContent.trim());
            } else {
                item.classList.remove('active-page');
            }
        });
    }
}

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
    fetch(`/api/get-kind0?pubkey=${encodeURIComponent(pubkey)}`)
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

/**
 * Initialize the hamburger menu
 */
function initializeHamburgerMenu() {
    console.log(`Initializing hamburger menu`);
    const btn = document.getElementById('hamburgerBtn');
    const menu = document.getElementById('hamburgerMenu');
    if (!btn || !menu) return;
    console.log(`Hamburger button and menu found`);
    btn.addEventListener('click', function(e) {
        e.stopPropagation();
        menu.classList.toggle('open');
    });
    // Close menu when clicking outside
    document.addEventListener('click', function(e) {
        if (!menu.contains(e.target) && e.target !== btn) {
            menu.classList.remove('open');
        }
    });
}

/**
 * Load the header component HTML
 */
function loadHeaderComponent() {
    const headerContainer = document.getElementById('headerContainer');
    
    if (!headerContainer) {
        console.error('Header container element with ID "headerContainer" not found!');
        return;
    }
    
    // Load the header component HTML
    fetch('/control/components/header/header.html')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to load header component (${response.status} ${response.statusText})`);
            }
            return response.text();
        })
        .then(html => {
            // Insert the header HTML
            headerContainer.innerHTML = html;
            
            // Initialize the header
            initializeHeader();
        })
        .catch(error => {
            console.error('Error loading header component:', error);
            headerContainer.innerHTML = `
                <div class="header-error">
                    <strong>Error loading header</strong><br>
                    ${error.message}
                </div>
            `;
        });
}

// Auto-load the header component when the document is ready
document.addEventListener('DOMContentLoaded', loadHeaderComponent);

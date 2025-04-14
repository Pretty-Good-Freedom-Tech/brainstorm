/**
 * Hasenpfeffr Header Loader
 * This script automatically loads and initializes the header component.
 * Simply include this script in your page, and it will handle everything.
 * 
 * Usage: <script src="/components/header/header-loader.js"></script>
 */

document.addEventListener('DOMContentLoaded', function() {
    // Look for headerContainer element
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
            if (typeof initializeHeader === 'function') {
                initializeHeader();
            } else {
                console.error('initializeHeader function not found. Make sure header.js is included before this script.');
            }
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
});

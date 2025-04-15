/**
 * Footer component loader
 * Loads the footer HTML into a container element with ID 'footerContainer'
 */
document.addEventListener('DOMContentLoaded', function() {
    // Find the footer container
    const footerContainer = document.getElementById('footerContainer');
    if (!footerContainer) {
        console.error('Footer container not found in the document');
        return;
    }

    // Load the footer component
    fetch('/components/footer/footer.html')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to load footer component: ${response.status}`);
            }
            return response.text();
        })
        .then(html => {
            footerContainer.innerHTML = html;
        })
        .catch(error => {
            console.error('Error loading footer component:', error);
            footerContainer.innerHTML = '<div class="footer"><div class="footer-content"><div class="footer-item">Built with love by <a href="https://njump.me/npub1u5njm6g5h5cpw4wy8xugu62e5s7f6fnysv0sj0z3a8rengt2zqhsxrldq3" target="_blank">@straycat</a></div></div></div>';
        });
});

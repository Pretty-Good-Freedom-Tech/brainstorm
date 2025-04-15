#!/bin/bash
# Brainstorm nginx reconfiguration script
# This script configures nginx to serve the custom Brainstorm landing page
# while maintaining WebSocket support for Nostr clients

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Reconfiguring nginx for Brainstorm...${NC}"

# Get domain name from environment or config
DOMAIN_NAME=$(grep -oP 'STRFRY_DOMAIN="\K[^"]+' /etc/hasenpfeffr.conf || echo "")
if [ -z "$DOMAIN_NAME" ]; then
    echo -e "${YELLOW}Domain name not found in config, using hostname...${NC}"
    DOMAIN_NAME=$(hostname -f)
fi

# Check if nginx is installed
if ! command -v nginx &> /dev/null; then
    echo -e "${RED}Error: nginx is not installed${NC}"
    exit 1
fi

# Create directory for landing page
echo "Creating directory for landing page..."
LANDING_DIR="/usr/local/lib/brainstorm-landing"
mkdir -p "$LANDING_DIR"

# Copy landing page files from the control panel
echo "Copying landing page files..."
cp -r /usr/local/lib/node_modules/hasenpfeffr/public/pages/landing-page.html "$LANDING_DIR/index.html"
cp -r /usr/local/lib/node_modules/hasenpfeffr/public/css/landing-page.css "$LANDING_DIR/"
cp -r /usr/local/lib/node_modules/hasenpfeffr/public/css/common.css "$LANDING_DIR/"
cp -r /usr/local/lib/node_modules/hasenpfeffr/public/img "$LANDING_DIR/"

# Create a modified landing page that loads assets from the correct location
echo "Adapting landing page for root URL..."
# Update paths in the HTML file
sed -i 's|/control/css/landing-page.css|/landing-page.css|g' "$LANDING_DIR/index.html"
sed -i 's|./components/header/header.js|/header.js|g' "$LANDING_DIR/index.html"
sed -i 's|/control/img/|/img/|g' "$LANDING_DIR/index.html"
sed -i 's|/control/api/|/api/|g' "$LANDING_DIR/index.html"

# Create the header.js file with minimal functionality
cat > "$LANDING_DIR/header.js" << 'EOL'
/**
 * Minimal header.js for landing page
 * This provides essential functionality without loading the full header
 */
document.addEventListener('DOMContentLoaded', function() {
    // Empty function to prevent errors if other scripts try to call it
    window.initializeHeader = function() {};
});
EOL

# Create nginx maps configuration file
echo "Creating nginx websocket mapping configuration..."
cat > /etc/nginx/conf.d/websocket-maps.conf << EOL
# WebSocket connection handling
map \$http_upgrade \$connection_upgrade {
    default upgrade;
    ''      close;
}

# Select backend based on the Upgrade header
map \$http_upgrade \$backend {
    default        127.0.0.1:7778;  # HTTP requests (control panel server)
    websocket      127.0.0.1:7777;  # WebSocket requests (strfry)
}
EOL

# Create location blocks for the landing page assets
cat > /etc/nginx/conf.d/brainstorm-landing.conf << EOL
# Locations for Brainstorm landing page assets
location = /landing-page.css {
    alias $LANDING_DIR/landing-page.css;
    add_header Cache-Control "public, max-age=3600";
}

location = /common.css {
    alias $LANDING_DIR/common.css;
    add_header Cache-Control "public, max-age=3600";
}

location = /header.js {
    alias $LANDING_DIR/header.js;
    add_header Cache-Control "public, max-age=3600";
}

location /img/ {
    alias $LANDING_DIR/img/;
    add_header Cache-Control "public, max-age=3600";
}
EOL

# Update the main nginx site configuration
echo "Updating nginx site configuration..."
cat > /etc/nginx/sites-available/default << EOL
server {
    server_name $DOMAIN_NAME;
    
    # Hasenpfeffr Control Panel
    location /control/ {
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header Host \$host;
        proxy_pass http://127.0.0.1:7778/;
        proxy_http_version 1.1;
        include /etc/nginx/mime.types;
    }
    
    # Forward API requests to control panel
    location /api/ {
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header Host \$host;
        proxy_pass http://127.0.0.1:7778/api/;
        proxy_http_version 1.1;
    }
    
    # Exact match for root path - serve custom landing page
    location = / {
        root $LANDING_DIR;
        try_files /index.html =404;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        add_header Expires "0";
    }
    
    # Include asset locations defined in brainstorm-landing.conf
    include /etc/nginx/conf.d/brainstorm-landing.conf;
    
    # All other paths including WebSocket connections go to the appropriate backend
    location / {
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header Host \$host;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_http_version 1.1;
        
        # Use the backend selected by the map directive
        proxy_pass http://\$backend;
    }

    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/$DOMAIN_NAME/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN_NAME/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

server {
    if (\$host = $DOMAIN_NAME) {
        return 301 https://\$host\$request_uri;
    }
    
    server_name $DOMAIN_NAME;
    listen 80;
    return 404;
}
EOL

# Set appropriate permissions
echo "Setting permissions..."
chmod -R 755 "$LANDING_DIR"
chown -R www-data:www-data "$LANDING_DIR"

# Test and reload nginx configuration
echo "Testing nginx configuration..."
nginx -t

if [ $? -eq 0 ]; then
    echo "Reloading nginx..."
    systemctl reload nginx
    echo -e "${GREEN}Nginx reconfiguration complete!${NC}"
    echo -e "Your custom Brainstorm landing page is now available at https://$DOMAIN_NAME"
else
    echo -e "${RED}Error: Nginx configuration test failed. Please check the errors above.${NC}"
    exit 1
fi

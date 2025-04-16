#!/bin/bash

# Setup Nginx for Brainstorm with the new URL structure
# This script configures nginx to serve Brainstorm at the root URL
# and the strfry relay at /strfry/

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root"
  exit 1
fi

# Check if nginx is installed
if ! command -v nginx &> /dev/null; then
  echo "Nginx not found. Installing..."
  apt-get update
  apt-get install -y nginx
fi

# Get the domain name from brainstorm.conf
if [ -f /etc/brainstorm.conf ]; then
  DOMAIN=$(grep STRFRY_DOMAIN /etc/brainstorm.conf | cut -d '=' -f2 | tr -d '"' | tr -d ' ')
else
  # Ask for domain if not found
  echo "Enter your domain name (e.g., example.com):"
  read DOMAIN
fi

# Create nginx configuration
cat > /etc/nginx/sites-available/brainstorm << EOF
server {
    server_name ${DOMAIN};

    # Brainstorm Control Panel as main application
    location /control/ {
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header Host \$host;
        proxy_pass http://127.0.0.1:7778/;
        proxy_http_version 1.1;

        # Add this to ensure proper MIME types for all static files
        include /etc/nginx/mime.types;
    }

    location / {
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header Host \$host;
        proxy_pass http://127.0.0.1:7778/;
        proxy_http_version 1.1;

        # Add this to ensure proper MIME types for all static files
        include /etc/nginx/mime.types;
    }

    # Strfry relay at /strfry path
    location /relay {
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header Host \$host;
        proxy_pass http://127.0.0.1:7777/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    listen 80;
}
EOF

# Enable the site
ln -sf /etc/nginx/sites-available/brainstorm /etc/nginx/sites-enabled/

# Remove default if it exists
if [ -f /etc/nginx/sites-enabled/default ]; then
  rm /etc/nginx/sites-enabled/default
fi

# Test nginx configuration
nginx -t

# Reload nginx if test is successful
if [ $? -eq 0 ]; then
  systemctl reload nginx
  echo "Nginx configuration updated successfully."
  
  # Offer to set up SSL with Certbot
  echo "Would you like to set up SSL with Certbot? (y/n)"
  read SETUP_SSL
  
  if [ "$SETUP_SSL" = "y" ] || [ "$SETUP_SSL" = "Y" ]; then
    if ! command -v certbot &> /dev/null; then
      echo "Certbot not found. Installing..."
      apt-get update
      apt-get install -y certbot python3-certbot-nginx
    fi
    
    certbot --nginx -d ${DOMAIN}
    
    if [ $? -eq 0 ]; then
      echo "SSL certificate installed successfully."
    else
      echo "Failed to install SSL certificate. You can try again later with:"
      echo "sudo certbot --nginx -d ${DOMAIN}"
    fi
  else
    echo "You can set up SSL later with:"
    echo "sudo certbot --nginx -d ${DOMAIN}"
  fi
else
  echo "Nginx configuration test failed. Please check the configuration."
fi

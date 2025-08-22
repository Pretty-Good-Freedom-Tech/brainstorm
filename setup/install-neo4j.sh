#!/bin/bash

# Brainstorm Neo4j Installation Script
# This script automates the installation and configuration of Neo4j and associated tools
# for the Brainstorm project.

# TODO:
# 1. if already installed, sudo systemctl restart neo4j but do not reinstall
# 2. store neo4j password more securely - use same method as for customer relay nsec

set -e  # Exit on error

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (use sudo)"
  exit 1
fi

echo "=== Brainstorm Neo4j Installation ==="
echo "This script will install and configure Neo4j, Graph Data Science, and APOC plugins"
echo "Required for Brainstorm to function properly"
echo ""

# Configuration variables
# changed aug 2025
NEO4J_VERSION="1:5.26.10" # changed from 5.26.3 to 5.26.10
GDS_VERSION="2.13.4" # changed from 2.13.2 to 2.13.4
APOC_VERSION="5.26.10" # changed from 5.26.2 to 5.26.10
BRAINSTORM_CONF="/etc/brainstorm.conf"
NEO4J_CONF="/etc/neo4j/neo4j.conf"
NEO4J_BACKUP="/etc/neo4j/neo4j.conf.backup"
APOC_CONF="/etc/neo4j/apoc.conf"

# Step 1: Install Neo4j Community Edition
echo "=== Installing Neo4j Community Edition ==="
apt update && apt install -y wget
wget -O - https://debian.neo4j.com/neotechnology.gpg.key | apt-key add -
echo 'deb https://debian.neo4j.com stable 5' | tee /etc/apt/sources.list.d/neo4j.list
apt update
echo "Available Neo4j versions:"
apt list -a neo4j
echo "Installing Neo4j version $NEO4J_VERSION..."
apt-get install -y neo4j=$NEO4J_VERSION

# Step 2: Configure Neo4j
echo "=== Configuring Neo4j ==="
if [ -f "$NEO4J_CONF" ]; then
  cp "$NEO4J_CONF" "$NEO4J_BACKUP"
  echo "Backed up Neo4j configuration to $NEO4J_BACKUP"
fi

# Step 3: Install Neo4j Graph Data Science
echo "=== Installing Neo4j Graph Data Science ==="
cd /var/lib/neo4j/plugins/
wget https://github.com/neo4j/graph-data-science/releases/download/$GDS_VERSION/neo4j-graph-data-science-$GDS_VERSION.jar
chown neo4j:neo4j /var/lib/neo4j/plugins/neo4j-graph-data-science-$GDS_VERSION.jar

# Step 4: Install Neo4j APOC
echo "=== Installing Neo4j APOC ==="
cd /var/lib/neo4j/plugins
wget https://github.com/neo4j/apoc/releases/download/$APOC_VERSION/apoc-$APOC_VERSION-core.jar
chown neo4j:neo4j /var/lib/neo4j/plugins/apoc-$APOC_VERSION-core.jar
chmod 755 /var/lib/neo4j/plugins/apoc-$APOC_VERSION-core.jar

# Create APOC configuration
cat > "$APOC_CONF" << EOF
apoc.import.file.enabled=true
apoc.import.file.use_neo4j_config=true
EOF

update_neo4j_conf() {
  echo "" >> "$NEO4J_CONF"
  echo "# Brainstorm Neo4j Configuration Additions" >> "$NEO4J_CONF"
  echo "" >> "$NEO4J_CONF"

  # Update Neo4j listen addresses
  sed -i 's/#server.default_listen_address=0.0.0.0/server.default_listen_address=0.0.0.0/' "$NEO4J_CONF"
  sed -i 's/#server.bolt.listen_address=:7687/server.bolt.listen_address=0.0.0.0:7687/' "$NEO4J_CONF"
  sed -i 's/#server.http.listen_address=:7474/server.http.listen_address=0.0.0.0:7474/' "$NEO4J_CONF"

  echo "# GDS procedures unrestricted access" >> "$NEO4J_CONF"
  echo "dbms.security.procedures.unrestricted=gds.*" >> "$NEO4J_CONF"
  echo "" >> "$NEO4J_CONF"

  # Update Neo4j configuration for GDS - robust approach
  # Remove any existing unrestricted lines to avoid duplicates
  sed -i '/^dbms.security.procedures.unrestricted=/d' "$NEO4J_CONF"
  sed -i '/^#dbms.security.procedures.unrestricted=/d' "$NEO4J_CONF"

  # Update Neo4j configuration for APOC and GDS - robust approach
  # Remove any existing allowlist lines to avoid duplicates
  sed -i '/^dbms.security.procedures.allowlist=/d' "$NEO4J_CONF"
  sed -i '/^#dbms.security.procedures.allowlist=/d' "$NEO4J_CONF"

  echo "" >> "$NEO4J_CONF"
  echo "# APOC and GDS procedures allowlist" >> "$NEO4J_CONF"
  echo "dbms.security.procedures.allowlist=apoc.coll.*,apoc.load.*,apoc.periodic.*,apoc.export.json.query,gds.*" >> "$NEO4J_CONF"
  echo "" >> "$NEO4J_CONF"

  # Step 5: Update memory settings
  # Jun 2025: removing defining heap size and transaction total
  #Aug 2025: reinstating memory setting changes based on:
  # 1. sudo neo4j-admin server memory-recommendation
  # 2. also informed by Brainstorm neo4j-resource-config.html
  echo "=== Updating Neo4j memory settings ==="

  # sed -i 's/#server.memory.heap.initial_size=512m/server.memory.heap.initial_size=5g/' "$NEO4J_CONF"
  # sed -i 's/#server.memory.heap.max_size=512m/server.memory.heap.max_size=5g/' "$NEO4J_CONF"
  # sed -i 's/#server.memory.pagecache.size=10g/server.memory.pagecache.size=8g/' "$NEO4J_CONF"
  # JVM hardening options
  # sed -i 's/# server.jvm.additional=-XX:+ExitOnOutOfMemoryError/server.jvm.additional=-XX:+ExitOnOutOfMemoryError/' "$NEO4J_CONF"
  # Memory and JVM configuration - robust approach
  # Remove any existing memory/JVM lines to avoid duplicates
  sed -i '/^server.memory.heap.initial_size=/d' "$NEO4J_CONF"
  sed -i '/^server.memory.heap.max_size=/d' "$NEO4J_CONF"
  sed -i '/^server.memory.pagecache.size=/d' "$NEO4J_CONF"
  # Commenting out this line because it removes all existing JVM options, including the ones we want to keep
  # sed -i '/^server.jvm.additional=/d' "$NEO4J_CONF"

  echo "" >> "$NEO4J_CONF"
  echo "# Memory configuration for 32GB server" >> "$NEO4J_CONF"
  echo "server.memory.heap.initial_size=11700m" >> "$NEO4J_CONF"
  echo "server.memory.heap.max_size=11700m" >> "$NEO4J_CONF"
  echo "server.memory.pagecache.size=12000m" >> "$NEO4J_CONF"
  echo "" >> "$NEO4J_CONF"
  echo "# JVM configuration with G1GC tuning" >> "$NEO4J_CONF"
  echo "server.jvm.additional=-XX:+UseG1GC" >> "$NEO4J_CONF"
  echo "server.jvm.additional=-XX:+ExitOnOutOfMemoryError" >> "$NEO4J_CONF"
  echo "server.jvm.additional=-XX:+HeapDumpOnOutOfMemoryError" >> "$NEO4J_CONF"
  echo "server.jvm.additional=-XX:HeapDumpPath=/var/log/neo4j/" >> "$NEO4J_CONF"
  echo "server.jvm.additional=-XX:G1HeapRegionSize=16m" >> "$NEO4J_CONF"
  echo "server.jvm.additional=-XX:G1NewSizePercent=20" >> "$NEO4J_CONF"
  echo "server.jvm.additional=-XX:G1MaxNewSizePercent=40" >> "$NEO4J_CONF"
  echo "" >> "$NEO4J_CONF"
  # enable gc logging
  echo "server.logs.gc.enabled=true" >> "$NEO4J_CONF"
  echo "server.logs.gc.log_path=/var/log/neo4j/gc.log" >> "$NEO4J_CONF"
  # enable native memory tracking for debugging
  echo "# enable native memory tracking for debugging" >> "$NEO4J_CONF"
  echo "server.jvm.additional=-XX:NativeMemoryTracking=detail" >> "$NEO4J_CONF"
  echo "server.jvm.additional=-XX:+UnlockDiagnosticVMOptions" >> "$NEO4J_CONF"
  echo "server.jvm.additional=-XX:+PrintNMTStatistics" >> "$NEO4J_CONF"
  echo "" >> "$NEO4J_CONF"

  # sed -i 's/#dbms.memory.transaction.total.max=0/dbms.memory.transaction.total.max=1G/' "$NEO4J_CONF"
  # echo "=== Updating Neo4j tx log rotation settings ==="
  # sed -i 's/db.tx_log.rotation.retention_policy=2 days 2G/db.tx_log.rotation.retention_policy=1 hours 100M/' "$NEO4J_CONF"
  # sed -i 's/db.tx_log.rotation.retention_policy=2 days 2G/#db.tx_log.rotation.retention_policy=2 days 2G/' "$NEO4J_CONF"
}

# Update Neo4j configuration if not done previously
if ! grep -q "Brainstorm Neo4j Configuration Additions" "$NEO4J_CONF"; then
  update_neo4j_conf
fi

# Step 6: Start Neo4j service
echo "=== Starting Neo4j service ==="
systemctl restart neo4j
systemctl enable neo4j
# Use systemctl is-active instead of status to avoid hanging
echo "Checking Neo4j service status..."
if systemctl is-active --quiet neo4j; then
  echo "Neo4j service is running"
else
  echo "Neo4j service failed to start"
  exit 1
fi

# set initial password as neo4jneo4j
sudo neo4j-admin dbms set-initial-password neo4jneo4j

# Clean up
rm -f "$CYPHER_FILE"

echo ""
echo "=== Neo4j Installation Complete ==="
echo "Neo4j is now installed and configured for Brainstorm"
echo "You can access the Neo4j Browser at http://your-server-ip:7474"
echo "Default username: neo4j"
echo "Default password: neo4j (you will be prompted to change this on first login)"
echo ""
echo "IMPORTANT: After changing the Neo4j password, update it in your Brainstorm configuration:"
echo "Edit $BRAINSTORM_CONF and update the NEO4J_PASSWORD value"
echo ""
echo "To verify the installation, access the Neo4j Browser and run:"
echo "RETURN gds.version() - to verify Graph Data Science"
echo "WITH 'https://raw.githubusercontent.com/neo4j-contrib/neo4j-apoc-procedures/4.0/src/test/resources/person.json' AS url"
echo "CALL apoc.load.json(url) YIELD value as person"
echo "MERGE (p:Person {name:person.name})"
echo "ON CREATE SET p.age = person.age, p.children = size(person.children) - to verify APOC"


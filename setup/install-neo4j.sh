#!/bin/bash

# Hasenpfeffr Neo4j Installation Script
# This script automates the installation and configuration of Neo4j and associated tools
# for the Hasenpfeffr project.

set -e  # Exit on error

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (use sudo)"
  exit 1
fi

echo "=== Hasenpfeffr Neo4j Installation ==="
echo "This script will install and configure Neo4j, Graph Data Science, and APOC plugins"
echo "Required for Hasenpfeffr to function properly"
echo ""

# Configuration variables
NEO4J_VERSION="1:5.26.3"
GDS_VERSION="2.13.2"
APOC_VERSION="5.26.2"
HASENPFEFFR_CONF="/etc/hasenpfeffr.conf"
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

# Update Neo4j configuration
sed -i 's/#server.default_listen_address=0.0.0.0/server.default_listen_address=0.0.0.0/' "$NEO4J_CONF"
sed -i 's/#server.bolt.listen_address=:7687/server.bolt.listen_address=0.0.0.0:7687/' "$NEO4J_CONF"
sed -i 's/#server.http.listen_address=:7474/server.http.listen_address=0.0.0.0:7474/' "$NEO4J_CONF"

# Step 3: Install Neo4j Graph Data Science
echo "=== Installing Neo4j Graph Data Science ==="
cd /var/lib/neo4j/plugins/
wget https://github.com/neo4j/graph-data-science/releases/download/$GDS_VERSION/neo4j-graph-data-science-$GDS_VERSION.jar
chown neo4j:neo4j /var/lib/neo4j/plugins/neo4j-graph-data-science-$GDS_VERSION.jar

# Update Neo4j configuration for GDS
sed -i 's/#dbms.security.procedures.unrestricted=my.extensions.example,my.procedures.*/dbms.security.procedures.unrestricted=gds.*/' "$NEO4J_CONF"

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

# Update Neo4j configuration for APOC
sed -i 's/#dbms.security.procedures.allowlist=apoc.coll.*,apoc.load.*,apoc.export.*,gds.*/dbms.security.procedures.allowlist=apoc.coll.*,apoc.load.*,apoc.periodic.*,apoc.export.json.query,gds.*/' "$NEO4J_CONF"

# Step 5: Update memory settings
echo "=== Updating Neo4j memory settings ==="
sed -i 's/#server.memory.heap.initial_size=512m/server.memory.heap.initial_size=2g/' "$NEO4J_CONF"
sed -i 's/#server.memory.heap.max_size=512m/server.memory.heap.max_size=2g/' "$NEO4J_CONF"
sed -i 's/#dbms.memory.transaction.total.max=0/dbms.memory.transaction.total.max=1G/' "$NEO4J_CONF"

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

# Step 7: Set up Neo4j constraints and indices
echo "=== Setting up Neo4j constraints and indices ==="
# Wait for Neo4j to fully start
sleep 10

# Create a Cypher file for constraints and indices
CYPHER_FILE="/tmp/neo4j_constraints.cypher"
cat > "$CYPHER_FILE" << EOF
CREATE CONSTRAINT IF NOT EXISTS FOR (u:NostrUser) REQUIRE u.pubkey IS UNIQUE;
CREATE CONSTRAINT IF NOT EXISTS FOR (e:NostrEvent) REQUIRE e.id IS UNIQUE;
CREATE INDEX IF NOT EXISTS FOR (e:NostrEvent) ON (e.pubkey);
CREATE INDEX IF NOT EXISTS FOR (e:NostrEvent) ON (e.kind);
EOF

# Use cypher-shell to execute the commands
echo "Running Neo4j constraints and indices setup..."
if command -v cypher-shell &> /dev/null; then
  # Try with default password first
  if cypher-shell -u neo4j -p neo4j --file "$CYPHER_FILE" 2>/dev/null; then
    echo "Neo4j constraints and indices set up successfully."
  else
    echo "Could not set up Neo4j constraints and indices with default password."
    echo "You will need to run the following commands manually after setting up your password:"
    cat "$CYPHER_FILE"
  fi
else
  echo "cypher-shell not found. You will need to run the following commands manually:"
  cat "$CYPHER_FILE"
  echo "You can run these commands in the Neo4j Browser at http://your-server-ip:7474"
fi

# Clean up
rm -f "$CYPHER_FILE"

echo ""
echo "=== Neo4j Installation Complete ==="
echo "Neo4j is now installed and configured for Hasenpfeffr"
echo "You can access the Neo4j Browser at http://your-server-ip:7474"
echo "Default username: neo4j"
echo "Default password: neo4j (you will be prompted to change this on first login)"
echo ""
echo "IMPORTANT: After changing the Neo4j password, update it in your Hasenpfeffr configuration:"
echo "Edit $HASENPFEFFR_CONF and update the NEO4J_PASSWORD value"
echo ""
echo "To verify the installation, access the Neo4j Browser and run:"
echo "RETURN gds.version() - to verify Graph Data Science"
echo "WITH 'https://raw.githubusercontent.com/neo4j-contrib/neo4j-apoc-procedures/4.0/src/test/resources/person.json' AS url"
echo "CALL apoc.load.json(url) YIELD value as person"
echo "MERGE (p:Person {name:person.name})"
echo "ON CREATE SET p.age = person.age, p.children = size(person.children) - to verify APOC"

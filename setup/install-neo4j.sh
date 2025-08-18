#!/bin/bash

# Brainstorm Neo4j Installation Script
# This script automates the installation and configuration of Neo4j and associated tools
# for the Brainstorm project.

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
NEO4J_VERSION="1:5.26.3"
GDS_VERSION="2.13.2"
APOC_VERSION="5.26.2"
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
# Jun 2025: removing defining heap size and transaction total
#Aug 2025: reinstating memory setting changes based on:
# 1. sudo neo4j-admin server memory-recommendation
# 2. also informed by Brainstorm neo4j-resource-config.html
echo "=== Updating Neo4j memory settings (commented out) ==="

sed -i 's/#server.memory.heap.initial_size=512m/server.memory.heap.initial_size=5g/' "$NEO4J_CONF"
sed -i 's/#server.memory.heap.max_size=512m/server.memory.heap.max_size=5g/' "$NEO4J_CONF"
sed -i 's/#server.memory.pagecache.size=10g/server.memory.pagecache.size=8g/' "$NEO4J_CONF"
# JVM hardening options
# sed -i 's/# server.jvm.additional=-XX:+ExitOnOutOfMemoryError/server.jvm.additional=-XX:+ExitOnOutOfMemoryError/' "$NEO4J_CONF"
# More aggressive JVM hardening options
sed -i 's/# server.jvm.additional=-XX:+ExitOnOutOfMemoryError/server.jvm.additional=-XX:+ExitOnOutOfMemoryError -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=\/var\/log\/neo4j\//' "$NEO4J_CONF"



# sed -i 's/#dbms.memory.transaction.total.max=0/dbms.memory.transaction.total.max=1G/' "$NEO4J_CONF"
echo "=== Updating Neo4j tx log rotation settings ==="
# sed -i 's/db.tx_log.rotation.retention_policy=2 days 2G/db.tx_log.rotation.retention_policy=1 hours 100M/' "$NEO4J_CONF"
# sed -i 's/db.tx_log.rotation.retention_policy=2 days 2G/#db.tx_log.rotation.retention_policy=2 days 2G/' "$NEO4J_CONF"

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

# Step 7: Set up Neo4j constraints and indexes
echo "=== Setting up Neo4j constraints and indexes ==="
# Wait for Neo4j to fully start
sleep 10

# Create a Cypher file for constraints and indexes
CYPHER_FILE="/tmp/neo4j_constraints.cypher"
cat > "$CYPHER_FILE" << EOF
CREATE CONSTRAINT nostrUser_pubkey IF NOT EXISTS FOR (n:NostrUser) REQUIRE n.pubkey IS UNIQUE;
CREATE INDEX nostrUser_npub IF NOT EXISTS FOR (n:NostrUser) ON (n.npub);
CREATE INDEX nostrUser_pubkey IF NOT EXISTS FOR (n:NostrUser) ON (n.pubkey);
CREATE INDEX nostrUser_kind3EventId IF NOT EXISTS FOR (n:NostrUser) ON (n.kind3EventId);
CREATE INDEX nostrUser_kind3CreatedAt IF NOT EXISTS FOR (n:NostrUser) ON (n.kind3CreatedAt);
CREATE INDEX nostrUser_kind1984EventId IF NOT EXISTS FOR (n:NostrUser) ON (n.kind1984EventId);
CREATE INDEX nostrUser_kind1984CreatedAt IF NOT EXISTS FOR (n:NostrUser) ON (n.kind1984CreatedAt);
CREATE INDEX nostrUser_kind10000EventId IF NOT EXISTS FOR (n:NostrUser) ON (n.kind10000EventId);
CREATE INDEX nostrUser_kind10000CreatedAt IF NOT EXISTS FOR (n:NostrUser) ON (n.kind10000CreatedAt);

CREATE INDEX nostrUser_hops IF NOT EXISTS FOR (n:NostrUser) ON (n.hops);
CREATE INDEX nostrUser_personalizedPageRank IF NOT EXISTS FOR (n:NostrUser) ON (n.personalizedPageRank);

CREATE INDEX nostrUser_influence IF NOT EXISTS FOR (n:NostrUser) ON (n.influence);
CREATE INDEX nostrUser_average IF NOT EXISTS FOR (n:NostrUser) ON (n.average);
CREATE INDEX nostrUser_confidence IF NOT EXISTS FOR (n:NostrUser) ON (n.confidence);
CREATE INDEX nostrUser_input IF NOT EXISTS FOR (n:NostrUser) ON (n.input);

CREATE INDEX nostrUser_followingCount IF NOT EXISTS FOR (n:NostrUser) ON (n.followingCount);
CREATE INDEX nostrUser_followerCount IF NOT EXISTS FOR (n:NostrUser) ON (n.followerCount);
CREATE INDEX nostrUser_mutingCount IF NOT EXISTS FOR (n:NostrUser) ON (n.mutingCount);
CREATE INDEX nostrUser_muterCount IF NOT EXISTS FOR (n:NostrUser) ON (n.muterCount);
CREATE INDEX nostrUser_reportingCount IF NOT EXISTS FOR (n:NostrUser) ON (n.reportingCount);
CREATE INDEX nostrUser_reporterCount IF NOT EXISTS FOR (n:NostrUser) ON (n.reporterCount);

CREATE INDEX nostrUser_verifiedFollowerCount IF NOT EXISTS FOR (n:NostrUser) ON (n.verifiedFollowerCount);
CREATE INDEX nostrUser_verifiedMuterCount IF NOT EXISTS FOR (n:NostrUser) ON (n.verifiedMuterCount);
CREATE INDEX nostrUser_verifiedReporterCount IF NOT EXISTS FOR (n:NostrUser) ON (n.verifiedReporterCount);

CREATE INDEX nostrUser_followerInput IF NOT EXISTS FOR (n:NostrUser) ON (n.followerInput);
CREATE INDEX nostrUser_muterInput IF NOT EXISTS FOR (n:NostrUser) ON (n.muterInput);
CREATE INDEX nostrUser_reporterInput IF NOT EXISTS FOR (n:NostrUser) ON (n.reporterInput);

CREATE INDEX nostrUser_nip56_totalGrapeRankScore IF NOT EXISTS FOR (n:NostrUser) ON (n.nip56_totalGrapeRankScore);
CREATE INDEX nostrUser_nip56_totalReportCount IF NOT EXISTS FOR (n:NostrUser) ON (n.nip56_totalReportCount);
CREATE INDEX nostrUser_nip56_totalVerifiedReportCount IF NOT EXISTS FOR (n:NostrUser) ON (n.nip56_totalVerifiedReportCount);

CREATE INDEX nostrUser_blacklisted IF NOT EXISTS FOR (n:NostrUser) ON (n.blacklisted);

CREATE CONSTRAINT nostrEvent_event_id IF NOT EXISTS FOR (n:NostrEvent) REQUIRE n.event_id IS UNIQUE;
CREATE INDEX nostrEvent_event_id IF NOT EXISTS FOR (n:NostrEvent) ON (n.event_id);
CREATE INDEX nostrEvent_kind IF NOT EXISTS FOR (n:NostrEvent) ON (n.kind);
CREATE INDEX nostrEvent_created_at IF NOT EXISTS FOR (n:NostrEvent) ON (n.created_at);
CREATE INDEX nostrEvent_author IF NOT EXISTS FOR (n:NostrEvent) ON (n.author);

CREATE INDEX nostrUser_customer_personalizedPageRank IF NOT EXISTS FOR (n:NostrUser) ON (n.customer_personalizedPageRank);
CREATE INDEX nostrUser_customer_verifiedFollowerCount IF NOT EXISTS FOR (n:NostrUser) ON (n.customer_verifiedFollowerCount);
CREATE INDEX nostrUser_customer_verifiedMuterCount IF NOT EXISTS FOR (n:NostrUser) ON (n.customer_verifiedMuterCount);

CREATE INDEX nostrUserWotMetricsCard_customer_id IF NOT EXISTS FOR (n:NostrUserWotMetricsCard) ON (n.customer_id);
CREATE INDEX nostrUserWotMetricsCard_observer_pubkey IF NOT EXISTS FOR (n:NostrUserWotMetricsCard) ON (n.observer_pubkey);
CREATE INDEX nostrUserWotMetricsCard_observee_pubkey IF NOT EXISTS FOR (n:NostrUserWotMetricsCard) ON (n.observee_pubkey);

CREATE INDEX nostrUserWotMetricsCard_hops IF NOT EXISTS FOR (n:NostrUserWotMetricsCard) ON (n.hops);
CREATE INDEX nostrUserWotMetricsCard_personalizedPageRank IF NOT EXISTS FOR (n:NostrUserWotMetricsCard) ON (n.personalizedPageRank);
CREATE INDEX nostrUserWotMetricsCard_influence IF NOT EXISTS FOR (n:NostrUserWotMetricsCard) ON (n.influence);
CREATE INDEX nostrUserWotMetricsCard_average IF NOT EXISTS FOR (n:NostrUserWotMetricsCard) ON (n.average);
CREATE INDEX nostrUserWotMetricsCard_confidence IF NOT EXISTS FOR (n:NostrUserWotMetricsCard) ON (n.confidence);
CREATE INDEX nostrUserWotMetricsCard_input IF NOT EXISTS FOR (n:NostrUserWotMetricsCard) ON (n.input);
CREATE INDEX nostrUserWotMetricsCard_totalVerifiedReportCount IF NOT EXISTS FOR (n:NostrUserWotMetricsCard) ON (n.totalVerifiedReportCount);
CREATE INDEX nostrUserWotMetricsCard_whitelisted IF NOT EXISTS FOR (n:NostrUserWotMetricsCard) ON (n.whitelisted);
CREATE INDEX nostrUserWotMetricsCard_blacklisted IF NOT EXISTS FOR (n:NostrUserWotMetricsCard) ON (n.blacklisted);

CREATE INDEX nostrUserWotMetricsCard_verifiedFollowerCount IF NOT EXISTS FOR (n:NostrUserWotMetricsCard) ON (n.verifiedFollowerCount);
CREATE INDEX nostrUserWotMetricsCard_verifiedMuterCount IF NOT EXISTS FOR (n:NostrUserWotMetricsCard) ON (n.verifiedMuterCount);
CREATE INDEX nostrUserWotMetricsCard_verifiedReporterCount IF NOT EXISTS FOR (n:NostrUserWotMetricsCard) ON (n.verifiedReporterCount);

CREATE INDEX nostrUserWotMetricsCard_followerInput IF NOT EXISTS FOR (n:NostrUserWotMetricsCard) ON (n.followerInput);
CREATE INDEX nostrUserWotMetricsCard_muterInput IF NOT EXISTS FOR (n:NostrUserWotMetricsCard) ON (n.muterInput);
CREATE INDEX nostrUserWotMetricsCard_reporterInput IF NOT EXISTS FOR (n:NostrUserWotMetricsCard) ON (n.reporterInput);
EOF

# Use cypher-shell to execute the commands
echo "Running Neo4j constraints and indexes setup..."
if command -v cypher-shell &> /dev/null; then
  # Try with default password first
  if cypher-shell -u neo4j -p neo4j --file "$CYPHER_FILE" 2>/dev/null; then
    echo "Neo4j constraints and indexes set up successfully."
  else
    echo "Could not set up Neo4j constraints and indexes with default password."
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

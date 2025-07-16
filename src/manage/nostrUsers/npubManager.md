
## npubManager.sh 
This script will query Neo4j for a list of NostrUsers whose npub needs to be set.

It will first query neo4j for NostrUsers whose pubkey is not null but whose npub is null, with a limit of 1000.

For each result, it will calculate the npub from the pubkey, and update the npub in neo4j.


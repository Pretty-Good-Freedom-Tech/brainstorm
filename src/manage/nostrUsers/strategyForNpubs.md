
## processNpubsOneBlock.sh 
This script is called by processNpubsUpTo50Blocks.sh

It will first query neo4j for NostrUsers whose pubkey is not null but whose npub is null, with a limit of 1000.

For each result, it will calculate the npub from the pubkey, and update the npub in neo4j.


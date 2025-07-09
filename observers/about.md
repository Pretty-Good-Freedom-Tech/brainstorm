# Clients

Each client corresponds to one pubkey. Clients can sign into the Brainstorm instance using their pubkey.

# Observers

Each observer corresponds to one or more (but usually just one) pubkey.

Each Brainstorm instance will have the ability to calculate graperank, pagerank, DoS, and other WoT metrics for users other than the owner of the instance. These other users will be referred to as customers, clients, observers, reference users, seed users, or anchor users. For each customer, the instance will maintain files in a directory called /var/lib/brainstorm/customers. For each customer, there will be a directory called /var/lib/brainstorm/customers/<observer_id>. Normally, <observer_id> will be the <observer_pubkey>, but it can be any string that is unique to the observer. In some cases, the observer may be a community with multiple pubkeys acting collectively as a single `observer`. In practice, what that means for GrapeRank is that the GrapeRank scores of each observer pubkey is fixed.

Additional directory names will include <owner> and <newObserver>.

Subdirectories:

These files will be used to store various user preferences:

- /var/lib/brainstorm/observers/<observer_id>/preferences/graperank.conf
- /var/lib/brainstorm/observers/<observer_id>/preferences/whitelist.conf
- /var/lib/brainstorm/observers/<observer_id>/preferences/blacklist.conf

These directories will be used to store the results of the calculations:

- /var/lib/brainstorm/observers/<observer_id>/results/graperank
- /var/lib/brainstorm/observers/<observer_id>/results/pagerank
- /var/lib/brainstorm/observers/<observer_id>/results/dos
- /var/lib/brainstorm/observers/<observer_id>/results/wot

# Clients list

Each client has a pubkey, which can be used to log into the Brainstorm instance. The pubkey is stored in the clientsList.json file.
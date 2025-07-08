# Customers

Each Brainstorm instance will have the ability to calculate graperank, pagerank, DoS, and other WoT metrics for users other than the owner of the instance. These other users will be referred to as customers, clients, seed users, or anchor users. For each customer, the instance will maintain files in a directory called /var/lib/brainstorm/customers. For each customer, there will be a directory called /var/lib/brainstorm/customers/<customer_id>. Normally, <customer_id> will be the <customer_pubkey>, but it can be any string that is unique to the customer.

Subdirectories:

These files will be used to store various user preferences:

- /var/lib/brainstorm/customers/<customer_pubkey>/preferences/graperank.conf
- /var/lib/brainstorm/customers/<customer_pubkey>/preferences/whitelist.conf
- /var/lib/brainstorm/customers/<customer_pubkey>/preferences/blacklist.conf

These directories will be used to store the results of the calculations:

- /var/lib/brainstorm/customers/<customer_pubkey>/results/graperank
- /var/lib/brainstorm/customers/<customer_pubkey>/results/pagerank
- /var/lib/brainstorm/customers/<customer_pubkey>/results/dos
- /var/lib/brainstorm/customers/<customer_pubkey>/results/wot


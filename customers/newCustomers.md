# Management of Metrics Personalized to Customers

To setup a new customer, personalized metrics need to be stored somewhere. Several options exist:
1. files
2. SQL database
3. NostrUserMetrics nodes

1. Store metrics temporariily (during the calculation step) in dedicated customer metric properties in each NostrUser node, and then transfer the values to files in /var/lib/brainstorm/customers/<customer_id>/metrics.json. After transfer, delete the properties from the NostrUser node.
2. Same as the above option except store the values in a sql database rather than in files.
3. Same as the above option except store the values in NostrUserMetrics nodes. For each connected NostrUser, for each customer, a new NostrUserMetrics node will be created in the neo4j database, with a new relationship between the NostrUser and the NostrUserMetrics node.

## neo4j node type: NostrUsers (options 1, 2, 3)

Additional properties 
- customer_hops
- customer_personalizedPageRank
- customer_influence
- customer_average
- customer_confidence
- customer_input
- customer_totalVerifiedReportCount
- customer_whitelisted
- customer_blacklisted

## new neo4j node type: NostrUserWotMetricsCard (option 3)

This is a node type that will be used to store metrics personalized to a customer.

- customer_id
- observer_pubkey
- observee_pubkey

Metric properties:
- hops
- personalizedPageRank
- influence
- average
- confidence
- input
- totalVerifiedReportCount
- whitelisted
- blacklisted

## new neo4j relationship type: WOT_METRICS_CARDS

A new relationship type will be introduced, called WOT_METRICS_CARD, which will be used to connect a NostrUser node (origin, from) to a NostrUserWotMetrics node (destination, to). Each such relationship will have a property called customer_id which will be used to identify the customer. (customer_id may be recorded redundantly in the NostrUserWotMetrics node as well as in the WOT_METRICS_CARD relationship.)

## new neo4j node types: Set, SetOfNostrUserWotMetricsCards

## new neo4j relationship type: SPECIFIC_INSTANCE

## new neo4j relationship type: SUBSET

Origin (from) and destination (to) must always be a Set node.

## Cypher queries

Each NostrUser should have one associated SetOfNostrUserWotMetricsCards node.
Whenever new NostrUser nodes are created, they should be checked to see if they have an associated SetOfNostrUserWotMetricsCards node. If not, create one.

MATCH (n:NostrUser)
WHERE NOT (n) -[:WOT_METRICS_CARDS]-> (:Set:SetOfNostrUserWotMetricsCards)
LIMIT 100000
MERGE (n) -[:WOT_METRICS_CARDS]-> (s:Set:SetOfNostrUserWotMetricsCards)
SET s.observee_pubkey = n.pubkey

Can handle limit of 100000 in under 4 seconds.

Next, for each SetOfNostrUserWotMetricsCards node and for each customer, set up a NostrUserWotMetricsCard node.

For Dawn:
For customer_id=2 with pubkey="c230edd34ca5c8318bf4592ac056cde37519d395c0904c37ea1c650b8ad4a712":

MATCH (s:Set:SetOfNostrUserWotMetricsCards)
WHERE NOT (s) -[:SPECIFIC_INSTANCE]-> (:NostrUserWotMetricsCard {customer_id: 2})
LIMIT 100
MERGE (s) -[:SPECIFIC_INSTANCE]-> (c:NostrUserWotMetricsCard {customer_id: 2})
SET c.observer_pubkey = "c230edd34ca5c8318bf4592ac056cde37519d395c0904c37ea1c650b8ad4a712", c.observee_pubkey = s.observee_pubkey

Can handle limit of 100000 in about 3 seconds.

For cloudfodder:
MATCH (s:Set:SetOfNostrUserWotMetricsCards)
WHERE NOT (s) -[:SPECIFIC_INSTANCE]-> (:NostrUserWotMetricsCard {customer_id: 1})
LIMIT 100000
MERGE (s) -[:SPECIFIC_INSTANCE]-> (c:NostrUserWotMetricsCard {customer_id: 1})
SET c.observer_pubkey = "7cc328a08ddb2afdf9f9be77beff4c83489ff979721827d628a542f32a247c0e", c.observee_pubkey = s.observee_pubkey
RETURN count(s)

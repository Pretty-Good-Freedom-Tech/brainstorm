## TODO 12 JULY 2025
- update get-profiles endpoint to display scores from customers on profiles page
- (optional): initialize scorecards from neo4j if scores already exist
- add pagerank endpoint to compare to Vertex
- add process-all-active-customers endpoint and add processAllActiveCustomers.js to end of processAllTasks.sh script
- update get-user-data endpoint to support nip85 scores for observerPubkey
- update profile page so that it displays scores from customers when ?observerPubkey is specified in url
- add wot.brainstorm.social to negentropy sync scripts
- add social graph page to display number of connections by hop number
- edit profiles.page to select global view vs individual customer view
- remove verifiedFollowers from all remaining pages; has been replaced with verifiedFollowerCount and removed from some but not all pages
- make sure that no properties with numeric values in Neo4j are null; either that, or make sure that neo4j queries handle null values properly; currently, null values throw a monkey wrench into cypher queries when sorting on a property that has null values. Properties that are currently not handled properly: 
  - influence, average, input, confidence
- profiles.js: for customer queries, need to add WHERE clause before OPTIONAL MATCH to exclude null values; eg this is not problematic: 
MATCH (u:NostrUserWotMetricsCard {observer_pubkey: '7cc328a08ddb2afdf9f9be77beff4c83489ff979721827d628a542f32a247c0e'})
WHERE u.influence > 0.01
OPTIONAL MATCH (u)<-[:SPECIFIC_INSTANCE]-(f:SetOfNostrUserWotMetricsCards)<-[:WOT_METRICS_CARDS]-(n:NostrUser)
RETURN u.observee_pubkey as pubkey,
u.influence as influence
ORDER BY toFloat(u.influence) DESC
SKIP 0
LIMIT 50

But this is problematic:
MATCH (u:NostrUserWotMetricsCard {observer_pubkey: '7cc328a08ddb2afdf9f9be77beff4c83489ff979721827d628a542f32a247c0e'})
OPTIONAL MATCH (u)<-[:SPECIFIC_INSTANCE]-(f:SetOfNostrUserWotMetricsCards)<-[:WOT_METRICS_CARDS]-(n:NostrUser)
WHERE u.influence > 0.01
RETURN u.observee_pubkey as pubkey,
u.influence as influence
ORDER BY toFloat(u.influence) DESC
SKIP 0
LIMIT 50

- Figure out why sudo strfry sync hangs in some cases but not in others, e.g. wss://wot.brainstorm.social (hangs), wss://relay.hasenpfeffr.com (does not hang); need to add timeout? or listen for eof?
- set all null scores to zero for most if not all metrics. More performant than calculating all of them which should be zero. However, note this EDGE CASE: user gets followed, has nonzero scores; then gets unfollowed. In this case, the score changes to zero but might not get overwritten, so the old (incorrect) score would remain. ALTERNATIVE PLAN: Set all scores to zero for hops=999. Everyone else will be calculated (this is true for graperank; unsure if true for all other metrics.)
- replace updateNeo4j.js with updateNeo4jWithApoc.js in personalizedGrapeRank.sh for owner (as is already implemented for customers)

TODO: SCRAPE OLD REPORTS
- use nak 
- use since in filter
try all major relays including:
- wss://nostr-pub.wellorder.net

TO FIX;
when running processCustomer, when doing graperank, it recreates follows.csv, mutes.csv, reports.csv and ratings.json even when these have already been created. Also: MaxListenersExceededWarning when creating ratings.json; in interpretRatings.js , increase stream.setMaxListeners(100); above 100 ? Error: `(node:1245413) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 101 drain listeners added to [WriteStream]. Use emitter.setMaxListeners() to increase limit` (note 101 drain listeners)

## TODO 21 Apr 2025
- MIP-87: curate mints
- add npub to tables
- update profiles page with same features as nip56 page
- take care of neo4j password during installation
- why strfry and neo4j are in /var/lib but brainstorm is in /usr/local/lib/node_modules
- make sure current relay pubkey matches with kind 10040 and 30382 events (may not be the case when updating destroys old relay nsec; so need to create reinstall-from-backup script)
- fix ManiMe's graperank calculation engine

Create:
- brainstorm.social landing page for Brainstorm. Basic info about Brainstorm. Links to sign up. List of client brainstorms and DIY brainstorms.
- relay.brainstorm.social or pgft.brainstorm.social will be the first client relay. More client relays to follow.

## TODO 7 April 2025
- fix Friends relays list in brainstorm.conf; set different relays for subcategories
- move export files from algos to export directory
- refactor nip-85 publishing scripts
- make routine tasks refresh more frequently when in the middle of processing tasks

## FEATURES TO ADD
- ☐ user can select whether to use recommended friends relays or personal relays list
- ☐ verify calculation of GrapeRank scores on profile page
- ☐ PageRank vs GrapeRank vs dos charts, similar to previous work at https://grapevine-brainstorm.vercel.app/
- ☐ recommended follows page
- ☐ my followers page, ranked by WoT scores
- ☐ add verified followers score to profile page
- ☐ add verified followers score to kind 30382 events
- ☐ calculate separate GrapeRank scores: gr_basic, gr_muted, gr_reported
- ☐ make WoT scores accessible through API (WoT DVM)
- ☐ access neo4j password from neo4j.conf rather than brainstorm.conf
- ☐ view / change relay nsec 
- ☐ data navigation pages: table of all pubkeys, my followers, recommended follows, etc

## TODO: FIX NIP-85 PUBLISHING
Currently two sets of scripts. Need to decide which one to keep and where to put them.
1. one set called by NIP-85 Control Panel. It works but does not log results and is in an unusual location.
- bin/brainstorm-publish-kind30382.js
- bin/brainstorm-publish-kind10040.js
- bin/brainstorm-create-kind10040.js
2. another set called by bin/control-panel.js, which is called by home page via api. It logs results but does not seem to function properly because nip85.json is not found and generateNip85.sh does not exist.
- src/algos/publishNip85.sh
- src/algos/publish_nip85_30382.js
- src/algos/publish_nip85_10040.mjs

## INSTANCE TYPE
4 April 2025: Currently using t2.large. CPU spikes causing crashes; AWS Compute Optimizer suggests m7g.large for better CPU provisioning, with slight cost savings. 

8 Aug 2025: restore from backup from most recent that still has intact /var/log/brainstorm logs; seem to have gotten lost while implementing and testing Brainstorm Task Queue System
backup-2025-08-07T22-43-48



TODO 11 Aug 2025:
- does generateNpubs, the task that's in js, not sh, cause crash?
- who processAllTasks use so many if sude commands? Why did script seem to pause in reconciliation?
- taskQueueManager and relayed tasks still need to incorporate structured logging

TODO: 24 Aug 2025: profile-search.html page and its associated api
 - /api/search/profiles/keyword/precompute-whitelist-maps?force=true
 - /api/search/profiles/keyword/precompute-whitelist-maps/status
 - api/search/profiles/keyword?searchString=jack&source=file&limit=60&observerPubkey=owner
1. Review handleKeywordSearchProfiles search api. I suspect it may perform multiple redundant passes: Targeted passes, Broad prefilter, runExhaustiveTargetedRegex, runExhaustiveFixedLiteral, maybe more. Plan: do only one pass. Make sure search proceeds from high influence to low. Set limits on number of results. Implement button on front end to show more results or show hidden results. Goal: make search faster and more performant. It may be easier just to rewrite handleKeywordSearchProfiles from scratch after 
2. Create new POST precompute-kind0-maps endpoints, modelled after precompute-whitelist-maps api endpoionts, that makes a list of all pubkeys that are whitelisted on ANY list (see precompute-whitelist-maps/status endpoint for how to access this list); query strfry for all kind 0 data; for whitelisted pubkeys, obtain name, display_name, and about; create a new map that will live in memory. Use this map, if available, whenever doing keyword search. When doing keyword search, there should now be no need to query strfry or neo4j (when using source=file option), because all relevant data will be in memory. Goal: make profile search much more performant.
BASIC FUNCTIONALITY:
1. Replace Observer pubkey field with observerSelector - adapt from components
2. set up service to recalculate data in cache periodically: /api/search/profiles/keyword/precompute-whitelist-maps?force=true
IMPROVE UI
3. Improve UI: Tweak which profiles have red border. Remove about data from profile cards, or truncate long ones.
4. option to search name and display_name without about; see if faster results
4. Improve UI: remove Legend; show info as popup over scores in profile cards

TODO: 24 Aug 2025: revamp navbars
1. add customers import/export feature for owner on manage-customers page
- export all customers, all customer prefs, and all customer relay nsecs, as an encrypted folder of files. (or one json file per customer, or one large json file)
- import feature; options to overwrite all existing customer (delete all current customers) or overwrite individually (only overwrite customers that are already in current customer database); default is NOT to overwrite any existing customers.

TODO: 31 AUG 2025
Publishing kind 10040 and 30382 events
1. Make sure the customer can publish and/or re-publish kind 10040 events from customer page
2. Allow owner to decice whether to use BRAINSTORM_RELAY_URL or BRAINSTORM_NIP85_HOME_RELAY in 10040 events.

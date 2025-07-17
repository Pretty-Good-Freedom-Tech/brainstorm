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
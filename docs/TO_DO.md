## TODO 18 Apr 2025
- make sure brainstorm-control-panel service is running at installation
- debug when negentropy steps seem to stop early when run locally
- why strfry and neo4j are in /var/lib but brainstorm is in /usr/local/lib/node_modules
- create verified followers score
- more rigorous verification of GrapeRank scores
- create reinstall-from-backup script
- make sure current relay pubkey matches with kind 10040 and 30382 events (may not be the case when updating destroys old relay nsec; so need to create reinstall-from-backup script)

Create:
- brainstorm.social landing page for Brainstorm. Basic info about Brainstorm. Links to sign up. List of client brainstorms and DIY brainstorms.
- relay.brainstorm.social or pgft.brainstorm.social will be the first client relay. More client relays to follow.

## TODO 7 April 2025
- import graperank calculation engine
- fix Friends relays list in brainstorm.conf; set different relays for subcategories
- move export files from algos to export directory
- refactor nip-85 publishing scripts
- set up default localhost if hosting locally
- make sure neo4j constraints and indexes are set up seamlessly in the background
- make routine tasks refresh more frequently when in the middle of processing tasks
- refactor installation scripts
- review GrapeRank calculations on the profile page

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
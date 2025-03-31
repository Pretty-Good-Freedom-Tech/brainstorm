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
- ☐ access neo4j password from neo4j.conf rather than hasenpfeffr.conf
- ☐ view / change relay nsec 
- ☐ data navigation pages: table of all pubkeys, my followers, recommended follows, etc

## TO DO
- make sure whitelist and blacklist are handled properly; check that paths are correct
- make big script with systemd service to calculate, in order: hops, pagerank, graperank, update whitelist and blacklist, update NIP-85 events
- bar across top showing number of events in strfry and summary of data in Neo4j
- make big startup script to go down Big Checklist of all the things that need to be done on startup; have page to monitor all of this; one big button to start everything; different control panel page for each function; status: green check if OK; spinning wheel if in progress; red cross if failed; 
    - add Neo4j constraints and indexes
    - negentropy sync: kinds 3, 1984, 10000 (hasenpfeffr)
    - negentropy sync: kind 0 (nostr1)
    - negentropy sync: personal content (primal)
    - turn on streaming pipeline
    - turn on periodic recalculation of WoT scores
- make sure strfry-router streams all the right things, including my personal content (all events authored by me))

## TODO: FIX NIP-85 PUBLISHING
Currently two sets of scripts. Need to decide which one to keep and where to put them.
1. one set called by NIP-85 Control Panel. It works but does not log results and is in an unusual location.
- bin/hasenpfeffr-publish-kind30382.js
- bin/hasenpfeffr-publish-kind10040.js
- bin/hasenpfeffr-create-kind10040.js
2. another set called by bin/control-panel.js, which is called by home page via api. It logs results but does not seem to function properly because nip85.json is not found and generateNip85.sh does not exist.
- src/algos/publishNip85.sh
- src/algos/publish_nip85_30382.js
- src/algos/publish_nip85_10040.mjs
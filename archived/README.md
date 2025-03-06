# Archived Files

This directory contains files that are no longer actively used in the Hasenpfeffr project but are kept for reference.

## Why Archive?

Files are archived rather than deleted to:
1. Preserve historical code
2. Provide reference for previous implementations
3. Reduce confusion in the main codebase
4. Minimize the risk of accidental modifications to unused files

## Archived Files

| Filename | Original Location | Archived Date | Reason for Archiving |
|----------|-------------------|---------------|----------------------|
| control-panel.js | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Duplicate of bin/control-panel.js. The bin version is used in production. |
| fixed-control-panel.js | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Development version that was likely created to fix issues. The bin/control-panel.js is now the maintained version. |
| api.js | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Older version of the control panel API. Functionality is now in bin/control-panel.js. |
| generateNip85.js | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Older version of the NIP-85 data generator. Functionality is now in bin/generate.js which uses the lib/generate.js module. |
| calculateHops.service | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Service file for a deprecated calculation process. |
| calculateHops.timer | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Timer file for a deprecated calculation process. |
| control-panel-setup.md | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Outdated setup documentation. |
| control-panel.html | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Outdated HTML file for the control panel. |
| create_nostr_identity.sh | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Script for creating Nostr identities that may be outdated. |
| etl_pipeline.py | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Python ETL script that may be outdated or replaced. |
| generateNip85.sh | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Shell script for generating NIP-85 data, now handled by bin/generate.js. |
| hasenpfeffr-api.service | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Service file for a deprecated API service. |
| hasenpfeffr-control-panel.service | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Service file that may be outdated or replaced by systemd/hasenpfeffr-control-panel.service. |
| init-db.sh | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Database initialization script that may be outdated. |
| nginx-config | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Nginx configuration file that may be outdated. |
| nginx-config-fixed | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Fixed version of Nginx configuration that may be outdated. |
| optimized_apocCypherCommand | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Cypher command file that may be outdated. |
| optimized_apocCypherCommand1 | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Another Cypher command file that may be outdated. |
| optimized_kind3EventsToFollows.js | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Script for processing kind 3 events that may be outdated. |
| optimized_kind3EventsToFollows.sh | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Shell script for processing kind 3 events that may be outdated. |
| optimized_processQueue.service | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Service file for a deprecated queue processing service. |
| optimized_processQueue.sh | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Shell script for queue processing that may be outdated. |
| processReconcileQueue.js | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Script for processing reconciliation queue that may be outdated. |
| processReconcileQueue.service | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Service file for a deprecated reconciliation queue service. |
| processReconcileQueue.timer | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Timer file for a deprecated reconciliation queue process. |
| publish_hello_world.sh | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Test script for publishing hello world events. |
| publish_nip85.js | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Script for publishing NIP-85 events that may be outdated. |
| publish_nip85.sh | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Shell script for publishing NIP-85 events that may be outdated. |
| runReconciliation.js | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Script for running reconciliation that may be outdated. |
| runReconciliation.service | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Service file for a deprecated reconciliation service. |
| runReconciliation.sh | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Shell script for running reconciliation that may be outdated. |
| runReconciliation.timer | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Timer file for a deprecated reconciliation process. |
| update-calculateHops-timer.sh | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Script for updating a timer that may be outdated. |
| updateSingleNostrUser.sh | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Script for updating a single Nostr user that may be outdated. |
| updated-package.json | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Outdated package.json file. |
| updated-readme.md | /Users/wds/CascadeProjects/windsurf-project/ | March 5, 2025 | Outdated README.md file. |

## Active Files

The following files are currently active and should be used for development:

- `bin/control-panel.js` - The main control panel script used in production
- `bin/generate.js` - The NIP-85 data generator script
- `bin/publish.js` - The NIP-85 event publisher script
- `index.js` - The main entry point for the Hasenpfeffr package
- `lib/` - Core library files used by the bin scripts
- `public/` - Web interface files
- `setup/` - Installation and setup scripts
- `systemd/` - Current systemd service files

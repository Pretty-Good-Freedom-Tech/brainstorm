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

## Active Files

The following files are currently active and should be used for development:

- `bin/control-panel.js` - The main control panel script used in production
- `bin/generate.js` - The NIP-85 data generator script
- `index.js` - The main entry point for the Hasenpfeffr package
- `optimized_kind3EventsToFollows.js` - Used by optimized_kind3EventsToFollows.sh
- `processReconcileQueue.js` - Used by processReconcileQueue.service
- `publish_nip85.js` - Used by publish_nip85.sh
- `runReconciliation.js` - Used by runReconciliation.service and runReconciliation.sh

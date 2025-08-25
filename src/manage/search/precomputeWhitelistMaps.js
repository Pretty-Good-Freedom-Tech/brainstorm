#!/usr/bin/env node

/*
import handler: handlePrecomputeWhitelistMaps
from: 
BRAINSTORM_MODULE_BASE_DIR/src/api/search/profiles/whitelistPrecompute.js
and run it with force=true
*/

const { handlePrecomputeWhitelistMaps } = require('../../api/search/profiles/whitelistPrecompute.js');

handlePrecomputeWhitelistMaps({ force: true });

/**
 * Search Profiles API
 * handler for /api/search/profiles
 * 
 * Provides data for searching profiles
 * 
 * Search kind0 notes in strfry database
 * 
 * Returns an array of pubkeys
 */

const { spawn } = require('child_process');
const nostrTools = require('nostr-tools');

// Module-scope cache and performance constants to persist across requests
const searchCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const MAX_RESULTS = 60; // Limit results for performance
const MAX_GREP_LINES = 200; // Maximum matching lines grep will return before exiting
const TIME_BUDGET_MS = 2500; // Hard time budget for search process
const TARGETED_GREP_LIMIT = 6; // Small targeted pass limit per field
const TARGETED_TIME_BUDGET_MS = 1500; // Time budget for exact-match boost
const EXHAUSTIVE_BUDGET_MS = 30000; // Exhaustive fallback phase budget per search
const STREAM_HARD_TIMEOUT_MS = 65000; // Hard cutoff to ensure SSE closes cleanly

function getCachedSearch(searchString) {
    const cached = searchCache.get(searchString.toLowerCase());
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        console.log(`Cache hit for search: ${searchString}`);
        return cached.results;
    }
    return null;
}

function setCachedSearch(searchString, results) {
    searchCache.set(searchString.toLowerCase(), {
        results,
        timestamp: Date.now()
    });
    // Simple LRU-ish eviction
    if (searchCache.size > 200) {
        const oldestKey = searchCache.keys().next().value;
        searchCache.delete(oldestKey);
    }
}

/**
 * Search profiles
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handleSearchProfiles(req, res) {
    // Set timeout to 3 minutes (180000 ms)
    req.setTimeout(180000);
    res.setTimeout(180000);

    const searchType = req.query.searchType; // npub (fragment), pubkey (fragment), kind0 (name, username, about, picture, banner, lnpub)
    const searchString = req.query.searchString;
    
    if (!searchType || !searchString) {
        return res.status(400).json({
            success: false,
            error: 'Missing search parameter; expecting searchType and searchString'
        });
    }

    // if searchType is not npub or kind0, return an error
    if (searchType !== 'npub' && searchType !== 'kind0') {
        return res.status(400).json({
            success: false,
            error: 'Invalid search type; expecting npub or kind0'
        });
    }

    // if searchType == npub, then use nip19 to get the pubkey
    if (searchType === 'npub') {
        try {
            const decodeResults = nostrTools.nip19.decode(searchString);
            if (decodeResults.type !== 'npub') {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid search type; expecting npub'
                });
            }
            // return here
            return res.json({
                success: true,
                searchType,
                searchString,
                decodeResultsType: decodeResults.type,
                pubkey: decodeResults.data,
                error: null
            });
        } catch (error) {
            return res.status(400).json({
                success: false,
                message: 'nip19 decode failure',
                error
            });
        }
    }

    

    // Optimized function to return list of pubkeys whose kind 0 events contain the search strings
    function getAllMatchingKind0Profiles(searchString) {
        return new Promise((resolve, reject) => {
            // Check cache first
            const cachedResults = getCachedSearch(searchString);
            if (cachedResults) {
                return resolve(cachedResults);
            }

            console.log(`Starting optimized search for: ${searchString}`);
            const startTime = Date.now();
            
            // Helpers for targeted exact-match boost (fixed-string search)
            const escapeForEventContent = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            const buildExactLiteral = (field, value) => {
                // Literal substring as it appears in the event JSON (within content string): \"field\":\"value\"
                const v = escapeForEventContent(value);
                return `\\\"${field}\\\":\\\"${v}\\\"`;
            };
            const runTargetedPass = (literal, budgetMs) => new Promise((resolveTP) => {
                // Use single quotes to preserve backslashes; escape any single quotes in the literal (unlikely)
                const singleQuoted = `'${literal.replace(/'/g, `"'"'`)}'`;
                const cmd = `LC_ALL=C strfry scan '{"kinds":[0]}' | LC_ALL=C grep -iF -m ${TARGETED_GREP_LIMIT} ${singleQuoted}`;
                const p = spawn('sudo', ['bash', '-c', cmd]);
                let buf = '';
                const outPubkeys = [];
                const localSeen = new Set();
                const timer = setTimeout(() => {
                    if (!p.killed) {
                        try { p.kill('SIGTERM'); } catch (_) {}
                    }
                }, budgetMs);
                p.stdout.on('data', (data) => {
                    buf += data.toString();
                    const lines = buf.split('\n');
                    buf = lines.pop();
                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const evt = JSON.parse(line);
                            if (evt && evt.pubkey && !localSeen.has(evt.pubkey)) {
                                localSeen.add(evt.pubkey);
                                outPubkeys.push(evt.pubkey);
                            }
                        } catch (_) { /* skip */ }
                    }
                });
                p.on('close', () => {
                    clearTimeout(timer);
                    if (buf.trim()) {
                        try {
                            const evt = JSON.parse(buf);
                            if (evt && evt.pubkey && !localSeen.has(evt.pubkey)) {
                                outPubkeys.push(evt.pubkey);
                            }
                        } catch (_) { /* skip */ }
                    }
                    resolveTP(outPubkeys);
                });
                p.on('error', () => resolveTP([]));
            });
            
            // Exhaustive helpers (no -m, budget-limited)
            const regexEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const buildExactRegex = (field, value) => {
                const v = regexEscape(value);
                return `\\\"${field}\\\"[[:space:]]*:[[:space:]]*\\\"${v}\\\"`;
            };
            const runExhaustiveTargetedRegex = (pattern, budgetMs) => new Promise((resolveTP) => {
                if (typeof budgetMs === 'number' && budgetMs <= 0) return resolveTP([]);
                const singleQuoted = `'${pattern.replace(/'/g, `"'"'`)}'`;
                const cmd = `LC_ALL=C strfry scan '{"kinds":[0]}' | LC_ALL=C grep -iE ${singleQuoted}`;
                const p = spawn('sudo', ['bash', '-c', cmd]);
                let buf = '';
                const outPubkeys = [];
                const localSeen = new Set();
                const timer = typeof budgetMs === 'number' ? setTimeout(() => {
                    if (!p.killed) {
                        try { p.kill('SIGTERM'); } catch (_) {}
                    }
                }, budgetMs) : null;
                p.stdout.on('data', (data) => {
                    buf += data.toString();
                    const lines = buf.split('\n');
                    buf = lines.pop();
                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const evt = JSON.parse(line);
                            if (evt && evt.pubkey && !localSeen.has(evt.pubkey)) {
                                localSeen.add(evt.pubkey);
                                outPubkeys.push(evt.pubkey);
                            }
                        } catch (_) { /* skip */ }
                    }
                });
                p.on('close', () => {
                    if (timer) clearTimeout(timer);
                    if (buf.trim()) {
                        try {
                            const evt = JSON.parse(buf);
                            if (evt && evt.pubkey && !localSeen.has(evt.pubkey)) {
                                outPubkeys.push(evt.pubkey);
                            }
                        } catch (_) { /* skip */ }
                    }
                    resolveTP(outPubkeys);
                });
                p.on('error', () => resolveTP([]));
            });
            const buildExactValueLiteral = (value) => `\\\"${escapeForEventContent(value)}\\\"`;
            const runExhaustiveFixedLiteral = (literal, budgetMs) => new Promise((resolveTP) => {
                if (typeof budgetMs === 'number' && budgetMs <= 0) return resolveTP([]);
                const singleQuoted = `'${literal.replace(/'/g, `"'"'`)}'`;
                const cmd = `LC_ALL=C strfry scan '{"kinds":[0]}' | LC_ALL=C grep -iF ${singleQuoted}`;
                const p = spawn('sudo', ['bash', '-c', cmd]);
                let buf = '';
                const outPubkeys = [];
                const localSeen = new Set();
                const timer = typeof budgetMs === 'number' ? setTimeout(() => {
                    if (!p.killed) {
                        try { p.kill('SIGTERM'); } catch (_) {}
                    }
                }, budgetMs) : null;
                p.stdout.on('data', (data) => {
                    buf += data.toString();
                    const lines = buf.split('\n');
                    buf = lines.pop();
                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const evt = JSON.parse(line);
                            if (evt && evt.pubkey && !localSeen.has(evt.pubkey)) {
                                localSeen.add(evt.pubkey);
                                outPubkeys.push(evt.pubkey);
                            }
                        } catch (_) { /* skip */ }
                    }
                });
                p.on('close', () => {
                    if (timer) clearTimeout(timer);
                    if (buf.trim()) {
                        try {
                            const evt = JSON.parse(buf);
                            if (evt && evt.pubkey && !localSeen.has(evt.pubkey)) {
                                outPubkeys.push(evt.pubkey);
                            }
                        } catch (_) { /* skip */ }
                    }
                    resolveTP(outPubkeys);
                });
                p.on('error', () => resolveTP([]));
            });
            
            // Dynamic budget: be more generous for short queries (like "jack")
            const targetedBudget = (searchString && searchString.length <= 4) ? 4000 : TARGETED_TIME_BUDGET_MS;

            // Kick off targeted passes in parallel for exact name/display_name matches
            const targetedPromises = [
                runTargetedPass(buildExactLiteral('name', searchString), targetedBudget),
                runTargetedPass(buildExactLiteral('display_name', searchString), targetedBudget)
            ];
            
            // Use grep to pre-filter before JSON parsing for much better performance
            // This reduces the data we need to process by orders of magnitude
            const escapedSearchString = searchString.replace(/["'\\$`]/g, '\\$&');
            const args = [
                'bash', '-c', 
                `LC_ALL=C strfry scan '{"kinds":[0]}' | LC_ALL=C grep -iF -m ${MAX_GREP_LINES} "${escapedSearchString}"`
            ];
            
            const grepProcess = spawn('sudo', args);
            let buffer = '';
            const pubkeys = [];
            const seenPubkeys = new Set(); // Deduplicate pubkeys
            let processedLines = 0;
            let earlyTerminated = false;
            let timeBudgetExceeded = false;
            
            // Enforce a hard time budget to keep latency low
            const budgetTimer = setTimeout(() => {
                if (!grepProcess.killed) {
                    console.log(`Time budget ${TIME_BUDGET_MS}ms exceeded; returning partial results: ${pubkeys.length}`);
                    try { grepProcess.kill('SIGTERM'); } catch (e) { /* noop */ }
                    timeBudgetExceeded = true;
                }
            }, TIME_BUDGET_MS);
            
            grepProcess.stdout.on('data', (data) => {
                buffer += data.toString();
                let lines = buffer.split('\n');
                buffer = lines.pop(); // Save incomplete line for next chunk
                
                for (const line of lines) {
                    if (!line.trim()) continue;
                    processedLines++;
                    
                    // Early termination if we have enough results
                    if (pubkeys.length >= MAX_RESULTS) {
                        console.log(`Early termination: reached ${MAX_RESULTS} results`);
                        grepProcess.kill('SIGTERM');
                        earlyTerminated = true;
                        break;
                    }
                    
                    try {
                        const oEvent = JSON.parse(line);
                        if (oEvent && oEvent.pubkey && !seenPubkeys.has(oEvent.pubkey)) {
                            seenPubkeys.add(oEvent.pubkey);
                            pubkeys.push(oEvent.pubkey);
                        }
                    } catch (e) {
                        // Malformed JSON, skip this line
                        continue;
                    }
                }
            });
            
            grepProcess.stderr.on('data', (data) => {
                console.error(`Optimized search error: ${data}`);
            });
            
            grepProcess.on('close', (code) => {
                clearTimeout(budgetTimer);
                // Process any remaining buffered line
                if (buffer.trim() && pubkeys.length < MAX_RESULTS) {
                    try {
                        const oEvent = JSON.parse(buffer);
                        if (oEvent && oEvent.pubkey && !seenPubkeys.has(oEvent.pubkey)) {
                            pubkeys.push(oEvent.pubkey);
                        }
                    } catch (e) {
                        // Ignore malformed last line
                    }
                }
                
                // Merge with targeted exact-match results; if none, run exhaustive fallback
                Promise.all(targetedPromises)
                    .then(async (tpArrays) => {
                        const boosted = [];
                        const boostSet = new Set();
                        for (const arr of tpArrays) {
                            for (const pk of arr) {
                                if (!boostSet.has(pk)) {
                                    boostSet.add(pk);
                                    boosted.push(pk);
                                }
                            }
                        }
                        // Always run exhaustive stage with a fixed budget to catch late high-value matches
                        if (searchString && searchString.length > 0) {
                            console.log(`Starting exhaustive scan for: ${searchString} (budget ${EXHAUSTIVE_BUDGET_MS}ms)`);
                            const exStart = Date.now();
                            const deadline = exStart + EXHAUSTIVE_BUDGET_MS;
                            const exPatterns = [
                                buildExactRegex('name', searchString),
                                buildExactRegex('display_name', searchString)
                            ];
                            const remainForRegex = Math.max(1, deadline - Date.now());
                            const exArrays = await Promise.all(exPatterns.map((patt) => runExhaustiveTargetedRegex(patt, remainForRegex)));
                            let addedByExhaustive = 0;
                            for (const arr of exArrays) {
                                for (const pk of arr) {
                                    if (!boostSet.has(pk)) {
                                        boostSet.add(pk);
                                        boosted.push(pk);
                                        addedByExhaustive++;
                                    }
                                }
                            }
                            // As last resort within remaining budget, try value-only exact literal across entire dataset
                            const remain = Math.max(0, deadline - Date.now());
                            if (addedByExhaustive === 0 && remain > 0) {
                                const valLiteral = buildExactValueLiteral(searchString);
                                const valArr = await runExhaustiveFixedLiteral(valLiteral, remain);
                                for (const pk of valArr) {
                                    if (!boostSet.has(pk)) {
                                        boostSet.add(pk);
                                        boosted.push(pk);
                                        addedByExhaustive++;
                                    }
                                }
                            }
                            const exDur = Date.now() - exStart;
                            console.log(`Exhaustive scan finished in ${exDur}ms. Added ${addedByExhaustive} new boosted pubkeys.`);
                        }
                        // Combine boosted first, then broad results sans duplicates
                        const finalList = [];
                        for (const pk of boosted) {
                            if (finalList.length >= MAX_RESULTS) break;
                            finalList.push(pk);
                        }
                        for (const pk of pubkeys) {
                            if (finalList.length >= MAX_RESULTS) break;
                            if (!boostSet.has(pk)) finalList.push(pk);
                        }

                        const endTime = Date.now();
                        const duration = endTime - startTime;
                        console.log(`Optimized search completed in ${duration}ms. Processed ${processedLines} lines. Boosted: ${boosted.length}. Total returned: ${finalList.length}. EarlyTerminated=${earlyTerminated} TimeBudgetExceeded=${timeBudgetExceeded}`);

                        // Cache and return
                        setCachedSearch(searchString, finalList);
                        resolve(finalList);
                    })
                    .catch(() => {
                        // On any error in targeted passes, return broad results
                        const endTime = Date.now();
                        const duration = endTime - startTime;
                        console.log(`Optimized search (no boost) completed in ${duration}ms. Processed ${processedLines} lines, found ${pubkeys.length} unique pubkeys`);
                        setCachedSearch(searchString, pubkeys);
                        resolve(pubkeys);
                    });
            });
            
            grepProcess.on('error', (error) => {
                console.error(`Optimized search process error: ${error}`);
                reject(error);
            });
        });
    }

    // if searchType == kind0, then use strfry to search
    if (searchType === 'kind0') {
        try {
            // Array to collect promises for parallel execution
            const promises = [];
            promises.push(getAllMatchingKind0Profiles(searchString));
            Promise.all(promises)
                .then(results => {
                    const pubkeys = results[0];
                    if (!pubkeys || pubkeys.length === 0) {
                        return res.json({
                            success: true,
                            message: 'No matching profiles found',
                            pubkeys: []
                        });
                    }
                    return res.json({
                        success: true,
                        message: 'kind0 search results',
                        numPubkeys: pubkeys.length,
                        pubkeys
                    });
                })
                .catch(error => {
                    return res.status(400).json({
                        success: false,
                        message: 'kind0 search failure',
                        error
                    });
                });
        } catch (error) {
            return res.status(400).json({
                success: false,
                message: 'kind0 search failure',
                error
            });
        }
    }
}

module.exports = {
    handleSearchProfiles,
    handleSearchProfilesStream
};

/**
 * Streaming version: /api/search/profiles/stream
 * Streams initial results quickly, then exhaustive results later via SSE
 */
async function handleSearchProfilesStream(req, res) {
    // Validate params before switching to SSE headers
    const searchType = req.query.searchType;
    const searchString = req.query.searchString;

    if (!searchType || !searchString) {
        return res.status(400).json({ success: false, error: 'Missing search parameter; expecting searchType and searchString' });
    }
    if (searchType !== 'kind0') {
        return res.status(400).json({ success: false, error: 'Streaming supported only for searchType=kind0' });
    }

    // Configure long timeout and SSE headers
    req.setTimeout(180000);
    res.setTimeout(180000);
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    });
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    const send = (event, data) => {
        try {
            res.write(`event: ${event}\n`);
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch (_) { /* ignored */ }
    };

    const keepAlive = setInterval(() => {
        try { res.write(': keep-alive\n\n'); } catch (_) { /* ignored */ }
    }, 15000);

    const children = new Set();
    const timers = new Set();
    let finished = false;
    const seen = new Set();
    // Hard cutoff to ensure connections close cleanly even if subprocesses misbehave
    const hardTimeout = setTimeout(() => {
        try { finish('hard_timeout'); } catch (_) { /* noop */ }
    }, STREAM_HARD_TIMEOUT_MS);
    timers.add(hardTimeout);

    function cleanup(clientClosed = false) {
        // Mark finished to stop any further emissions
        finished = true;
        for (const p of Array.from(children)) {
            try { p.kill('SIGTERM'); } catch (_) {}
        }
        for (const t of Array.from(timers)) clearTimeout(t);
        clearInterval(keepAlive);
        if (!clientClosed) {
            try { res.end(); } catch (_) {}
        }
    }

    function finish(reason) {
        if (finished) return;
        finished = true;
        send('done', { reason, total: seen.size });
        cleanup(false);
    }

    req.on('close', () => cleanup(true));

    const maybeEmit = (pk, source) => {
        if (finished) return;
        if (!pk || typeof pk !== 'string') return;
        if (seen.has(pk)) return;
        if (seen.size >= MAX_RESULTS) return finish('max_results');
        seen.add(pk);
        send('result', { pubkey: pk, source });
        if (seen.size >= MAX_RESULTS) finish('max_results');
    };

    const spawnCmd = (cmd) => {
        const p = spawn('sudo', ['bash', '-c', cmd]);
        children.add(p);
        const remove = () => children.delete(p);
        p.on('close', remove);
        p.on('error', remove);
        return p;
    };

    const setBudget = (p, ms) => {
        if (typeof ms !== 'number' || ms <= 0) return null;
        const t = setTimeout(() => { try { if (!p.killed) p.kill('SIGTERM'); } catch (_) {} }, ms);
        timers.add(t);
        return t;
    };
    const clearBudget = (t) => { if (t) { clearTimeout(t); timers.delete(t); } };

    // Helpers (SSE-local)
    const escapeForEventContent = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const buildExactLiteral = (field, value) => `\\\"${field}\\\":\\\"${escapeForEventContent(value)}\\\"`;
    const regexEscape = (s) => s.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
    const buildExactRegex = (field, value) => `\\\"${field}\\\"[[:space:]]*:[[:space:]]*\\\"${regexEscape(value)}\\\"`;
    const buildExactValueLiteral = (value) => `\\\"${escapeForEventContent(value)}\\\"`;

    const runTargetedPassStream = (literal, budgetMs, source) => new Promise((resolve) => {
        const singleQuoted = `'${literal.replace(/'/g, `"'"'`)}'`;
        const cmd = `LC_ALL=C strfry scan '{"kinds":[0]}' | LC_ALL=C grep -iF -m ${TARGETED_GREP_LIMIT} ${singleQuoted}`;
        const p = spawnCmd(cmd);
        let buf = '';
        const localSeen = new Set();
        const timer = setBudget(p, budgetMs);
        p.stdout.on('data', (data) => {
            buf += data.toString();
            const lines = buf.split('\n');
            buf = lines.pop();
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const evt = JSON.parse(line);
                    if (evt && evt.pubkey && !localSeen.has(evt.pubkey)) {
                        localSeen.add(evt.pubkey);
                        maybeEmit(evt.pubkey, source);
                    }
                } catch (_) { /* skip */ }
            }
        });
        p.on('close', () => {
            clearBudget(timer);
            if (buf.trim()) {
                try {
                    const evt = JSON.parse(buf);
                    if (evt && evt.pubkey && !localSeen.has(evt.pubkey)) {
                        maybeEmit(evt.pubkey, source);
                    }
                } catch (_) { /* skip */ }
            }
            resolve();
        });
        p.on('error', () => { clearBudget(timer); resolve(); });
    });

    const runBroadStream = (value, budgetMs) => new Promise((resolve) => {
        const escaped = value.replace(/["'\\$`]/g, '\\$&');
        const cmd = `LC_ALL=C strfry scan '{"kinds":[0]}' | LC_ALL=C grep -iF -m ${MAX_GREP_LINES} "${escaped}"`;
        const p = spawnCmd(cmd);
        let buf = '';
        const timer = setBudget(p, budgetMs);
        p.stdout.on('data', (data) => {
            buf += data.toString();
            const lines = buf.split('\n');
            buf = lines.pop();
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const evt = JSON.parse(line);
                    if (evt && evt.pubkey) {
                        maybeEmit(evt.pubkey, 'broad');
                    }
                } catch (_) { /* skip */ }
            }
        });
        p.on('close', () => {
            clearBudget(timer);
            if (buf.trim()) {
                try {
                    const evt = JSON.parse(buf);
                    if (evt && evt.pubkey) {
                        maybeEmit(evt.pubkey, 'broad');
                    }
                } catch (_) { /* skip */ }
            }
            resolve();
        });
        p.on('error', () => { clearBudget(timer); resolve(); });
    });

    const runExhaustiveTargetedRegexStream = (pattern, budgetMs) => new Promise((resolve) => {
        if (typeof budgetMs === 'number' && budgetMs <= 0) return resolve();
        const singleQuoted = `'${pattern.replace(/'/g, `"'"'`)}'`;
        const cmd = `LC_ALL=C strfry scan '{"kinds":[0]}' | LC_ALL=C grep -iE ${singleQuoted}`;
        const p = spawnCmd(cmd);
        let buf = '';
        const localSeen = new Set();
        const timer = setBudget(p, budgetMs);
        p.stdout.on('data', (data) => {
            buf += data.toString();
            const lines = buf.split('\n');
            buf = lines.pop();
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const evt = JSON.parse(line);
                    if (evt && evt.pubkey && !localSeen.has(evt.pubkey)) {
                        localSeen.add(evt.pubkey);
                        maybeEmit(evt.pubkey, 'exhaustive.regex');
                    }
                } catch (_) { /* skip */ }
            }
        });
        p.on('close', () => {
            clearBudget(timer);
            if (buf.trim()) {
                try {
                    const evt = JSON.parse(buf);
                    if (evt && evt.pubkey && !localSeen.has(evt.pubkey)) {
                        maybeEmit(evt.pubkey, 'exhaustive.regex');
                    }
                } catch (_) { /* skip */ }
            }
            resolve();
        });
        p.on('error', () => { clearBudget(timer); resolve(); });
    });

    const runExhaustiveFixedLiteralStream = (literal, budgetMs) => new Promise((resolve) => {
        if (typeof budgetMs === 'number' && budgetMs <= 0) return resolve();
        const singleQuoted = `'${literal.replace(/'/g, `"'"'`)}'`;
        const cmd = `LC_ALL=C strfry scan '{"kinds":[0]}' | LC_ALL=C grep -iF ${singleQuoted}`;
        const p = spawnCmd(cmd);
        let buf = '';
        const localSeen = new Set();
        const timer = setBudget(p, budgetMs);
        p.stdout.on('data', (data) => {
            buf += data.toString();
            const lines = buf.split('\n');
            buf = lines.pop();
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const evt = JSON.parse(line);
                    if (evt && evt.pubkey && !localSeen.has(evt.pubkey)) {
                        localSeen.add(evt.pubkey);
                        maybeEmit(evt.pubkey, 'exhaustive.literal');
                    }
                } catch (_) { /* skip */ }
            }
        });
        p.on('close', () => {
            clearBudget(timer);
            if (buf.trim()) {
                try {
                    const evt = JSON.parse(buf);
                    if (evt && evt.pubkey && !localSeen.has(evt.pubkey)) {
                        maybeEmit(evt.pubkey, 'exhaustive.literal');
                    }
                } catch (_) { /* skip */ }
            }
            resolve();
        });
        p.on('error', () => { clearBudget(timer); resolve(); });
    });

    // Stream start
    send('start', { searchType, searchString });

    try {
        // Initial phase: targeted + broad in parallel, stream as we parse
        const targetedBudget = (searchString && searchString.length <= 4) ? 4000 : TARGETED_TIME_BUDGET_MS;
        const tp1 = runTargetedPassStream(buildExactLiteral('name', searchString), targetedBudget, 'boost.name');
        const tp2 = runTargetedPassStream(buildExactLiteral('display_name', searchString), targetedBudget, 'boost.display_name');
        const broad = runBroadStream(searchString, TIME_BUDGET_MS);

        await Promise.all([tp1, tp2, broad]);
        send('phase', { phase: 'initial_done', count: seen.size });

        if (finished) return; // may have hit MAX_RESULTS

        // Exhaustive phase with strict 30s budget
        const exStart = Date.now();
        const deadline = exStart + EXHAUSTIVE_BUDGET_MS;
        const sizeBefore = seen.size;
        const patterns = [
            buildExactRegex('name', searchString),
            buildExactRegex('display_name', searchString)
        ];
        const remainForRegex = Math.max(1, deadline - Date.now());
        await Promise.all(patterns.map((patt) => runExhaustiveTargetedRegexStream(patt, remainForRegex)));

        if (finished) return; // may have hit MAX_RESULTS

        const exAdded = seen.size - sizeBefore;
        const remain = Math.max(0, deadline - Date.now());
        if (exAdded === 0 && remain > 0) {
            await runExhaustiveFixedLiteralStream(buildExactValueLiteral(searchString), remain);
        }
        if (!finished) finish('complete');
    } catch (err) {
        send('error', { message: 'streaming search failure', error: String(err && err.message || err) });
        finish('error');
    }
}
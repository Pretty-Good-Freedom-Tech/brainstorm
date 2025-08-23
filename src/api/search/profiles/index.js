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
            
            // Exhaustive targeted helpers (no -m, no time budget)
            const regexEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const buildExactRegex = (field, value) => {
                const v = regexEscape(value);
                return `\\\"${field}\\\"[[:space:]]*:[[:space:]]*\\\"${v}\\\"`;
            };
            const runExhaustiveTargetedRegex = (pattern) => new Promise((resolveTP) => {
                const singleQuoted = `'${pattern.replace(/'/g, `"'"'`)}'`;
                const cmd = `LC_ALL=C strfry scan '{"kinds":[0]}' | LC_ALL=C grep -iE ${singleQuoted}`;
                const p = spawn('sudo', ['bash', '-c', cmd]);
                let buf = '';
                const outPubkeys = [];
                const localSeen = new Set();
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
            const runExhaustiveFixedLiteral = (literal) => new Promise((resolveTP) => {
                const singleQuoted = `'${literal.replace(/'/g, `"'"'`)}'`;
                const cmd = `LC_ALL=C strfry scan '{"kinds":[0]}' | LC_ALL=C grep -iF ${singleQuoted}`;
                const p = spawn('sudo', ['bash', '-c', cmd]);
                let buf = '';
                const outPubkeys = [];
                const localSeen = new Set();
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
                        // If no boosted results, attempt exhaustive targeted fallback (guaranteed full scan)
                        if (boosted.length === 0 && searchString && searchString.length > 0) {
                            console.log(`No targeted boost hits; starting exhaustive targeted scan for: ${searchString}`);
                            try {
                                // Extend request timeout for exhaustive scan (up to 10 minutes)
                                if (req && res && typeof req.setTimeout === 'function' && typeof res.setTimeout === 'function') {
                                    req.setTimeout(600000);
                                    res.setTimeout(600000);
                                }
                            } catch (_) {}

                            const exStart = Date.now();
                            const exPatterns = [
                                buildExactRegex('name', searchString),
                                buildExactRegex('display_name', searchString)
                            ];
                            const exArrays = await Promise.all(exPatterns.map(runExhaustiveTargetedRegex));
                            for (const arr of exArrays) {
                                for (const pk of arr) {
                                    if (!boostSet.has(pk)) {
                                        boostSet.add(pk);
                                        boosted.push(pk);
                                    }
                                }
                            }
                            // As last resort, value-only exact literal across entire dataset
                            if (boosted.length === 0) {
                                const valLiteral = buildExactValueLiteral(searchString);
                                const valArr = await runExhaustiveFixedLiteral(valLiteral);
                                for (const pk of valArr) {
                                    if (!boostSet.has(pk)) {
                                        boostSet.add(pk);
                                        boosted.push(pk);
                                    }
                                }
                            }
                            const exDur = Date.now() - exStart;
                            console.log(`Exhaustive targeted scan done in ${exDur}ms. Found ${boosted.length} boosted pubkeys.`);
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
    handleSearchProfiles
};
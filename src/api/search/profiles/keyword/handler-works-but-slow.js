/**
 * Trust-Filtered Keyword Search for Profiles
 * Endpoint: /api/search/profiles/keyword
 *
 * Performs an optimized keyword search over kind0 events (via strfry + grep)
 * and filters the resulting pubkeys against a whitelist.
 *
 * Whitelist sources:
 * - File (default): /usr/local/lib/strfry/plugins/data/whitelist_pubkeys.json
 * - Neo4j (optional): pass source=neo4j&observerPubkey=<pubkey|owner>
 *
 * Query params:
 * - searchString (required): keyword to search in kind0 content
 * - limit (optional): cap results after filtering (default 60)
 * - source (optional): 'file' (default) or 'neo4j' for whitelist source
 * - observerPubkey (optional): used for both sources; selects which precomputed map/observer to use (default 'owner')
 * - failOpen (optional): if true and whitelist missing, return unfiltered results (default false)
 */

const fs = require('fs');
const { spawn } = require('child_process');
const neo4j = require('neo4j-driver');
const { getNeo4jConnection } = require('../../../../utils/config');
const { getPrecomputedForObserver, refreshWhitelistMapForObserver, PRECOMPUTE_TTL_MS } = require('../whitelistPrecompute');

// --- Performance constants (aligned with legacy optimized search) ---
const SEARCH_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const WHITELIST_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_RESULTS = 500;
const MAX_GREP_LINES = 200;
const TIME_BUDGET_MS = 2500;
const TARGETED_GREP_LIMIT = 50;
const TARGETED_TIME_BUDGET_MS = 1500;
const EXHAUSTIVE_BUDGET_MS = 30000;

// --- Caches ---
const searchCache = new Map(); // key: searchString.toLowerCase(), val: { results, ts }
const whitelistCache = {
  file: { set: null, ts: 0, mtimeMs: 0 },
  neo4j: new Map() // key: observerPubkey, val: { set, ts }
};

// --- Whitelist Loading ---
async function loadWhitelist({ source = 'file', observerPubkey = 'owner' } = {}) {
  const wlStart = Date.now();
  if (source !== 'neo4j') {
    // Prefer precomputed in-memory whitelist map (built from Neo4j) for file source
    try {
      const observerNorm = (observerPubkey && observerPubkey !== 'owner') ? String(observerPubkey).toLowerCase() : 'owner';
      const pre = getPrecomputedForObserver(observerNorm, { maxAgeMs: PRECOMPUTE_TTL_MS });
      if (pre && pre.set && pre.set.size > 0) {
        // annotate debug info on the Set object (non-enumerable in JSON usage)
        pre.set._wlSource = observerNorm === 'owner' ? 'precomputed:owner' : 'precomputed:observer';
        pre.set._wlLoadMs = Date.now() - wlStart;
        pre.set._wlPreTs = pre.ts;
        pre.set._wlPreAgeMs = Date.now() - pre.ts;
        pre.set._wlMetricsCount = pre.metricsByPubkey ? Object.keys(pre.metricsByPubkey).length : 0;
        return pre.set;
      }
      // If not fresh, attempt to refresh from Neo4j synchronously as a fallback
      try {
        const refreshed = await refreshWhitelistMapForObserver(observerNorm, { force: true });
        if (refreshed && refreshed.set && refreshed.set.size > 0) {
          refreshed.set._wlSource = observerNorm === 'owner' ? 'precomputeRefresh:owner' : 'precomputeRefresh:observer';
          refreshed.set._wlLoadMs = Date.now() - wlStart;
          refreshed.set._wlPreTs = refreshed.ts;
          refreshed.set._wlPreAgeMs = Date.now() - refreshed.ts;
          refreshed.set._wlMetricsCount = refreshed.metricsByPubkey ? Object.keys(refreshed.metricsByPubkey).length : 0;
          return refreshed.set;
        }
      } catch (e) {
        console.warn('KeywordSearch: precompute refresh failed, falling back to file whitelist:', e && e.message || e);
      }
    } catch (e) {
      console.warn('KeywordSearch: precompute access failed, falling back to file whitelist:', e && e.message || e);
    }

    // Fallback to owner precomputed map if observer-specific map unavailable
    try {
      const ownerPre = getPrecomputedForObserver('owner', { maxAgeMs: PRECOMPUTE_TTL_MS });
      if (ownerPre && ownerPre.set && ownerPre.set.size > 0) {
        ownerPre.set._wlSource = 'precomputed:owner';
        ownerPre.set._wlLoadMs = Date.now() - wlStart;
        ownerPre.set._wlPreTs = ownerPre.ts;
        ownerPre.set._wlPreAgeMs = Date.now() - ownerPre.ts;
        ownerPre.set._wlMetricsCount = ownerPre.metricsByPubkey ? Object.keys(ownerPre.metricsByPubkey).length : 0;
        return ownerPre.set;
      }
      // Attempt a synchronous refresh for owner as a last resort before file
      try {
        const ownerRefreshed = await refreshWhitelistMapForObserver('owner', { force: true });
        if (ownerRefreshed && ownerRefreshed.set && ownerRefreshed.set.size > 0) {
          ownerRefreshed.set._wlSource = 'precomputeRefresh:owner';
          ownerRefreshed.set._wlLoadMs = Date.now() - wlStart;
          ownerRefreshed.set._wlPreTs = ownerRefreshed.ts;
          ownerRefreshed.set._wlPreAgeMs = Date.now() - ownerRefreshed.ts;
          ownerRefreshed.set._wlMetricsCount = ownerRefreshed.metricsByPubkey ? Object.keys(ownerRefreshed.metricsByPubkey).length : 0;
          return ownerRefreshed.set;
        }
      } catch (_) {
        // ignore and fall through to file
      }
    } catch (_) {
      // ignore and fall through to file
    }

    const whitelistPath = '/usr/local/lib/strfry/plugins/data/whitelist_pubkeys.json';
    try {
      const stats = fs.existsSync(whitelistPath) ? fs.statSync(whitelistPath) : null;
      const now = Date.now();
      if (
        whitelistCache.file.set &&
        now - whitelistCache.file.ts < WHITELIST_CACHE_TTL &&
        stats && stats.mtimeMs === whitelistCache.file.mtimeMs
      ) {
        return whitelistCache.file.set;
      }
      if (!stats) {
        return null; // file not present
      }
      const content = fs.readFileSync(whitelistPath, 'utf8');
      const json = JSON.parse(content);
      let set;
      if (Array.isArray(json)) {
        // Support array form: ["pubkey1", "pubkey2", ...]
        set = new Set(json.map(pk => typeof pk === 'string' ? pk.toLowerCase() : pk));
      } else if (json && typeof json === 'object') {
        // Support map form: { "pubkey1": true, ... } (default)
        // Also support nested { pubkeys: [ ... ] }
        if (Array.isArray(json.pubkeys)) {
          set = new Set(json.pubkeys.map(pk => typeof pk === 'string' ? pk.toLowerCase() : pk));
        } else {
          set = new Set(Object.keys(json).map(pk => typeof pk === 'string' ? pk.toLowerCase() : pk));
        }
      } else {
        set = new Set();
      }
      whitelistCache.file = { set, ts: now, mtimeMs: stats.mtimeMs };
      set._wlSource = 'file:disk';
      set._wlLoadMs = Date.now() - wlStart;
      set._wlMetricsCount = 0;
      return set;
    } catch (err) {
      console.error('KeywordSearch: failed to load whitelist file:', err && err.message || err);
      return null;
    }
  }

  // Neo4j-backed whitelist
  try {
    const now = Date.now();
    const cached = whitelistCache.neo4j.get(observerPubkey);
    if (cached && now - cached.ts < WHITELIST_CACHE_TTL) return cached.set;

    const { uri, user, password } = getNeo4jConnection();
    const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
    const session = driver.session();

    const cypher = observerPubkey === 'owner'
      ? `MATCH (u:NostrUser) WHERE u.pubkey IS NOT NULL AND u.influence > 0.01 RETURN u.pubkey AS pubkey, u.influence AS influence, toFloat(coalesce(u.verifiedFollowerCount, 0)) AS verifiedFollowerCount, coalesce(u.verifiedMuterCount, 0) AS verifiedMuterCount, coalesce(u.verifiedReporterCount, 0) AS verifiedReporterCount ORDER BY verifiedFollowerCount DESC`
      : `MATCH (u:NostrUserWotMetricsCard {observer_pubkey: $observer}) WHERE u.observee_pubkey IS NOT NULL AND u.influence > 0.01 RETURN u.observee_pubkey AS pubkey, u.influence AS influence, toFloat(coalesce(u.verifiedFollowerCount, 0)) AS verifiedFollowerCount, coalesce(u.verifiedMuterCount, 0) AS verifiedMuterCount, coalesce(u.verifiedReporterCount, 0) AS verifiedReporterCount ORDER BY verifiedFollowerCount DESC`;

    const result = await session.run(cypher, { observer: observerPubkey });
    const scoreByPubkey = {};
    const metricsByPubkey = {};
    const setVals = [];
    for (const r of result.records) {
      const v = r.get('pubkey');
      const k = typeof v === 'string' ? v.toLowerCase() : v;
      const influence = r.get('influence');
      const vf = r.get('verifiedFollowerCount');
      const vm = r.get('verifiedMuterCount');
      const vr = r.get('verifiedReporterCount');
      const numInfluence = typeof influence === 'number' ? influence : Number(influence || 0);
      const numVf = typeof vf === 'number' ? vf : Number(vf || 0);
      const numVm = typeof vm === 'number' ? vm : Number(vm || 0);
      const numVr = typeof vr === 'number' ? vr : Number(vr || 0);
      scoreByPubkey[k] = numVf;
      metricsByPubkey[k] = { influence: numInfluence, verifiedFollowerCount: numVf, verifiedMuterCount: numVm, verifiedReporterCount: numVr };
      setVals.push(k);
    }
    const set = new Set(setVals);
    await session.close();
    await driver.close();

    whitelistCache.neo4j.set(observerPubkey, { set, ts: now, scoreByPubkey, metricsByPubkey });
    set._wlSource = 'neo4j:direct';
    set._wlLoadMs = Date.now() - wlStart;
    set._wlMetricsCount = Object.keys(metricsByPubkey).length;
    return set;
  } catch (err) {
    console.error('KeywordSearch: failed to load whitelist from Neo4j:', err && err.message || err);
    return null;
  }
}

// --- Optimized Kind0 Search (non-streaming) ---
function getAllMatchingKind0Profiles(searchString) {
  return new Promise((resolve, reject) => {
    if (!searchString || !searchString.trim()) return resolve([]);

    // Cache lookup
    const key = searchString.toLowerCase();
    const cached = searchCache.get(key);
    if (cached && Date.now() - cached.ts < SEARCH_CACHE_TTL) {
      return resolve(cached.results);
    }

    const startTime = Date.now();
    const escapeForEventContent = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const buildExactLiteral = (field, value) => `\\\"${field}\\\":\\\"${escapeForEventContent(value)}\\\"`;
    const regexEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const buildExactRegex = (field, value) => `\\\"${field}\\\"[[:space:]]*:[[:space:]]*\\\"${regexEscape(value)}\\\"`;
    const buildExactValueLiteral = (value) => `\\\"${escapeForEventContent(value)}\\\"`;

    const runTargetedPass = (literal, budgetMs) => new Promise((resolveTP) => {
      const singleQuoted = `'${literal.replace(/'/g, `"'"'`)}'`;
      const cmd = `LC_ALL=C strfry scan '{"kinds":[0]}' | LC_ALL=C grep -iF -m ${TARGETED_GREP_LIMIT} ${singleQuoted}`;
      const p = spawn('sudo', ['bash', '-c', cmd]);
      let buf = '';
      const out = [];
      const seen = new Set();
      const timer = setTimeout(() => { try { if (!p.killed) p.kill('SIGTERM'); } catch (_) {} }, budgetMs);
      p.stdout.on('data', (d) => {
        buf += d.toString();
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const evt = JSON.parse(line);
            if (evt && evt.pubkey && !seen.has(evt.pubkey)) { seen.add(evt.pubkey); out.push(evt.pubkey); }
          } catch (_) {}
        }
      });
      p.on('close', () => {
        clearTimeout(timer);
        if (buf.trim()) {
          try { const evt = JSON.parse(buf); if (evt && evt.pubkey && !seen.has(evt.pubkey)) out.push(evt.pubkey); } catch (_) {}
        }
        resolveTP(out);
      });
      p.on('error', () => resolveTP([]));
    });

    const runExhaustiveTargetedRegex = (pattern, budgetMs) => new Promise((resolveTP) => {
      if (typeof budgetMs === 'number' && budgetMs <= 0) return resolveTP([]);
      const singleQuoted = `'${pattern.replace(/'/g, `"'"'`)}'`;
      const cmd = `LC_ALL=C strfry scan '{"kinds":[0]}' | LC_ALL=C grep -iE ${singleQuoted}`;
      const p = spawn('sudo', ['bash', '-c', cmd]);
      let buf = '';
      const out = [];
      const seen = new Set();
      const timer = typeof budgetMs === 'number' ? setTimeout(() => { try { if (!p.killed) p.kill('SIGTERM'); } catch (_) {} }, budgetMs) : null;
      p.stdout.on('data', (d) => {
        buf += d.toString();
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          try { const evt = JSON.parse(line); if (evt && evt.pubkey && !seen.has(evt.pubkey)) { seen.add(evt.pubkey); out.push(evt.pubkey); } } catch (_) {}
        }
      });
      p.on('close', () => {
        if (timer) clearTimeout(timer);
        if (buf.trim()) { try { const evt = JSON.parse(buf); if (evt && evt.pubkey && !seen.has(evt.pubkey)) out.push(evt.pubkey); } catch (_) {} }
        resolveTP(out);
      });
      p.on('error', () => resolveTP([]));
    });

    const runExhaustiveFixedLiteral = (literal, budgetMs) => new Promise((resolveTP) => {
      if (typeof budgetMs === 'number' && budgetMs <= 0) return resolveTP([]);
      const singleQuoted = `'${literal.replace(/'/g, `"'"'`)}'`;
      const cmd = `LC_ALL=C strfry scan '{"kinds":[0]}' | LC_ALL=C grep -iF ${singleQuoted}`;
      const p = spawn('sudo', ['bash', '-c', cmd]);
      let buf = '';
      const out = [];
      const seen = new Set();
      const timer = typeof budgetMs === 'number' ? setTimeout(() => { try { if (!p.killed) p.kill('SIGTERM'); } catch (_) {} }, budgetMs) : null;
      p.stdout.on('data', (d) => {
        buf += d.toString();
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          try { const evt = JSON.parse(line); if (evt && evt.pubkey && !seen.has(evt.pubkey)) { seen.add(evt.pubkey); out.push(evt.pubkey); } } catch (_) {}
        }
      });
      p.on('close', () => {
        if (timer) clearTimeout(timer);
        if (buf.trim()) { try { const evt = JSON.parse(buf); if (evt && evt.pubkey && !seen.has(evt.pubkey)) out.push(evt.pubkey); } catch (_) {} }
        resolveTP(out);
      });
      p.on('error', () => resolveTP([]));
    });

    // Targeted passes with dynamic budget for short queries
    const targetedBudget = (searchString && searchString.length <= 4) ? 4000 : TARGETED_TIME_BUDGET_MS;
    const tpPromises = [
      runTargetedPass(buildExactLiteral('name', searchString), targetedBudget),
      runTargetedPass(buildExactLiteral('display_name', searchString), targetedBudget)
    ];

    // Broad prefilter via grep to reduce JSON parsing
    const escapedSearchString = searchString.replace(/["'\\$`]/g, '\\$&');
    const cmdArgs = ['bash', '-c', `LC_ALL=C strfry scan '{"kinds":[0]}' | LC_ALL=C grep -iF -m ${MAX_GREP_LINES} "${escapedSearchString}"`];
    const p = spawn('sudo', cmdArgs);

    let buffer = '';
    const pubkeys = [];
    const seen = new Set();
    let processedLines = 0;
    let earlyTerminated = false;
    let timeBudgetExceeded = false;

    const budgetTimer = setTimeout(() => {
      if (!p.killed) {
        try { p.kill('SIGTERM'); } catch (_) {}
        timeBudgetExceeded = true;
      }
    }, TIME_BUDGET_MS);

    p.stdout.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        processedLines++;
        if (pubkeys.length >= MAX_RESULTS) {
          try { p.kill('SIGTERM'); } catch (_) {}
          earlyTerminated = true;
          break;
        }
        try {
          const evt = JSON.parse(line);
          if (evt && evt.pubkey && !seen.has(evt.pubkey)) { seen.add(evt.pubkey); pubkeys.push(evt.pubkey); }
        } catch (_) {}
      }
    });

    p.stderr.on('data', (d) => {
      console.error(`Keyword optimized search error: ${d}`);
    });

    p.on('close', async () => {
      clearTimeout(budgetTimer);
      if (buffer.trim() && pubkeys.length < MAX_RESULTS) {
        try { const evt = JSON.parse(buffer); if (evt && evt.pubkey && !seen.has(evt.pubkey)) pubkeys.push(evt.pubkey); } catch (_) {}
      }

      try {
        const tpArrays = await Promise.all(tpPromises);
        const boosted = [];
        const boostSet = new Set();
        for (const arr of tpArrays) {
          for (const pk of arr) { if (!boostSet.has(pk)) { boostSet.add(pk); boosted.push(pk); } }
        }

        // Exhaustive pass within a fixed budget
        if (searchString && searchString.length > 0) {
          const deadline = Date.now() + EXHAUSTIVE_BUDGET_MS;
          const patterns = [
            buildExactRegex('name', searchString),
            buildExactRegex('display_name', searchString)
          ];
          const remainForRegex = Math.max(1, deadline - Date.now());
          const exArrays = await Promise.all(patterns.map((p) => runExhaustiveTargetedRegex(p, remainForRegex)));
          let added = 0;
          for (const arr of exArrays) for (const pk of arr) if (!boostSet.has(pk)) { boostSet.add(pk); boosted.push(pk); added++; }
          const remain = Math.max(0, deadline - Date.now());
          if (added === 0 && remain > 0) {
            const valLiteral = buildExactValueLiteral(searchString);
            const valArr = await runExhaustiveFixedLiteral(valLiteral, remain);
            for (const pk of valArr) if (!boostSet.has(pk)) { boostSet.add(pk); boosted.push(pk); }
          }
        }

        const finalList = [];
        for (const pk of boosted) { if (finalList.length >= MAX_RESULTS) break; finalList.push(pk); }
        for (const pk of pubkeys) { if (finalList.length >= MAX_RESULTS) break; if (!finalList.includes(pk)) finalList.push(pk); }

        searchCache.set(key, { results: finalList, ts: Date.now() });
        const duration = Date.now() - startTime;
        // annotate debug info on array object for handler to surface when debug=true
        try {
          finalList._searchMs = duration;
          finalList._processedLines = processedLines;
          finalList._earlyTerminated = earlyTerminated;
          finalList._timeBudgetExceeded = timeBudgetExceeded;
        } catch (_) {}
        console.log(`Keyword optimized search completed in ${duration}ms. Processed ${processedLines} lines. Final=${finalList.length}. EarlyTerminated=${earlyTerminated} TimeBudgetExceeded=${timeBudgetExceeded}`);
        resolve(finalList);
      } catch (e) {
        reject(e);
      }
    });

    p.on('error', (err) => {
      reject(err);
    });
  });
}

// --- HTTP Handler ---
async function handleKeywordSearchProfiles(req, res) {
  try {
    req.setTimeout(180000);
    res.setTimeout(180000);

    const searchString = req.query.searchString || req.query.q;
    const limit = Math.max(1, Math.min(parseInt(req.query.limit || `${MAX_RESULTS}`, 10) || MAX_RESULTS, MAX_RESULTS));
    const source = (req.query.source || 'file').toLowerCase(); // 'file' | 'neo4j'
    const observerPubkey = req.query.observerPubkey || 'owner';
    const failOpen = String(req.query.failOpen || 'false').toLowerCase() === 'true';
    const debug = String(req.query.debug || 'false').toLowerCase() === 'true';

    const reqStart = Date.now();

    if (!searchString) {
      return res.status(400).json({ success: false, error: 'Missing searchString' });
    }

    const [allPubkeys, whitelistSet] = await Promise.all([
      getAllMatchingKind0Profiles(searchString),
      loadWhitelist({ source, observerPubkey })
    ]);

    const missingOrEmpty = (!whitelistSet) || (whitelistSet && whitelistSet.size === 0);
    if (missingOrEmpty) {
      let note;
      if (!whitelistSet) {
        note = source === 'file' ? 'Whitelist file missing or unreadable' : 'Whitelist query to Neo4j failed';
      } else {
        note = source === 'file' ? 'Whitelist file is empty' : 'Whitelist from Neo4j is empty';
      }
      if (!failOpen) {
        return res.json({ success: true, message: note, counts: { beforeFilter: allPubkeys.length, afterFilter: 0, whitelistSize: whitelistSet ? whitelistSet.size : 0 }, pubkeys: [] });
      }
      // Fail-open mode: return unfiltered results (capped)
      return res.json({ success: true, message: `${note} (failOpen=true)`, counts: { beforeFilter: allPubkeys.length, afterFilter: Math.min(allPubkeys.length, limit), whitelistSize: whitelistSet ? whitelistSet.size : 0 }, pubkeys: allPubkeys.slice(0, limit) });
    }

    const filteredAll = [];
    const filterStart = Date.now();
    for (const pk of allPubkeys) {
      const pkLower = typeof pk === 'string' ? pk.toLowerCase() : pk;
      if (whitelistSet.has(pkLower)) {
        filteredAll.push(pk);
      }
    }
    const filterMs = Date.now() - filterStart;

    // Sort by verifiedFollowerCount desc when possible before applying limit
    let ordered = filteredAll;
    let sortMs = 0;
    const sortStart = Date.now();
    if (source === 'neo4j') {
      const cachedWL = whitelistCache.neo4j.get(observerPubkey);
      const vfMap = (cachedWL && cachedWL.scoreByPubkey) || {};
      ordered = filteredAll.slice().sort((a, b) => {
        const al = typeof a === 'string' ? a.toLowerCase() : a;
        const bl = typeof b === 'string' ? b.toLowerCase() : b;
        const av = typeof vfMap[al] === 'number' ? vfMap[al] : Number(vfMap[al] || 0);
        const bv = typeof vfMap[bl] === 'number' ? vfMap[bl] : Number(vfMap[bl] || 0);
        if (bv !== av) return bv - av;
        return 0;
      });
    } else {
    // source === 'file': use precomputed map if available to improve ordering
    const observerNorm = (observerPubkey && observerPubkey !== 'owner') ? String(observerPubkey).toLowerCase() : 'owner';
    let pre = getPrecomputedForObserver(observerNorm);
    if ((!pre || !pre.scoreByPubkey) && observerNorm !== 'owner') {
      pre = getPrecomputedForObserver('owner');
    }
    const vfMap = (pre && pre.scoreByPubkey) || null;
    if (vfMap) {
      ordered = filteredAll.slice().sort((a, b) => {
        const al = typeof a === 'string' ? a.toLowerCase() : a;
        const bl = typeof b === 'string' ? b.toLowerCase() : b;
        const av = typeof vfMap[al] === 'number' ? vfMap[al] : Number(vfMap[al] || 0);
        const bv = typeof vfMap[bl] === 'number' ? vfMap[bl] : Number(vfMap[bl] || 0);
        if (bv !== av) return bv - av;
        return 0;
      });
    }
  }
  sortMs = Date.now() - sortStart;
  const limited = ordered.slice(0, limit);

    // Include inline scores when using Neo4j source to avoid N+1 score requests from the frontend
    let profiles = null;
    if (source === 'neo4j') {
      const cachedWL = whitelistCache.neo4j.get(observerPubkey);
      const metricsMap = (cachedWL && cachedWL.metricsByPubkey) || {};
      profiles = limited.map((pk) => {
        const key = typeof pk === 'string' ? pk.toLowerCase() : pk;
        const s = metricsMap[key] || { influence: 0, verifiedFollowerCount: 0, verifiedMuterCount: 0, verifiedReporterCount: 0 };
        return { pubkey: pk, scores: s };
      });
    }

    const totalMs = Date.now() - reqStart;
    const base = {
      success: true,
      message: 'trust-filtered keyword search results',
      query: { searchString, source, observerPubkey, limit },
      counts: { beforeFilter: allPubkeys.length, afterFilter: limited.length, whitelistSize: whitelistSet.size },
      pubkeys: limited,
      ...(profiles ? { profiles } : {})
    };
    if (debug) {
      base.debug = {
        totalMs,
        kind0Search: {
          ms: (allPubkeys && typeof allPubkeys._searchMs === 'number') ? allPubkeys._searchMs : null,
          processedLines: allPubkeys && allPubkeys._processedLines,
          earlyTerminated: allPubkeys && allPubkeys._earlyTerminated,
          timeBudgetExceeded: allPubkeys && allPubkeys._timeBudgetExceeded
        },
        whitelist: {
          source: whitelistSet && whitelistSet._wlSource,
          loadMs: whitelistSet && whitelistSet._wlLoadMs,
          size: whitelistSet ? whitelistSet.size : 0,
          preTs: whitelistSet && whitelistSet._wlPreTs,
          preAgeMs: whitelistSet && whitelistSet._wlPreAgeMs,
          metricsCount: whitelistSet && whitelistSet._wlMetricsCount
        },
        filterMs,
        sortMs
      };
    }
    return res.json(base);
  } catch (error) {
    console.error('KeywordSearch: handler error:', error);
    return res.status(500).json({ success: false, error: error.message || String(error) });
  }
}

module.exports = {
  handleKeywordSearchProfiles
};

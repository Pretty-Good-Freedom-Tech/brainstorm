/**
 * Whitelist Precompute Module
 * Builds and caches in-memory whitelist maps from Neo4j for the owner and customers.
 * Exposes an API handler to trigger refreshes.
 */

const neo4j = require('neo4j-driver');
const { getNeo4jConnection, getOwnerPubkey } = require('../../../utils/config');
const CustomerManager = require('../../../utils/customerManager');

// TTL for precomputed cache
const PRECOMPUTE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Map<observerPubkey, { set: Set<string>, scoreByPubkey: Object, metricsByPubkey: Object, ts: number }>
const precomputed = new Map();

// Map<observerPubkey, Promise>
const inFlight = new Map();

function isFresh(entry, ttl = PRECOMPUTE_TTL_MS) {
  return !!entry && typeof entry.ts === 'number' && (Date.now() - entry.ts) < ttl;
}

function getPrecomputedForObserver(observerPubkey, opts = {}) {
  const ttl = typeof opts.maxAgeMs === 'number' ? opts.maxAgeMs : PRECOMPUTE_TTL_MS;
  const key = observerPubkey || 'owner';
  const entry = precomputed.get(key);
  return isFresh(entry, ttl) ? entry : null;
}

async function fetchFromNeo4j(observerPubkey) {
  const { uri, user, password } = getNeo4jConnection();
  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  const session = driver.session();
  try {
    const key = observerPubkey || 'owner';
    const isOwner = key === 'owner' || key === (getOwnerPubkey() || '').toLowerCase();

    const cypher = isOwner
      ? `MATCH (u:NostrUser)
         WHERE u.pubkey IS NOT NULL AND toFloat(coalesce(u.influence, 0)) > 0.01
         RETURN u.pubkey AS pubkey,
                toFloat(coalesce(u.influence, 0)) AS influence,
                toFloat(coalesce(u.verifiedFollowerCount, 0)) AS verifiedFollowerCount,
                toFloat(coalesce(u.verifiedMuterCount, 0)) AS verifiedMuterCount,
                toFloat(coalesce(u.verifiedReporterCount, 0)) AS verifiedReporterCount
         ORDER BY verifiedFollowerCount DESC`
      : `MATCH (u:NostrUserWotMetricsCard {observer_pubkey: $observer})
         WHERE u.observee_pubkey IS NOT NULL AND toFloat(coalesce(u.influence, 0)) > 0.01
         RETURN u.observee_pubkey AS pubkey,
                toFloat(coalesce(u.influence, 0)) AS influence,
                toFloat(coalesce(u.verifiedFollowerCount, 0)) AS verifiedFollowerCount,
                toFloat(coalesce(u.verifiedMuterCount, 0)) AS verifiedMuterCount,
                toFloat(coalesce(u.verifiedReporterCount, 0)) AS verifiedReporterCount
         ORDER BY verifiedFollowerCount DESC`;

    const params = isOwner ? {} : { observer: key };
    const result = await session.run(cypher, params);

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
      metricsByPubkey[k] = {
        influence: numInfluence,
        verifiedFollowerCount: numVf,
        verifiedMuterCount: numVm,
        verifiedReporterCount: numVr
      };
      setVals.push(k);
    }
    const set = new Set(setVals);
    const entry = { set, scoreByPubkey, metricsByPubkey, ts: Date.now() };
    precomputed.set(key, entry);
    return entry;
  } finally {
    await session.close();
    await driver.close();
  }
}

async function refreshWhitelistMapForObserver(observerPubkey, opts = {}) {
  const key = observerPubkey || 'owner';
  const force = !!opts.force;
  const existing = precomputed.get(key);
  if (!force && isFresh(existing, opts.maxAgeMs || PRECOMPUTE_TTL_MS)) {
    return existing;
  }
  if (inFlight.has(key)) return inFlight.get(key);
  const p = fetchFromNeo4j(key)
    .catch((err) => {
      console.error('Precompute: failed to refresh for', key, err && err.message || err);
      throw err;
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, p);
  return p;
}

async function refreshAllWhitelistMaps(opts = {}) {
  const results = [];
  const ownerKey = (getOwnerPubkey() || '').toLowerCase();
  const observers = new Set();
  observers.add('owner');
  if (ownerKey) observers.add(ownerKey);

  try {
    const cm = new CustomerManager();
    await cm.initialize();
    const customers = await cm.listActiveCustomers();
    for (const c of customers) {
      const obs = (c && (c.observer_id || c.pubkey) || '').toLowerCase();
      if (obs) observers.add(obs);
    }
  } catch (e) {
    console.warn('Precompute: unable to enumerate customers (continuing with owner only):', e && e.message || e);
  }

  for (const obs of observers) {
    try {
      const entry = await refreshWhitelistMapForObserver(obs, opts);
      results.push({ observerPubkey: obs, size: entry.set.size });
    } catch (err) {
      results.push({ observerPubkey: obs, error: err && err.message || String(err) });
    }
  }
  return results;
}

// API handler
async function handlePrecomputeWhitelistMaps(req, res) {
  try {
    req.setTimeout(180000);
    res.setTimeout(180000);

    const observer = (req.query.observerPubkey || '').toLowerCase();
    const force = String(req.query.force || 'false').toLowerCase() === 'true';
    let summary;

    if (observer) {
      const entry = await refreshWhitelistMapForObserver(observer, { force });
      summary = [{ observerPubkey: observer, size: entry.set.size }];
    } else {
      summary = await refreshAllWhitelistMaps({ force });
    }

    res.json({ success: true, refreshedAt: Date.now(), summary });
  } catch (error) {
    console.error('Precompute API error:', error);
    res.status(500).json({ success: false, error: error.message || String(error) });
  }
}

// Read-only status endpoint: returns current in-memory precomputed maps without refreshing
async function handlePrecomputeWhitelistStatus(req, res) {
  try {
    const now = Date.now();
    const observerFilter = (req.query.observerPubkey || '').toLowerCase();
    const observers = [];
    for (const [observerPubkey, entry] of precomputed.entries()) {
      if (observerFilter && observerPubkey !== observerFilter) continue;
      const ts = entry && typeof entry.ts === 'number' ? entry.ts : 0;
      const ageMs = ts ? now - ts : null;
      observers.push({
        observerPubkey,
        size: entry && entry.set ? entry.set.size : 0,
        ts,
        ageMs,
        fresh: isFresh(entry),
        metricsCount: entry && entry.metricsByPubkey ? Object.keys(entry.metricsByPubkey).length : 0
      });
    }
    res.json({
      success: true,
      checkedAt: now,
      ttlMs: PRECOMPUTE_TTL_MS,
      inFlight: Array.from(inFlight.keys()),
      observers
    });
  } catch (error) {
    console.error('Precompute Status API error:', error);
    res.status(500).json({ success: false, error: error.message || String(error) });
  }
}

module.exports = {
  PRECOMPUTE_TTL_MS,
  getPrecomputedForObserver,
  refreshWhitelistMapForObserver,
  refreshAllWhitelistMaps,
  handlePrecomputeWhitelistMaps,
  handlePrecomputeWhitelistStatus,
  // Expose raw map for introspection if needed
  _precomputed: precomputed
};

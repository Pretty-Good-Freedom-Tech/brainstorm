/**
 * List Restore Sets API Handler
 * GET /api/restore/sets
 *
 * Returns a list of extracted restore sets and the customers available in each set.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { defaultRestoreSetsDir } = require('../commands/restore-upload.js');
const CustomerManager = require('../../../utils/customerManager.js');
const { getCustomerRelayKeys } = require('../../../utils/customerRelayKeys.js');

function ensureDir(p) {
  try { fs.mkdirSync(p, { recursive: true }); } catch (_) { /* ignore */ }
}

async function parseCustomersFromSet(setDir) {
  try {
    const file = path.join(setDir, 'customers.json');
    if (!fs.existsSync(file)) return [];
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    const customers = json && json.customers ? json.customers : {};
    const results = [];
    for (const [name, c] of Object.entries(customers)) {
      results.push({
        name,
        pubkey: c && c.pubkey || null,
        directory: c && c.directory || null,
        id: c && c.id || null,
        display_name: c && (c.display_name || c.name) || name,
        lastModified: c && c.lastModified || null
      });
    }
    return results;
  } catch (_) {
    return [];
  }
}

function parseSecureKeysManifest(setDir) {
  try {
    const p = path.join(setDir, 'secure-keys-manifest.json');
    if (!fs.existsSync(p)) return { byPubkey: new Map() };
    const json = JSON.parse(fs.readFileSync(p, 'utf8'));
    const arr = Array.isArray(json.customers) ? json.customers : [];
    const byPubkey = new Map();
    for (const item of arr) {
      if (item && item.customer_pubkey) {
        byPubkey.set(item.customer_pubkey, {
          relay_pubkey: item.relay_pubkey || null,
          name: item.name || null,
          id: item.id || null
        });
      }
    }
    return { byPubkey };
  } catch (_) {
    return { byPubkey: new Map() };
  }
}

async function handleListRestoreSets(req, res) {
  try {
    const baseDir = defaultRestoreSetsDir();
    ensureDir(baseDir);
    const names = fs.readdirSync(baseDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    // Load existing customers once
    const cm = new CustomerManager();
    try { if (typeof cm.initialize === 'function') await cm.initialize(); } catch (_) {}
    let existingAll = { customers: {} };
    try { existingAll = await cm.getAllCustomers(); } catch (_) {}
    const existingByPubkey = new Map();
    for (const [n, c] of Object.entries(existingAll.customers || {})) {
      if (c && c.pubkey) {
        existingByPubkey.set(c.pubkey, { 
          name: n,
          display_name: c.display_name || c.name || n,
          lastModified: c.lastModified || null,
          directory: c.directory || null,
          id: c.id || null
        });
      }
    }

    const sets = [];
    for (const name of names) {
      const dir = path.join(baseDir, name);
      let stat = null;
      try { stat = fs.statSync(dir); } catch (_) { continue; }
      const customers = await parseCustomersFromSet(dir);
      const keys = parseSecureKeysManifest(dir);

      // Enrich with extracted relay key and existing install comparison
      const enriched = [];
      for (const cust of customers) {
        const pubkey = cust.pubkey || null;
        const extractedKey = pubkey ? (keys.byPubkey.get(pubkey) || null) : null;

        const existing = pubkey && existingByPubkey.has(pubkey) ? existingByPubkey.get(pubkey) : null;
        let existingRelayPubkey = null;
        if (existing && pubkey) {
          try {
            const rk = await getCustomerRelayKeys(pubkey);
            existingRelayPubkey = rk && rk.pubkey ? rk.pubkey : null;
          } catch (_) { /* ignore */ }
        }

        const extractedRelayPubkey = extractedKey && extractedKey.relay_pubkey ? extractedKey.relay_pubkey : null;
        const relay_pubkey_equal = !!(extractedRelayPubkey && existingRelayPubkey && extractedRelayPubkey === existingRelayPubkey);

        enriched.push({
          name: cust.name,
          directory: cust.directory,
          id: cust.id,
          pubkey: pubkey,
          display_name: cust.display_name,
          lastModified: cust.lastModified,
          extracted: {
            relay_pubkey: extractedRelayPubkey
          },
          existing: existing ? {
            exists: true,
            name: existing.name,
            display_name: existing.display_name,
            lastModified: existing.lastModified,
            relay_pubkey: existingRelayPubkey,
            relay_pubkey_equal
          } : {
            exists: false
          }
        });
      }

      sets.push({ name, mtimeMs: stat.mtimeMs, customers: enriched });
    }
    sets.sort((a, b) => b.mtimeMs - a.mtimeMs);

    return res.json({ success: true, baseDir, sets });
  } catch (error) {
    console.error('Error listing restore sets:', error);
    return res.status(500).json({ success: false, error: 'Failed to list restore sets' });
  }
}

module.exports = { handleListRestoreSets };


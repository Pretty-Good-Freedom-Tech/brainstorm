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
        id: c && c.id || null
      });
    }
    return results;
  } catch (_) {
    return [];
  }
}

async function handleListRestoreSets(req, res) {
  try {
    const baseDir = defaultRestoreSetsDir();
    ensureDir(baseDir);
    const names = fs.readdirSync(baseDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    const sets = [];
    for (const name of names) {
      const dir = path.join(baseDir, name);
      let stat = null;
      try { stat = fs.statSync(dir); } catch (_) { continue; }
      const customers = await parseCustomersFromSet(dir);
      sets.push({ name, mtimeMs: stat.mtimeMs, customers });
    }
    sets.sort((a, b) => b.mtimeMs - a.mtimeMs);

    return res.json({ success: true, baseDir, sets });
  } catch (error) {
    console.error('Error listing restore sets:', error);
    return res.status(500).json({ success: false, error: 'Failed to list restore sets' });
  }
}

module.exports = { handleListRestoreSets };

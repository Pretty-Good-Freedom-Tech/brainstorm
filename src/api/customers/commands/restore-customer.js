/**
 * Restore Single Customer API Handler
 * POST /api/restore/customer
 *
 * Restores a single customer from an extracted restore set directory.
 * Body: { setName: string, pubkey: string, overwrite?: boolean }
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const CustomerManager = require('../../../utils/customerManager.js');
const { defaultRestoreSetsDir } = require('./restore-upload.js');

function ensureDir(p) {
  try { fs.mkdirSync(p, { recursive: true }); } catch (_) { /* ignore */ }
}

function sanitizeName(name) {
  return String(name || '').replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function readJsonSafe(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return null;
  }
}

async function handleRestoreCustomer(req, res) {
  try {
    const { setName, pubkey, overwrite = false } = req.body || {};

    if (!setName || !pubkey) {
      return res.status(400).json({ success: false, error: 'Missing setName or pubkey' });
    }

    const setsBase = defaultRestoreSetsDir();
    const safeSet = sanitizeName(setName);
    const setDir = path.join(setsBase, safeSet);

    // Validate set directory exists and is inside the base
    const realSetDir = fs.existsSync(setDir) ? fs.realpathSync(setDir) : null;
    const realBaseDir = fs.realpathSync(setsBase);
    if (!realSetDir || !realSetDir.startsWith(realBaseDir)) {
      return res.status(404).json({ success: false, error: 'Restore set not found' });
    }

    // Parse customers.json from set
    const customersFile = path.join(realSetDir, 'customers.json');
    const customersJson = await readJsonSafe(customersFile);
    if (!customersJson || !customersJson.customers) {
      return res.status(400).json({ success: false, error: 'Invalid restore set: customers.json missing or invalid' });
    }

    // Locate customer entry by pubkey
    let entryName = null;
    let customer = null;
    for (const [name, c] of Object.entries(customersJson.customers)) {
      if (c && c.pubkey === pubkey) {
        entryName = name;
        customer = c;
        break;
      }
    }
    if (!customer) {
      return res.status(404).json({ success: false, error: 'Customer not found in restore set' });
    }

    // Validate source directory exists inside the set
    const sourceDir = path.join(realSetDir, customer.directory);
    if (!fs.existsSync(sourceDir)) {
      return res.status(400).json({ success: false, error: `Customer directory not found in set: ${customer.directory}` });
    }

    // Prepare a temporary single-customer restore directory under the sets base
    const tmpBase = path.join(setsBase, '.tmp-single-restore');
    ensureDir(tmpBase);
    const tmpDir = path.join(tmpBase, `${sanitizeName(safeSet)}-${Date.now()}`);
    ensureDir(tmpDir);

    try {
      // Write filtered customers.json
      const filtered = { customers: { [entryName]: customer } };
      fs.writeFileSync(path.join(tmpDir, 'customers.json'), JSON.stringify(filtered, null, 2));

      // Copy only the needed customer directory
      const destDir = path.join(tmpDir, customer.directory);
      const cmForCopy = new CustomerManager();
      if (typeof cmForCopy.initialize === 'function') {
        try { await cmForCopy.initialize(); } catch (_) { /* non-fatal */ }
      }
      await cmForCopy.copyDirectory(sourceDir, destDir);

      // Create minimal backup-manifest.json expected by restoreCustomerData
      const manifest = {
        timestamp: new Date().toISOString(),
        version: '1.0',
        includeSecureKeys: false,
        files: ['customers.json', customer.directory]
      };
      fs.writeFileSync(path.join(tmpDir, 'backup-manifest.json'), JSON.stringify(manifest, null, 2));

      // Perform restore using CustomerManager
      const cm = new CustomerManager();
      if (typeof cm.initialize === 'function') {
        try { await cm.initialize(); } catch (_) { /* non-fatal */ }
      }

      const result = await cm.restoreCustomerData(tmpDir, { merge: true, overwrite: !!overwrite, dryRun: false });

      return res.json({ success: true, setName: safeSet, entryName, pubkey, overwrite: !!overwrite, result });
    } catch (e) {
      console.error('Error during single-customer restore:', e);
      return res.status(500).json({ success: false, error: 'Failed to restore customer' });
    } finally {
      // Best-effort cleanup of temp directory
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
    }
  } catch (error) {
    console.error('Restore customer API error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error while restoring customer' });
  }
}

module.exports = { handleRestoreCustomer };

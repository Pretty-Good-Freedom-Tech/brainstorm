/**
 * Backup Customers API Handler
 * POST /api/backup-customers
 *
 * Triggers a backup of customer data.
 * Request payload: { mode: 'all' | 'one', pubkey?: string, name?: string, includeSecureKeys?: boolean, compress?: boolean }
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const archiver = require('archiver');
const CustomerManager = require('../../../utils/customerManager.js');
const { getCustomerRelayKeys } = require('../../../utils/customerRelayKeys.js');

function defaultBackupBaseDir() {
  // Prefer a system directory owned by the service
  const base = '/var/lib/brainstorm/backups';
  try {
    if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
    return base;
  } catch (e) {
    // Fallback to user's home directory
    const homeBase = path.join(os.homedir(), 'brainstorm-backups');
    if (!fs.existsSync(homeBase)) fs.mkdirSync(homeBase, { recursive: true });
    return homeBase;
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/**
 * Handle backing up customers
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handleBackupCustomers(req, res) {
  try {
    const { mode = 'all', pubkey, name, includeSecureKeys = false, compress = false } = req.body || {};

    const baseDir = defaultBackupBaseDir();
    const cm = new CustomerManager();
    if (typeof cm.initialize === 'function') {
      try { await cm.initialize(); } catch (_) { /* non-fatal */ }
    }

    if (mode === 'all') {
      const backupPath = path.join(baseDir, `customer-backup-${timestamp()}`);
      const result = await cm.backupCustomerData(backupPath, { includeSecureKeys, compress });
      return res.json({
        success: true,
        backupPath: result.backupPath,
        manifest: result.manifest
      });
    }

    if (mode === 'one') {
      // Find the specified customer by pubkey or name
      const all = await cm.getAllCustomers();
      let entryName = null;
      let customer = null;
      for (const [n, c] of Object.entries(all.customers)) {
        if ((pubkey && c.pubkey === pubkey) || (name && n === name)) {
          entryName = n;
          customer = c;
          break;
        }
      }

      if (!customer) {
        return res.status(404).json({ success: false, error: 'Customer not found' });
      }

      const dirName = customer.directory || entryName;
      const backupPath = path.join(baseDir, `customer-backup-${dirName}-${timestamp()}`);
      if (!fs.existsSync(backupPath)) fs.mkdirSync(backupPath, { recursive: true });

      // Create filtered customers.json containing only the selected customer
      const filtered = { customers: { [entryName]: customer } };
      fs.writeFileSync(path.join(backupPath, 'customers.json'), JSON.stringify(filtered, null, 2));

      // Copy customer directory
      const sourceDir = path.join(cm.customersDir, customer.directory);
      const destDir = path.join(backupPath, customer.directory);
      if (fs.existsSync(sourceDir)) {
        await cm.copyDirectory(sourceDir, destDir);
      }

      const manifest = {
        timestamp: new Date().toISOString(),
        version: '1.0',
        includeSecureKeys,
        files: ['customers.json', customer.directory]
      };

      if (includeSecureKeys) {
        const secureKeysPath = '/var/lib/brainstorm/secure-keys';
        try {
          if (fs.existsSync(secureKeysPath)) {
            const keyFiles = fs.readdirSync(secureKeysPath);
            const secureKeysBackupPath = path.join(backupPath, 'secure-keys-manifest.json');
            let customers = [];
            try {
              const relayKeys = await getCustomerRelayKeys(customer.pubkey);
              if (relayKeys && relayKeys.nsec) {
                customers.push({
                  name: entryName,
                  id: customer.id,
                  pubkey: customer.pubkey,
                  npub: relayKeys.npub || '',
                  nsec: relayKeys.nsec
                });
              }
            } catch (e) {
              console.log(`\u26a0\ufe0f Failed to read relay keys for ${entryName}: ${e.message}`);
            }
            const keyManifest = {
              timestamp: new Date().toISOString(),
              keyFiles: keyFiles.filter(f => f.endsWith('.enc')),
              customers,
              note: 'Includes sensitive relay secrets (nsec). Handle and store securely.'
            };
            fs.writeFileSync(secureKeysBackupPath, JSON.stringify(keyManifest, null, 2));
            manifest.files.push('secure-keys-manifest.json');
          }
        } catch (error) {
          console.log(`\u26a0\ufe0f Failed to include secure keys manifest: ${error.message}`);
          // Continue without secure keys manifest
        }
      }

      fs.writeFileSync(path.join(backupPath, 'backup-manifest.json'), JSON.stringify(manifest, null, 2));

      // If requested, compress the backup directory to a .zip archive
      if (compress) {
        const zipPath = `${backupPath}.zip`;
        await new Promise((resolve, reject) => {
          const output = fs.createWriteStream(zipPath);
          const archive = archiver('zip', { zlib: { level: 9 } });

          output.on('close', resolve);
          output.on('error', reject);
          archive.on('error', reject);

          archive.pipe(output);
          archive.directory(backupPath, false);
          archive.finalize();
        });

        try { fs.rmSync(backupPath, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }

        return res.json({ success: true, backupPath: zipPath, manifest });
      }

      return res.json({ success: true, backupPath, manifest });
    }

    return res.status(400).json({ success: false, error: 'Invalid mode. Use "all" or "one".' });

  } catch (error) {
    console.error('Error during customer backup:', error);
    return res.status(500).json({ success: false, error: 'Internal server error while backing up customers' });
  }
}

module.exports = { handleBackupCustomers };

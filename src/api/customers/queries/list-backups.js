/**
 * List Backups API Handler
 * GET /api/backups
 *
 * Returns a list of .zip backup files from the backups directory.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

function defaultBackupBaseDir() {
  const base = '/var/lib/brainstorm/backups';
  try {
    if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
    return base;
  } catch (e) {
    const homeBase = path.join(os.homedir(), 'brainstorm-backups');
    if (!fs.existsSync(homeBase)) fs.mkdirSync(homeBase, { recursive: true });
    return homeBase;
  }
}

async function handleListBackups(req, res) {
  try {
    const dir = defaultBackupBaseDir();
    if (!fs.existsSync(dir)) {
      return res.json({ success: true, baseDir: dir, files: [] });
    }

    const entries = fs.readdirSync(dir);
    const files = entries
      .filter((name) => name.toLowerCase().endsWith('.zip'))
      .map((name) => {
        const full = path.join(dir, name);
        let stat = null;
        try { stat = fs.statSync(full); } catch (_) { /* skip */ }
        return stat && stat.isFile() ? {
          name,
          size: stat.size,
          mtimeMs: stat.mtimeMs,
          mtime: new Date(stat.mtimeMs).toISOString()
        } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    return res.json({ success: true, baseDir: dir, files });
  } catch (error) {
    console.error('Error listing backups:', error);
    return res.status(500).json({ success: false, error: 'Failed to list backups' });
  }
}

module.exports = { handleListBackups };

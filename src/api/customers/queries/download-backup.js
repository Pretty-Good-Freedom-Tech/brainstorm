/**
 * Download Backup API Handler
 * GET /api/backups/download?file=<name>.zip
 *
 * Streams the requested .zip file from the backups directory.
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

async function handleDownloadBackup(req, res) {
  try {
    const { file } = req.query || {};
    if (!file) return res.status(400).json({ success: false, error: 'Missing file parameter' });

    // Prevent path traversal; only allow basename and .zip files
    const safeName = path.basename(String(file));
    if (!safeName.toLowerCase().endsWith('.zip')) {
      return res.status(400).json({ success: false, error: 'Only .zip files are downloadable' });
    }

    const dir = defaultBackupBaseDir();
    const fullPath = path.join(dir, safeName);

    // Ensure resolved path stays within backups dir
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(path.resolve(dir) + path.sep)) {
      return res.status(400).json({ success: false, error: 'Invalid file path' });
    }

    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    res.download(resolved, safeName);
  } catch (error) {
    console.error('Error downloading backup:', error);
    return res.status(500).json({ success: false, error: 'Failed to download backup' });
  }
}

module.exports = { handleDownloadBackup };

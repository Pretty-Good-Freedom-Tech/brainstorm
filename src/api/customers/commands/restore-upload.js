/**
 * Restore Upload API Handler
 * POST /api/restore/upload
 *
 * Accepts a .zip backup upload, stores it to an uploads dir, extracts it
 * into a restore-sets directory, and returns the parsed customers available
 * for restoration from the extracted set.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const multer = require('multer');
const extract = require('extract-zip');

function ensureDir(p) {
  try { fs.mkdirSync(p, { recursive: true }); } catch (_) { /* ignore */ }
}

function defaultRestoreUploadsDir() {
  const base = '/var/lib/brainstorm/restore-uploads';
  try {
    ensureDir(base);
    return base;
  } catch (e) {
    const homeBase = path.join(os.homedir(), 'brainstorm-restore-uploads');
    ensureDir(homeBase);
    return homeBase;
  }
}

function defaultRestoreSetsDir() {
  const base = '/var/lib/brainstorm/restore-sets';
  try {
    ensureDir(base);
    return base;
  } catch (e) {
    const homeBase = path.join(os.homedir(), 'brainstorm-restore-sets');
    ensureDir(homeBase);
    return homeBase;
  }
}

function sanitizeFilename(name) {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, defaultRestoreUploadsDir());
  },
  filename: function (req, file, cb) {
    const safe = sanitizeFilename(file.originalname || 'upload.zip');
    cb(null, `${Date.now()}-${safe}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024 } // 1 GB
});

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

async function handleRestoreUpload(req, res) {
  upload.single('file')(req, res, async (err) => {
    try {
      if (err) {
        console.error('Upload error:', err);
        return res.status(400).json({ success: false, error: 'Upload failed' });
      }
      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, error: 'Missing file' });
      }
      const original = file.originalname || file.filename;
      const lower = original.toLowerCase();
      if (!lower.endsWith('.zip')) {
        try { fs.unlinkSync(file.path); } catch (_) {}
        return res.status(400).json({ success: false, error: 'Only .zip files are supported' });
      }

      const baseName = sanitizeFilename(path.basename(original, path.extname(original)));
      const setName = `${baseName}-${timestamp()}`;
      const setsDir = defaultRestoreSetsDir();
      const destDir = path.join(setsDir, setName);
      ensureDir(destDir);

      // Extract archive to destDir
      await extract(file.path, { dir: destDir });
      // Remove uploaded archive
      try { fs.unlinkSync(file.path); } catch (_) {}

      // Parse customers
      const customers = await parseCustomersFromSet(destDir);
      const stat = fs.statSync(destDir);

      return res.json({
        success: true,
        set: {
          name: setName,
          mtimeMs: stat.mtimeMs,
          customers
        },
        baseDir: setsDir
      });
    } catch (e) {
      console.error('Error handling restore upload:', e);
      return res.status(500).json({ success: false, error: 'Failed to process restore upload' });
    }
  });
}

module.exports = { handleRestoreUpload, defaultRestoreSetsDir };

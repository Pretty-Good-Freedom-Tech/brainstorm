(() => {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    const els = {
      dropzone: document.getElementById('restoreDropzone'),
      fileInput: document.getElementById('restoreFileInput'),
      uploadBtn: document.getElementById('restoreUploadBtn'),
      filename: document.getElementById('restoreUploadFilename'),
      status: document.getElementById('restoreUploadStatus'),
      refreshBtn: document.getElementById('restoreSetsRefreshBtn'),
      baseDir: document.getElementById('restoreSetsBaseDir'),
      emptyState: document.getElementById('restoreEmptyState'),
      setsContainer: document.getElementById('restoreSetsContainer')
    };

    let selectedFile = null;
    let uploading = false;

    function esc(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    function shorten(str, len = 10) {
      if (!str) return '';
      const s = String(str);
      if (s.length <= len) return s;
      const half = Math.max(2, Math.floor((len - 1) / 2));
      return `${s.slice(0, half)}…${s.slice(-half)}`;
    }

    function fmtDate(v) {
      if (!v && v !== 0) return '-';
      try {
        const d = typeof v === 'number' ? new Date(v) : new Date(String(v));
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleString();
      } catch (_) { return '-'; }
    }

    function setStatus(type, msg) {
      els.status.className = 'status-line ' + (
        type === 'success' ? 'status-success' :
        type === 'error'   ? 'status-error'   :
        'status-info'
      );
      els.status.textContent = msg || '';
    }

    function setSelectedFile(file) {
      selectedFile = file;
      if (selectedFile) {
        els.filename.textContent = selectedFile.name;
        els.uploadBtn.disabled = false;
      } else {
        els.filename.textContent = '';
        els.uploadBtn.disabled = true;
      }
    }

    function isZip(file) {
      if (!file) return false;
      const name = file.name ? file.name.toLowerCase() : '';
      const type = (file.type || '').toLowerCase();
      return name.endsWith('.zip') || type === 'application/zip' || type === 'application/x-zip-compressed';
    }

    // Drag & Drop
    if (els.dropzone) {
      const dz = els.dropzone;
      const prevent = (e) => { e.preventDefault(); e.stopPropagation(); };

      ['dragenter', 'dragover'].forEach(evt =>
        dz.addEventListener(evt, (e) => { prevent(e); dz.classList.add('dragover'); })
      );
      ['dragleave', 'dragend', 'drop'].forEach(evt =>
        dz.addEventListener(evt, (e) => { prevent(e); dz.classList.remove('dragover'); })
      );
      dz.addEventListener('drop', (e) => {
        const files = e.dataTransfer?.files || [];
        if (!files.length) return;
        const firstZip = Array.from(files).find(isZip) || files[0];
        if (!isZip(firstZip)) {
          setStatus('error', 'Only .zip files are supported.');
          return;
        }
        setSelectedFile(firstZip);
        setStatus('info', 'Ready to upload: ' + firstZip.name);
      });
    }

    // File chooser
    if (els.fileInput) {
      els.fileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (!isZip(file)) {
          setStatus('error', 'Only .zip files are supported.');
          e.target.value = '';
          return;
        }
        setSelectedFile(file);
        setStatus('info', 'Ready to upload: ' + file.name);
      });
    }

    async function uploadSelectedFile() {
      if (!selectedFile || uploading) return;
      try {
        uploading = true;
        els.uploadBtn.disabled = true;
        setStatus('info', 'Uploading and extracting…');

        const form = new FormData();
        form.append('file', selectedFile, selectedFile.name);

        const resp = await fetch('/api/restore/upload', {
          method: 'POST',
          body: form,
          credentials: 'same-origin'
        });

        if (!resp.ok) {
          const txt = await resp.text().catch(() => '');
          throw new Error(`Upload failed (${resp.status}). ${txt}`);
        }

        const data = await resp.json();
        if (!data.success) {
          throw new Error(data.error || 'Upload failed.');
        }

        setStatus('success', `Uploaded and extracted set: ${data.set?.name || 'unknown'}`);
        // Clear selection
        setSelectedFile(null);
        if (els.fileInput) els.fileInput.value = '';

        // Refresh list
        await loadRestoreSets();
      } catch (err) {
        setStatus('error', err.message || 'Failed to upload backup.');
      } finally {
        uploading = false;
        els.uploadBtn.disabled = !selectedFile;
      }
    }

    if (els.uploadBtn) {
      els.uploadBtn.addEventListener('click', uploadSelectedFile);
    }

    if (els.refreshBtn) {
      els.refreshBtn.addEventListener('click', () => loadRestoreSets(true));
    }

    function renderSets(sets) {
      els.setsContainer.innerHTML = '';
      if (!sets || sets.length === 0) {
        els.emptyState.hidden = false;
        return;
      }
      els.emptyState.hidden = true;

      for (const s of sets) {
        const customers = Array.isArray(s.customers) ? s.customers : [];
        const when = s.mtimeMs ? new Date(s.mtimeMs) : null;

        const card = document.createElement('div');
        card.className = 'set-card';

        const title = document.createElement('h3');
        title.textContent = s.name || '(unnamed set)';

        const meta = document.createElement('div');
        meta.className = 'set-meta muted';
        meta.textContent = `Updated: ${when ? when.toLocaleString() : 'unknown'} • Customers: ${customers.length}`;

        const grid = document.createElement('div');
        grid.className = 'customers-grid';

        customers.forEach(c => {
          const pub = c && c.pubkey || '';
          const extractedRelay = c && c.extracted && c.extracted.relay_pubkey || null;
          const existing = c && c.existing || { exists: false };
          const existingRelay = existing && existing.relay_pubkey || null;

          let badgeClass = 'badge';
          let badgeText = 'No relay keys';
          if (!existing || !existing.exists) {
            badgeClass = 'badge badge-missing';
            badgeText = 'Not installed';
          } else if (extractedRelay && existingRelay) {
            if (extractedRelay === existingRelay) {
              badgeClass = 'badge badge-match';
              badgeText = 'Relay key: match';
            } else {
              badgeClass = 'badge badge-mismatch';
              badgeText = 'Relay key: mismatch';
            }
          } else if (extractedRelay && !existingRelay) {
            badgeClass = 'badge badge-missing';
            badgeText = 'Existing relay key: none';
          } else if (!extractedRelay && existingRelay) {
            badgeClass = 'badge badge-missing';
            badgeText = 'Extracted relay key: none';
          }

          const cust = document.createElement('div');
          cust.className = 'customer-card';
          cust.innerHTML = `
            <div class="customer-card-header">
              <div class="header-main">
                <div class="pill-name">${esc(c.display_name || c.name || '(no name)')}</div>
                <div class="pill-sub muted">${esc(shorten(pub, 20))}</div>
              </div>
              <span class="${badgeClass}">${esc(badgeText)}</span>
            </div>
            <div class="customer-card-body">
              <div class="col">
                <div class="kv"><span class="kv-label">Extracted name</span><span class="kv-value">${esc(c.display_name || c.name || '-')}</span></div>
                <div class="kv"><span class="kv-label">Last modified</span><span class="kv-value">${esc(fmtDate(c.lastModified))}</span></div>
                <div class="kv"><span class="kv-label">Relay pub</span><span class="kv-value mono">${esc(shorten(extractedRelay, 24) || '-')}</span></div>
              </div>
              <div class="col">
                <div class="kv"><span class="kv-label">Existing name</span><span class="kv-value">${esc(existing.display_name || existing.name || '-')}</span></div>
                <div class="kv"><span class="kv-label">Last modified</span><span class="kv-value">${esc(fmtDate(existing.lastModified))}</span></div>
                <div class="kv"><span class="kv-label">Relay pub</span><span class="kv-value mono">${esc(shorten(existingRelay, 24) || '-')}</span></div>
              </div>
            </div>
          `;
          grid.appendChild(cust);
        });

        card.appendChild(title);
        card.appendChild(meta);
        card.appendChild(grid);
        els.setsContainer.appendChild(card);
      }
    }

    async function loadRestoreSets(showStatus) {
      try {
        if (showStatus) setStatus('info', 'Loading restore sets…');

        const resp = await fetch('/api/restore/sets', {
          method: 'GET',
          credentials: 'same-origin'
        });

        if (!resp.ok) {
          const txt = await resp.text().catch(() => '');
          throw new Error(`List failed (${resp.status}). ${txt}`);
        }

        const data = await resp.json();
        if (!data.success) {
          throw new Error(data.error || 'Failed to list restore sets.');
        }

        if (els.baseDir) {
          els.baseDir.textContent = `Base directory: ${data.baseDir || ''}`;
        }

        renderSets(data.sets || []);
        if (showStatus) setStatus('success', 'Restore sets loaded.');
      } catch (err) {
        setStatus('error', err.message || 'Failed to load restore sets.');
      }
    }

    // Initialize
    setSelectedFile(null);
    setStatus('info', '');
    loadRestoreSets(false);
  });
})();
// Minimal inline wiring for show/hide + customer list fetch
(function() {
    function qs(id){ return document.getElementById(id); }
    function setSelectorVisibility(mode){
      const row = qs('customerSelectorRow');
      if (!row) return;
      row.style.display = (mode === 'one') ? 'flex' : 'none';
    }
    async function fetchCustomersWithFallback() {
      const endpoints = ['/api/get-ciustomers', '/api/get-customers']; // try given, then fallback
      for (const url of endpoints) {
        try {
          const res = await fetch(url);
          if (!res.ok) continue;
          const data = await res.json();
          if (data && Array.isArray(data.customers)) return data.customers;
        } catch (e) { /* try next */ }
      }
      return [];
    }
    async function populateCustomerSelect(){
      const select = qs('customerSelect');
      const status = qs('customerSelectStatus');
      if (!select) return;
      try {
        const customers = await fetchCustomersWithFallback();
        select.innerHTML = '';
        if (!customers.length) {
          const opt = document.createElement('option');
          opt.value = '';
          opt.textContent = 'No customers found';
          select.appendChild(opt);
          select.disabled = true;
          if (status) status.textContent = '';
          return;
        }
        customers.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.pubkey || c.name || c.directory || String(c.id);
          opt.textContent = c.display_name || c.name || c.directory || c.pubkey;
          select.appendChild(opt);
        });
        select.disabled = false;
        if (status) status.textContent = '';
      } catch (err) {
        if (status) status.textContent = 'Failed to load customers';
        console.error('Error loading customers', err);
      }
    }
    
    // --- Backups listing helpers ---
    function formatBytes(bytes) {
      if (!Number.isFinite(bytes)) return '';
      const units = ['B','KB','MB','GB','TB'];
      let i = 0; let n = bytes;
      while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
      return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
    }

    async function fetchBackups() {
      const container = qs('backupsContainer');
      const empty = qs('backupsEmpty');
      const baseDirEl = qs('backupsBaseDir');
      if (container) container.innerHTML = '';
      if (empty) empty.hidden = true;
      try {
        const res = await fetch('/api/backups');
        const data = await res.json();
        if (!res.ok || !data || data.success === false) throw new Error((data && (data.error || data.message)) || `HTTP ${res.status}`);
        if (baseDirEl) baseDirEl.textContent = data.baseDir || '';
        const files = Array.isArray(data.files) ? data.files : [];
        if (!files.length) {
          if (empty) empty.hidden = false;
          return;
        }
        for (const f of files) {
          const card = document.createElement('div');
          card.className = 'backup-card';
          const name = document.createElement('div');
          name.className = 'backup-name';
          name.textContent = f.name;
          const meta = document.createElement('div');
          meta.className = 'backup-meta';
          meta.textContent = `${formatBytes(f.size)} • ${new Date(f.mtimeMs || Date.now()).toLocaleString()}`;
          const actions = document.createElement('div');
          actions.className = 'backup-actions';
          const a = document.createElement('a');
          a.className = 'btn-toggle';
          a.href = `/api/backups/download?file=${encodeURIComponent(f.name)}`;
          a.textContent = 'Download';
          actions.appendChild(a);
          card.appendChild(name);
          card.appendChild(meta);
          card.appendChild(actions);
          if (container) container.appendChild(card);
        }
      } catch (err) {
        console.error('Failed to load backups', err);
        if (empty) { empty.textContent = 'Failed to load backups'; empty.hidden = false; }
      }
    }

    // --- Helpers for actions ---
    function setActionStatus(msg, isError = false) {
      const el = qs('backupActionStatus');
      if (!el) return;
      el.textContent = msg || '';
      el.style.color = isError ? '#b91c1c' : '#6b7280';
    }

    function getSelectedMode() {
      const all = qs('backup-all');
      const one = qs('backup-one');
      if (one && one.checked) return 'one';
      if (all && all.checked) return 'all';
      return 'all';
    }

    async function callBackupApi(payload) {
      const res = await fetch('/api/backup-customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data || data.success === false) {
        const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      return data;
    }
    
    function init(){
      const all = document.getElementById('backup-all');
      const one = document.getElementById('backup-one');
      if (all) all.addEventListener('change', () => {
        setSelectorVisibility('all');
      });
      if (one) one.addEventListener('change', () => {
        setSelectorVisibility('one');
        // Load customers when switching into single-customer mode
        populateCustomerSelect();
      });
      // default state
      setSelectorVisibility(one && one.checked ? 'one' : 'all');
      // load customers if visible
      if (one && one.checked) populateCustomerSelect();
      
      // Wire backups refresh
      const refreshBtn = qs('refreshBackupsBtn');
      if (refreshBtn) refreshBtn.addEventListener('click', fetchBackups);

      // Wire Generate Backup action
      const genBtn = qs('generateBackupBtn');
      if (genBtn) {
        genBtn.addEventListener('click', async () => {
          try {
            setActionStatus('Generating backup...');
            const mode = getSelectedMode();
            const includeSecureKeys = !!(qs('includeSecureKeys') && qs('includeSecureKeys').checked);
            const compress = !!(qs('compressBackup') && qs('compressBackup').checked);
            const payload = { mode, includeSecureKeys, compress };
            if (mode === 'one') {
              const select = qs('customerSelect');
              const val = select && select.value;
              if (!val) {
                setActionStatus('Please select a customer', true);
                return;
              }
              // Heuristic: 64-hex => pubkey, else name
              if (/^[0-9a-fA-F]{64}$/.test(val)) payload.pubkey = val; else payload.name = val;
            }
            const data = await callBackupApi(payload);
            setActionStatus(`Backup complete${data.backupPath ? `: ${data.backupPath}` : ''}`);
            // Refresh available backups (especially when compressed)
            fetchBackups();
          } catch (err) {
            console.error('Backup failed', err);
            setActionStatus(`Backup failed: ${err.message || err}`, true);
          }
        });
      }

      // Initial backups load
      fetchBackups();
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  })();
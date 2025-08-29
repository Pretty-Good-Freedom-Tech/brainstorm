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
    
    // --- Backup JSON preview helpers ---
    function renderBackupJson(data) {
      const pre = qs('backupJsonPre');
      if (!pre) return;
      try {
        const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        pre.textContent = text;
      } catch (e) {
        pre.textContent = '/* Failed to render JSON */';
      }
    }
    
    function toggleBackupPanel(forceOpen) {
      const panel = qs('backupPanel');
      const btn = qs('backupPanelToggle');
      if (!panel || !btn) return;
      const shouldOpen = (forceOpen !== undefined) ? !!forceOpen : panel.hasAttribute('hidden');
      if (shouldOpen) {
        panel.removeAttribute('hidden');
        btn.setAttribute('aria-expanded', 'true');
        btn.textContent = 'Hide';
      } else {
        panel.setAttribute('hidden', '');
        btn.setAttribute('aria-expanded', 'false');
        btn.textContent = 'Show';
      }
    }
    
    // Expose a simple API to set backup JSON from elsewhere
    window.setBackupJson = function(data, autoOpen = true) {
      renderBackupJson(data);
      if (autoOpen) toggleBackupPanel(true);
    };

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

    function copyBackupJson() {
      const pre = qs('backupJsonPre');
      if (!pre) return;
      const text = pre.textContent || '';
      if (!text.trim()) return;
      navigator.clipboard.writeText(text).catch(() => {/* ignore */});
      setActionStatus('Copied JSON to clipboard');
    }

    function downloadBackupJson() {
      const pre = qs('backupJsonPre');
      if (!pre) return;
      const text = pre.textContent || '';
      if (!text.trim()) return;
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-manifest-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setActionStatus('Downloaded JSON');
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
      
      // Wire backup panel toggle
      const toggleBtn = qs('backupPanelToggle');
      if (toggleBtn) toggleBtn.addEventListener('click', () => toggleBackupPanel());
      // Ensure default closed state and button text
      toggleBackupPanel(false);

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
            // Display manifest only, as requested
            if (data && data.manifest) {
              window.setBackupJson(data.manifest, true);
              setActionStatus(`Backup complete${data.backupPath ? `: ${data.backupPath}` : ''}`);
            } else {
              window.setBackupJson(data, true);
              setActionStatus('Backup complete');
            }
          } catch (err) {
            console.error('Backup failed', err);
            setActionStatus(`Backup failed: ${err.message || err}`, true);
          }
        });
      }

      // Wire Copy / Download
      const copyBtn = qs('copyBackupJsonBtn');
      if (copyBtn) copyBtn.addEventListener('click', copyBackupJson);
      const dlBtn = qs('downloadBackupJsonBtn');
      if (dlBtn) dlBtn.addEventListener('click', downloadBackupJson);
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  })();
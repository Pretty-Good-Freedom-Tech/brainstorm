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
    
    function init(){
      const all = document.getElementById('backup-all');
      const one = document.getElementById('backup-one');
      if (all) all.addEventListener('change', () => setSelectorVisibility('all'));
      if (one) one.addEventListener('change', () => setSelectorVisibility('one'));
      // default state
      setSelectorVisibility(one && one.checked ? 'one' : 'all');
      // load customers if visible
      if (one && one.checked) populateCustomerSelect();
      
      // Wire backup panel toggle
      const toggleBtn = qs('backupPanelToggle');
      if (toggleBtn) toggleBtn.addEventListener('click', () => toggleBackupPanel());
      // Ensure default closed state and button text
      toggleBackupPanel(false);
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  })();
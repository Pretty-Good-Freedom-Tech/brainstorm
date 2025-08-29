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
    function init(){
      const all = document.getElementById('backup-all');
      const one = document.getElementById('backup-one');
      if (all) all.addEventListener('change', () => setSelectorVisibility('all'));
      if (one) one.addEventListener('change', () => setSelectorVisibility('one'));
      // default state
      setSelectorVisibility(one && one.checked ? 'one' : 'all');
      // load customers if visible
      if (one && one.checked) populateCustomerSelect();
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  })();
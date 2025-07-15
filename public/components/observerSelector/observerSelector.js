/**
 * Observer Selector Component
 * Reusable component for selecting observerPubkey across different pages
 */

class ObserverSelector {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.options = {
            defaultValue: 'owner',
            onChange: null,
            customersEndpoint: '/control/api/get-customers',
            ...options
        };
        
        this.customers = [];
        this.currentValue = this.options.defaultValue;
        this.isLoaded = false;
        
        this.init();
    }
    
    async init() {
        await this.loadComponent();
        await this.loadCustomers();
        this.bindEvents();
        
        // Trigger initial change event if callback provided
        if (this.options.onChange) {
            this.options.onChange(this.currentValue);
        }
    }
    
    async loadComponent() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            console.error(`Observer Selector: Container with id '${this.containerId}' not found`);
            return;
        }
        
        try {
            // Load HTML template
            const htmlResponse = await fetch('/components/observerSelector/observerSelector.html');
            const htmlContent = await htmlResponse.text();
            
            // Load CSS
            const cssLink = document.createElement('link');
            cssLink.rel = 'stylesheet';
            cssLink.href = '/components/observerSelector/observerSelector.css';
            document.head.appendChild(cssLink);
            
            // Insert HTML
            container.innerHTML = htmlContent;
            
        } catch (error) {
            console.error('Observer Selector: Failed to load component', error);
            container.innerHTML = '<div class="error">Failed to load observer selector</div>';
        }
    }
    
    async loadCustomers() {
        const loadingElement = document.querySelector('.observer-selector-loading');
        const selectElement = document.getElementById('observer-selector');
        
        if (!selectElement) return;
        
        try {
            if (loadingElement) loadingElement.style.display = 'block';
            
            // Try to fetch customers from the API endpoint
            let customers = [];
            try {
                const response = await fetch(this.options.customersEndpoint);
                if (response.ok) {
                    const data = await response.json();
                    customers = data.customers || [];
                }
            } catch (apiError) {
                console.warn('Observer Selector: API endpoint not available, using fallback');
            }
            
            // If API fails, try to load from static file (for development)
            if (customers.length === 0) {
                try {
                    const fallbackResponse = await fetch('/customers/customers.json');
                    if (fallbackResponse.ok) {
                        const fallbackData = await fallbackResponse.json();
                        customers = Object.values(fallbackData.customers || {});
                    }
                } catch (fallbackError) {
                    console.warn('Observer Selector: Fallback customers.json not available');
                }
            }
            
            // Filter active customers
            this.customers = customers.filter(customer => 
                customer.status === 'active' && customer.pubkey
            );
            
            // Populate select options
            this.populateOptions();
            this.isLoaded = true;
            
        } catch (error) {
            console.error('Observer Selector: Failed to load customers', error);
        } finally {
            if (loadingElement) loadingElement.style.display = 'none';
        }
    }
    
    populateOptions() {
        const selectElement = document.getElementById('observer-selector');
        if (!selectElement) return;
        
        // Clear existing options except the default
        const defaultOption = selectElement.querySelector('option[value="owner"]');
        selectElement.innerHTML = '';
        if (defaultOption) {
            selectElement.appendChild(defaultOption);
        } else {
            // Create default option if it doesn't exist
            const globalOption = document.createElement('option');
            globalOption.value = 'owner';
            globalOption.textContent = 'Global (Default)';
            selectElement.appendChild(globalOption);
        }
        
        // Add customer options
        this.customers.forEach(customer => {
            const option = document.createElement('option');
            option.value = customer.pubkey;
            option.textContent = `${customer.name} (${customer.comments || 'customer'})`;
            option.dataset.customerId = customer.id;
            option.dataset.customerName = customer.name;
            selectElement.appendChild(option);
        });
        
        // Set current value
        selectElement.value = this.currentValue;
    }
    
    bindEvents() {
        const selectElement = document.getElementById('observer-selector');
        if (!selectElement) return;
        
        selectElement.addEventListener('change', (event) => {
            this.currentValue = event.target.value;
            
            // Trigger callback if provided
            if (this.options.onChange) {
                const selectedOption = event.target.selectedOptions[0];
                const customerData = {
                    pubkey: this.currentValue,
                    isOwner: this.currentValue === 'owner',
                    customerName: selectedOption?.dataset.customerName || null,
                    customerId: selectedOption?.dataset.customerId || null
                };
                
                this.options.onChange(this.currentValue, customerData);
            }
        });
    }
    
    // Public methods
    getValue() {
        return this.currentValue;
    }
    
    setValue(value) {
        const selectElement = document.getElementById('observer-selector');
        if (selectElement && this.isLoaded) {
            selectElement.value = value;
            this.currentValue = value;
        }
    }
    
    getSelectedCustomer() {
        if (this.currentValue === 'owner') return null;
        
        return this.customers.find(customer => customer.pubkey === this.currentValue) || null;
    }
    
    refresh() {
        this.loadCustomers();
    }
    
    destroy() {
        const container = document.getElementById(this.containerId);
        if (container) {
            container.innerHTML = '';
        }
    }
}

// Export for use in other scripts
window.ObserverSelector = ObserverSelector;

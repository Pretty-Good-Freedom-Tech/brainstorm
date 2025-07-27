/**
 * Customers API Module
 * Customers related operation handlers
 */

const { handleProcessAllActiveCustomers } = require('./commands/process-all-active-customers');
const { handleCreateAllCustomerRelays } = require('./commands/create-all-customer-relays');
const { handleGetCustomers } = require('./getCustomers');

// Export handlers directly - this allows the central router 
// to register endpoints without creating multiple routers
module.exports = {
    // Queries (read operations)
    handleGetCustomers,
    
    // Commands (write operations)
    handleProcessAllActiveCustomers,
    handleCreateAllCustomerRelays
};

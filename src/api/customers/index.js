/**
 * Customers API Module
 * Customers related operation handlers
 */

const { handleProcessAllActiveCustomers } = require('./commands/process-all-active-customers');
const { handleCreateAllCustomerRelays } = require('./commands/create-all-customer-relays');
const { handleGetCustomers } = require('./getCustomers');
const { handleDeleteCustomer } = require('./deleteCustomer');
const { handleChangeCustomerStatus } = require('./changeCustomerStatus');
const { handleGetCustomerRelayKeys } = require('./queries/get-customer-relay-keys');
const { handleGetCustomer } = require('./getCustomer');

// Export handlers directly - this allows the central router 
// to register endpoints without creating multiple routers
module.exports = {
    // Queries (read operations)
    handleGetCustomers,
    handleGetCustomer,
    handleGetCustomerRelayKeys,
    
    // Commands (write operations)
    handleProcessAllActiveCustomers,
    handleCreateAllCustomerRelays,
    handleDeleteCustomer,
    handleChangeCustomerStatus
};

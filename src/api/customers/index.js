/**
 * Customers API Module
 * Customers related operation handlers
 */

const { handleProcessAllActiveCustomers } = require('./commands/process-all-active-customers.js');
const { handleCreateAllCustomerRelays } = require('./commands/create-all-customer-relays.js');
const { handleUpdateCustomerDisplayName } = require('./commands/update-customer-display-name.js');
const { handleBackupCustomers } = require('./commands/backup-customers.js');
const { handleListBackups } = require('./queries/list-backups.js');
const { handleDownloadBackup } = require('./queries/download-backup.js');
const { handleRestoreUpload } = require('./commands/restore-upload.js');
const { handleListRestoreSets } = require('./queries/list-restore-sets.js');
const { handleGetCustomers } = require('./getCustomers.js');
const { handleDeleteCustomer } = require('./deleteCustomer.js');
const { handleChangeCustomerStatus } = require('./changeCustomerStatus.js');
const { handleGetCustomerRelayKeys } = require('./queries/get-customer-relay-keys.js');
const { handleGetCustomer } = require('./getCustomer.js');
const { handleAddNewCustomer } = require('./commands/add-new-customer.js');
const { handleRestoreCustomer } = require('./commands/restore-customer.js');

// Export handlers directly - this allows the central router 
// to register endpoints without creating multiple routers
module.exports = {
    // Queries (read operations)
    handleGetCustomers,
    handleGetCustomer,
    handleGetCustomerRelayKeys,
    handleListBackups,
    handleDownloadBackup,
    handleListRestoreSets,
    
    // Commands (write operations)
    handleProcessAllActiveCustomers,
    handleCreateAllCustomerRelays,
    handleDeleteCustomer,
    handleChangeCustomerStatus,
    handleAddNewCustomer,
    handleUpdateCustomerDisplayName,
    handleBackupCustomers,
    handleRestoreUpload,
    handleRestoreCustomer
};

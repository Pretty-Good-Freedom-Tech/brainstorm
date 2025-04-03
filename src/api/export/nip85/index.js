/**
 * NIP-85 API Endpoints
 * Routes for NIP-85 related operations
 */

const express = require('express');
const { handleKind10040Info, handleKind30382Info, handleGetKind10040Event } = require('./queries/info');
const { handleCreateKind10040, handlePublishKind10040 } = require('./commands/kind10040');
const { handlePublishKind30382 } = require('./commands/kind30382');
const { requireAuthentication } = require('../../auth/middleware');

const router = express.Router();

// Query endpoints (read-only, no authentication required)
router.get('/kind10040-info', handleKind10040Info);
router.get('/kind30382-info', handleKind30382Info);
router.get('/get-kind10040-event', handleGetKind10040Event);

// Command endpoints (require authentication)
router.post('/create-kind10040', requireAuthentication, handleCreateKind10040);
router.post('/publish-kind10040', requireAuthentication, handlePublishKind10040);
router.get('/publish-kind10040', requireAuthentication, handlePublishKind10040); // Support GET for compatibility
router.post('/publish-kind30382', requireAuthentication, handlePublishKind30382);
router.get('/publish-kind30382', requireAuthentication, handlePublishKind30382); // Support GET for compatibility

module.exports = router;

# Playwright Integration for Brainstorm

This document outlines the Playwright-MCP integration for automated browser testing of the Brainstorm project.

## Overview

The Playwright integration provides comprehensive automated testing for your Brainstorm web application, designed specifically for your AWS EC2 production environment setup.

## Test Structure

### Test Suites

1. **Authentication Tests** (`tests/brainstorm/auth.spec.js`)
   - User classification detection (owner/customer/guest/unauthenticated)
   - Page loading without authentication
   - Sign-up page functionality
   - Control panel access validation

2. **API Health Tests** (`tests/brainstorm/api-health.spec.js`)
   - Neo4j health endpoint validation
   - User classification API testing
   - Task watchdog status monitoring
   - CORS configuration validation
   - Static asset serving verification

3. **Customer Management Tests** (`tests/brainstorm/customer-management.spec.js`)
   - Customer sign-up flow testing
   - Customer management interface validation
   - Backup functionality testing
   - NIP-85 status checking

4. **Monitoring Dashboard Tests** (`tests/brainstorm/monitoring-dashboard.spec.js`)
   - Task Watchdog Dashboard functionality
   - System health metrics display
   - Auto-refresh functionality
   - Alert and notification systems
   - Task management interface

5. **Profile Search Tests** (`tests/brainstorm/profile-search.spec.js`)
   - Profile search functionality
   - Search result ordering preservation
   - Sorting and filtering capabilities
   - Pagination handling

## Configuration

### Environment Setup

The tests are configured to run against your AWS EC2 environment by default:

```javascript
// Set your AWS EC2 URL
export BRAINSTORM_BASE_URL="http://your-aws-ec2-ip:7778"
```

### Key Configuration Files

- `playwright.config.js` - Main Playwright configuration
- `tests/global-setup.js` - Global test setup and server accessibility checks
- `tests/environment.js` - Environment-specific configuration
- `package.json` - Updated with Playwright dependencies and scripts

## Running Tests

### Local Development

```bash
# Install Playwright (first time only)
npm install
npx playwright install

# Run all tests
npm run test:playwright

# Run specific test suite
./tests/run-tests.sh auth
./tests/run-tests.sh api
./tests/run-tests.sh customers
./tests/run-tests.sh monitoring
./tests/run-tests.sh profiles

# Run smoke tests (critical functionality only)
./tests/run-tests.sh smoke

# Run tests with UI (interactive mode)
npm run test:playwright:ui

# Run tests in headed mode (see browser)
npm run test:playwright:headed
```

### CI/CD Integration

The GitHub Actions workflow (`.github/workflows/playwright.yml`) provides:
- Automated testing on push/PR
- Daily scheduled runs to catch regressions
- Test result artifacts
- Failure notifications

## Test Strategy

### Non-Destructive Testing
All tests are designed to be non-destructive:
- No actual customer creation in production
- Read-only API endpoint testing
- UI interaction without data modification
- Safe search terms and test queries

### Production Environment Testing
Since Brainstorm runs on AWS EC2 (not locally), tests are designed to:
- Validate against production environment
- Handle authentication states gracefully
- Test real API responses and performance
- Monitor actual system health

### Key Test Scenarios

1. **User Journey Testing**
   - Unauthenticated user experience
   - Owner authentication flow
   - Customer sign-up process
   - Profile search and discovery

2. **System Health Validation**
   - Neo4j database connectivity
   - API endpoint availability
   - Monitoring system functionality
   - Task queue system health

3. **UI/UX Validation**
   - Page loading performance
   - Responsive design testing
   - Error handling and user feedback
   - Cross-browser compatibility

## Integration with Development Workflow

### Pre-Deployment Testing
```bash
# Run smoke tests before deployment
./tests/run-tests.sh smoke
```

### Change Evaluation
The tests help evaluate website changes by:
- Validating core functionality remains intact
- Checking for UI/UX regressions
- Monitoring API performance
- Ensuring cross-browser compatibility

### Monitoring Integration
Tests complement your existing monitoring infrastructure:
- Task Watchdog Dashboard validation
- Health monitoring system testing
- Alert system verification
- Performance regression detection

## Customization

### Adding New Tests
1. Create new test files in `tests/brainstorm/`
2. Follow existing patterns for authentication and setup
3. Add test suite to `tests/run-tests.sh`
4. Update documentation

### Environment-Specific Configuration
Modify `tests/environment.js` for:
- Different server URLs
- Feature flags
- Timeout adjustments
- Test data configuration

### Reporting
Test results are available in multiple formats:
- HTML reports: `npx playwright show-report`
- JSON results: `test-results/results.json`
- JUnit XML: `test-results/junit.xml`

## Best Practices

1. **Test Isolation**: Each test is independent and can run in any order
2. **Error Handling**: Tests gracefully handle server unavailability
3. **Performance Awareness**: Tests include appropriate timeouts for AWS EC2
4. **Security**: No sensitive data or credentials in test code
5. **Maintainability**: Clear test structure and documentation

## Troubleshooting

### Common Issues
- **Server Not Accessible**: Tests will skip if `BRAINSTORM_SERVER_ACCESSIBLE !== 'true'`
- **Timeout Issues**: Adjust timeouts in `playwright.config.js` for slower connections
- **Authentication**: Tests handle unauthenticated states gracefully

### Debug Mode
```bash
# Run with debug output
DEBUG=pw:api npm run test:playwright

# Run single test with debugging
npx playwright test tests/brainstorm/auth.spec.js --debug
```

This integration provides a robust foundation for automated testing of your Brainstorm project, ensuring quality and catching regressions as you continue development.

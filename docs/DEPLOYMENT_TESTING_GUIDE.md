# Deployment Testing Guide for Brainstorm

This guide covers how to use the Playwright integration for automated deployment testing and change evaluation.

## Quick Start

### 1. Install Dependencies
```bash
npm install
npx playwright install
```

### 2. Configure Environment
Set your AWS EC2 URL:
```bash
export BRAINSTORM_BASE_URL="http://your-aws-ec2-ip:7778"
```

### 3. Run Tests
```bash
# Run all deployment tests
npm run test:deployment

# Run smoke tests only (faster)
npm run test:deployment:smoke

# Run specific test suite
./tests/run-tests.sh auth
./tests/run-tests.sh api
```

## Integration with Your Workflow

### Pre-Deployment Validation
Before pushing changes to your AWS EC2 server:

```bash
# Run smoke tests to validate core functionality
npm run test:deployment:smoke
```

### Post-Deployment Verification
After updating your AWS EC2 deployment:

```bash
# Run full test suite to ensure everything works
npm run test:deployment

# Send alerts if configured
npm run test:alert
```

### Continuous Monitoring
The systemd integration provides automated testing:

- **After boot**: Tests run 5 minutes after system startup
- **Daily**: Automated tests at 3 AM to catch regressions
- **After restarts**: Tests run when brainstorm-control-panel restarts

## Test Suites

### 1. Smoke Tests (`npm run test:deployment:smoke`)
Critical functionality validation:
- Server accessibility
- Authentication system
- Core API endpoints
- Basic page loading

### 2. Full Test Suite (`npm run test:deployment`)
Comprehensive testing:
- All smoke test functionality
- Customer management workflows
- Profile search capabilities
- Monitoring dashboard functionality
- UI/UX validation

### 3. Individual Test Suites
- `auth` - Authentication and user classification
- `api` - API health and endpoint validation
- `customers` - Customer management features
- `monitoring` - Task Watchdog Dashboard
- `profiles` - Profile search functionality

## Alerting and Reporting

### Test Reports
Results are automatically generated in `./test-results/`:
- `deployment-test-report.json` - Machine-readable results
- `deployment-test-summary.txt` - Human-readable summary
- `playwright-report/` - Detailed HTML reports

### Alert Configuration
Configure alerts in your environment:

```bash
# Slack notifications
export BRAINSTORM_SLACK_TOKEN="xoxb-your-slack-bot-token"

# Webhook notifications
export BRAINSTORM_WEBHOOK_URL="https://your-webhook-url.com/brainstorm-alerts"

# Email alerts (requires integration)
export BRAINSTORM_EMAIL_ALERTS="true"
export BRAINSTORM_ALERT_EMAIL="admin@your-domain.com"
```

### Alert Triggers
Alerts are sent when:
- Tests fail (automatic)
- Server health checks fail
- Critical functionality is broken
- Optionally on successful runs (if `BRAINSTORM_ALERT_ON_SUCCESS=true`)

## Systemd Integration

### Installation
The systemd files are included for automated testing:
- `systemd/brainstorm-playwright-tests.service`
- `systemd/brainstorm-playwright-tests.timer`

### Manual Control
```bash
# Enable automated testing
sudo systemctl enable brainstorm-playwright-tests.timer
sudo systemctl start brainstorm-playwright-tests.timer

# Run tests manually
sudo systemctl start brainstorm-playwright-tests.service

# Check test status
sudo systemctl status brainstorm-playwright-tests.service

# View test logs
sudo journalctl -u brainstorm-playwright-tests.service -f
```

## Change Evaluation Workflow

### 1. Development Phase
```bash
# Make your changes locally
git add .
git commit -m "Your changes"

# Run local tests if possible
npm run test:playwright
```

### 2. Pre-Deployment Testing
```bash
# Push to GitHub
git push origin main

# Deploy to AWS EC2 (your existing process)
# Then validate deployment
npm run test:deployment:smoke
```

### 3. Post-Deployment Validation
```bash
# Run comprehensive tests
npm run test:deployment

# Check results
cat test-results/deployment-test-summary.txt
```

### 4. Monitoring
The automated systemd timer will:
- Catch regressions with daily tests
- Alert on failures
- Validate system health after restarts

## Troubleshooting

### Common Issues

**Server Not Accessible**
```bash
# Check if your server is running
curl http://your-aws-ec2-ip:7778/api/neo4j-health

# Verify environment variable
echo $BRAINSTORM_BASE_URL
```

**Tests Timing Out**
- Adjust timeouts in `playwright.config.js`
- Check AWS EC2 performance
- Verify network connectivity

**Authentication Issues**
- Tests handle unauthenticated states gracefully
- Check if owner authentication is required for specific features

### Debug Mode
```bash
# Run with debug output
DEBUG=pw:api npm run test:deployment

# Run single test with debugging
npx playwright test tests/brainstorm/auth.spec.js --debug --headed
```

### Log Analysis
Check logs for detailed information:
```bash
# Test execution logs
tail -f deployment-test.log

# Systemd service logs
sudo journalctl -u brainstorm-playwright-tests.service -f

# Playwright detailed logs
npx playwright show-report
```

## Best Practices

### 1. Test Strategy
- Run smoke tests before major deployments
- Use full test suite for comprehensive validation
- Schedule regular automated testing

### 2. Alert Management
- Configure alerts for your team's communication channels
- Set appropriate thresholds to avoid alert fatigue
- Review failed tests promptly

### 3. Performance Monitoring
- Monitor test execution times
- Adjust timeouts based on AWS EC2 performance
- Track trends in test reliability

### 4. Maintenance
- Update test scenarios as features evolve
- Review and update expected behaviors
- Keep Playwright dependencies current

This integration provides a robust foundation for ensuring your Brainstorm deployment quality and catching issues before they impact users.

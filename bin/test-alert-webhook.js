#!/usr/bin/env node

/**
 * Test Alert Webhook for Brainstorm Playwright Integration
 * Sends notifications when deployment tests fail
 */

const fs = require('fs');
const path = require('path');

class TestAlertSystem {
  constructor() {
    this.config = {
      webhookUrl: process.env.BRAINSTORM_WEBHOOK_URL,
      slackToken: process.env.BRAINSTORM_SLACK_TOKEN,
      emailConfig: {
        enabled: process.env.BRAINSTORM_EMAIL_ALERTS === 'true',
        to: process.env.BRAINSTORM_ALERT_EMAIL
      }
    };
  }

  async sendSlackAlert(report) {
    if (!this.config.slackToken) {
      console.log('⚠️  Slack token not configured, skipping Slack notification');
      return;
    }

    const message = this.formatSlackMessage(report);
    
    try {
      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.slackToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          channel: '#brainstorm-alerts',
          text: message.text,
          attachments: message.attachments
        })
      });

      if (response.ok) {
        console.log('✅ Slack alert sent successfully');
      } else {
        console.log('❌ Failed to send Slack alert:', response.statusText);
      }
    } catch (error) {
      console.log('❌ Slack alert error:', error.message);
    }
  }

  formatSlackMessage(report) {
    const status = report.results.success ? '✅' : '❌';
    const color = report.results.success ? 'good' : 'danger';
    
    return {
      text: `${status} Brainstorm Deployment Test ${report.summary.status}`,
      attachments: [{
        color: color,
        fields: [
          {
            title: 'Deployment URL',
            value: report.deployment.url,
            short: true
          },
          {
            title: 'Test Results',
            value: `${report.results.passedTests}/${report.results.totalTests} passed`,
            short: true
          },
          {
            title: 'Duration',
            value: `${Math.round(report.results.duration / 1000)}s`,
            short: true
          },
          {
            title: 'Timestamp',
            value: report.timestamp,
            short: true
          }
        ],
        ...(report.results.errors.length > 0 && {
          text: `Failures:\n${report.results.errors.slice(0, 5).map(e => `• ${e}`).join('\n')}`
        })
      }]
    };
  }

  async sendWebhookAlert(report) {
    if (!this.config.webhookUrl) {
      console.log('⚠️  Webhook URL not configured, skipping webhook notification');
      return;
    }

    try {
      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          event: 'brainstorm_deployment_test',
          status: report.summary.status,
          report: report
        })
      });

      if (response.ok) {
        console.log('✅ Webhook alert sent successfully');
      } else {
        console.log('❌ Failed to send webhook alert:', response.statusText);
      }
    } catch (error) {
      console.log('❌ Webhook alert error:', error.message);
    }
  }

  async sendEmailAlert(report) {
    if (!this.config.emailConfig.enabled) {
      console.log('⚠️  Email alerts not enabled, skipping email notification');
      return;
    }

    // For now, just log the email content that would be sent
    // In production, integrate with your preferred email service
    const emailContent = this.formatEmailContent(report);
    
    console.log('📧 Email alert content (configure email service to send):');
    console.log('---');
    console.log(emailContent);
    console.log('---');
  }

  formatEmailContent(report) {
    const status = report.results.success ? 'PASSED' : 'FAILED';
    
    return `
Subject: Brainstorm Deployment Test ${status}

Brainstorm Deployment Test Report
================================

Status: ${report.summary.status}
Timestamp: ${report.timestamp}
Deployment URL: ${report.deployment.url}

Test Results:
- Total Tests: ${report.results.totalTests}
- Passed: ${report.results.passedTests}
- Failed: ${report.results.failedTests}
- Duration: ${Math.round(report.results.duration / 1000)}s

${report.results.errors.length > 0 ? `
Failed Tests:
${report.results.errors.map(error => `- ${error}`).join('\n')}
` : ''}

Summary: ${report.summary.message}

View full report: ${report.deployment.url}/test-results/
`;
  }

  async processTestResults(reportPath) {
    try {
      const reportData = fs.readFileSync(reportPath, 'utf8');
      const report = JSON.parse(reportData);
      
      console.log(`📊 Processing test results: ${report.summary.status}`);
      
      // Only send alerts for failures or if explicitly requested
      if (!report.results.success || process.env.BRAINSTORM_ALERT_ON_SUCCESS === 'true') {
        await Promise.all([
          this.sendSlackAlert(report),
          this.sendWebhookAlert(report),
          this.sendEmailAlert(report)
        ]);
      } else {
        console.log('✅ Tests passed, no alerts needed');
      }
      
    } catch (error) {
      console.log('❌ Failed to process test results:', error.message);
    }
  }
}

// CLI handling
if (require.main === module) {
  const reportPath = process.argv[2] || './test-results/deployment-test-report.json';
  
  if (!fs.existsSync(reportPath)) {
    console.log(`❌ Report file not found: ${reportPath}`);
    process.exit(1);
  }
  
  const alertSystem = new TestAlertSystem();
  alertSystem.processTestResults(reportPath);
}

module.exports = TestAlertSystem;

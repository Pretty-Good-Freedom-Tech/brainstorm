#!/usr/bin/env node

/**
 * Deployment Testing Script for Brainstorm
 * Runs Playwright tests against AWS EC2 deployment to validate changes
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const config = {
  awsEc2Url: process.env.BRAINSTORM_BASE_URL || 'http://your-aws-ec2-ip:7778',
  testTimeout: 300000, // 5 minutes
  retryAttempts: 2,
  reportDir: './test-results',
  logFile: './deployment-test.log'
};

class DeploymentTester {
  constructor() {
    this.startTime = new Date();
    this.results = {
      success: false,
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      duration: 0,
      errors: []
    };
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${level}: ${message}\n`;
    
    console.log(logEntry.trim());
    
    // Append to log file
    fs.appendFileSync(config.logFile, logEntry);
  }

  async checkServerHealth() {
    this.log('🔍 Checking Brainstorm server health...');
    
    try {
      const response = await fetch(`${config.awsEc2Url}/api/neo4j-health`);
      
      if (response.ok) {
        this.log('✅ Server health check passed');
        return true;
      } else {
        this.log(`❌ Server health check failed: ${response.status}`, 'ERROR');
        return false;
      }
    } catch (error) {
      this.log(`❌ Server not accessible: ${error.message}`, 'ERROR');
      return false;
    }
  }

  async runPlaywrightTests(testSuite = 'all') {
    this.log(`🎭 Running Playwright tests: ${testSuite}`);
    
    return new Promise((resolve, reject) => {
      const args = ['test'];
      
      // Add specific test file if not running all
      if (testSuite !== 'all') {
        args.push(`tests/brainstorm/${testSuite}.spec.js`);
      }
      
      // Add reporter for JSON output
      args.push('--reporter=json');
      
      const playwrightProcess = spawn('npx', ['playwright', ...args], {
        env: {
          ...process.env,
          BRAINSTORM_BASE_URL: config.awsEc2Url
        },
        stdio: ['inherit', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      playwrightProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      playwrightProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        this.log(data.toString().trim(), 'DEBUG');
      });

      playwrightProcess.on('close', (code) => {
        try {
          // Parse test results
          const results = JSON.parse(stdout);
          this.parseTestResults(results);
          
          if (code === 0) {
            this.log('✅ Playwright tests completed successfully');
            resolve(true);
          } else {
            this.log(`❌ Playwright tests failed with exit code: ${code}`, 'ERROR');
            resolve(false);
          }
        } catch (error) {
          this.log(`❌ Failed to parse test results: ${error.message}`, 'ERROR');
          this.results.errors.push(`Test parsing error: ${error.message}`);
          resolve(false);
        }
      });

      playwrightProcess.on('error', (error) => {
        this.log(`❌ Failed to start Playwright: ${error.message}`, 'ERROR');
        reject(error);
      });

      // Set timeout
      setTimeout(() => {
        playwrightProcess.kill();
        this.log('❌ Test execution timed out', 'ERROR');
        resolve(false);
      }, config.testTimeout);
    });
  }

  parseTestResults(results) {
    if (results.suites) {
      results.suites.forEach(suite => {
        suite.specs.forEach(spec => {
          this.results.totalTests++;
          
          const hasFailures = spec.tests.some(test => 
            test.results.some(result => result.status === 'failed')
          );
          
          if (hasFailures) {
            this.results.failedTests++;
            this.results.errors.push(`Failed: ${spec.title}`);
          } else {
            this.results.passedTests++;
          }
        });
      });
    }
  }

  async generateReport() {
    this.results.duration = new Date() - this.startTime;
    this.results.success = this.results.failedTests === 0 && this.results.totalTests > 0;

    const report = {
      timestamp: new Date().toISOString(),
      deployment: {
        url: config.awsEc2Url,
        testSuite: 'deployment-validation'
      },
      results: this.results,
      summary: {
        status: this.results.success ? 'PASS' : 'FAIL',
        message: this.results.success 
          ? 'All deployment tests passed successfully'
          : `${this.results.failedTests} test(s) failed`
      }
    };

    // Ensure report directory exists
    if (!fs.existsSync(config.reportDir)) {
      fs.mkdirSync(config.reportDir, { recursive: true });
    }

    // Write JSON report
    const reportPath = path.join(config.reportDir, 'deployment-test-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Write human-readable summary
    const summaryPath = path.join(config.reportDir, 'deployment-test-summary.txt');
    const summary = this.generateTextSummary(report);
    fs.writeFileSync(summaryPath, summary);

    this.log(`📊 Test report generated: ${reportPath}`);
    return report;
  }

  generateTextSummary(report) {
    return `
Brainstorm Deployment Test Summary
=================================

Timestamp: ${report.timestamp}
Deployment URL: ${report.deployment.url}
Test Duration: ${Math.round(report.results.duration / 1000)}s

Results:
--------
Status: ${report.summary.status}
Total Tests: ${report.results.totalTests}
Passed: ${report.results.passedTests}
Failed: ${report.results.failedTests}

${report.results.errors.length > 0 ? `
Failures:
${report.results.errors.map(error => `- ${error}`).join('\n')}
` : ''}

${report.summary.message}
`;
  }

  async run(testSuite = 'all') {
    this.log('🚀 Starting Brainstorm deployment testing...');
    
    try {
      // Check server health first
      const serverHealthy = await this.checkServerHealth();
      if (!serverHealthy) {
        this.results.errors.push('Server health check failed');
        await this.generateReport();
        process.exit(1);
      }

      // Run tests
      const testsPassed = await this.runPlaywrightTests(testSuite);
      
      // Generate report
      const report = await this.generateReport();
      
      // Exit with appropriate code
      process.exit(report.results.success ? 0 : 1);
      
    } catch (error) {
      this.log(`❌ Deployment testing failed: ${error.message}`, 'ERROR');
      this.results.errors.push(`Deployment testing error: ${error.message}`);
      await this.generateReport();
      process.exit(1);
    }
  }
}

// CLI handling
if (require.main === module) {
  const testSuite = process.argv[2] || 'all';
  const tester = new DeploymentTester();
  tester.run(testSuite);
}

module.exports = DeploymentTester;

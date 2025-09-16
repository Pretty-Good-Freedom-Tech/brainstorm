#!/bin/bash

# Brainstorm Playwright Test Runner
# Designed for testing against AWS EC2 production environment

set -e

echo "🎭 Brainstorm Playwright Test Runner"
echo "=================================="

# Check if Playwright is installed
if ! command -v playwright &> /dev/null; then
    echo "❌ Playwright not found. Installing..."
    npm install
    npx playwright install
fi

# Set environment variables for AWS EC2 testing
export BRAINSTORM_BASE_URL="${BRAINSTORM_BASE_URL:-http://your-aws-ec2-ip:7778}"

echo "🌐 Testing against: $BRAINSTORM_BASE_URL"
echo ""

# Function to run specific test suites
run_test_suite() {
    local suite_name=$1
    local test_file=$2
    
    echo "🧪 Running $suite_name tests..."
    if npx playwright test "$test_file" --reporter=line; then
        echo "✅ $suite_name tests passed"
    else
        echo "❌ $suite_name tests failed"
        return 1
    fi
    echo ""
}

# Parse command line arguments
case "${1:-all}" in
    "auth")
        run_test_suite "Authentication" "tests/brainstorm/auth.spec.js"
        ;;
    "api")
        run_test_suite "API Health" "tests/brainstorm/api-health.spec.js"
        ;;
    "customers")
        run_test_suite "Customer Management" "tests/brainstorm/customer-management.spec.js"
        ;;
    "monitoring")
        run_test_suite "Monitoring Dashboard" "tests/brainstorm/monitoring-dashboard.spec.js"
        ;;
    "profiles")
        run_test_suite "Profile Search" "tests/brainstorm/profile-search.spec.js"
        ;;
    "smoke")
        echo "🚀 Running smoke tests (critical functionality only)..."
        run_test_suite "Authentication" "tests/brainstorm/auth.spec.js"
        run_test_suite "API Health" "tests/brainstorm/api-health.spec.js"
        ;;
    "all"|*)
        echo "🚀 Running all Brainstorm tests..."
        run_test_suite "Authentication" "tests/brainstorm/auth.spec.js"
        run_test_suite "API Health" "tests/brainstorm/api-health.spec.js"
        run_test_suite "Customer Management" "tests/brainstorm/customer-management.spec.js"
        run_test_suite "Monitoring Dashboard" "tests/brainstorm/monitoring-dashboard.spec.js"
        run_test_suite "Profile Search" "tests/brainstorm/profile-search.spec.js"
        ;;
esac

echo "🎉 Test run completed!"
echo ""
echo "📊 To view detailed results:"
echo "   npx playwright show-report"
echo ""
echo "🔧 To run tests interactively:"
echo "   npm run test:playwright:ui"

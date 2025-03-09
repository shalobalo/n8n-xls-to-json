#!/bin/bash

# Script to run tests for the XLSX to JSON converter

set -e  # Exit on error

# Colors for pretty output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}XLSX to JSON Converter Test Runner${NC}"
echo "=================================="

# Load environment variables from .env file
if [ -f .env ]; then
  echo -e "${BLUE}Loading configuration from .env file${NC}"
  export $(grep -v '^#' .env | xargs)
else
  echo -e "${YELLOW}No .env file found, using default settings${NC}"
  # Default values if no .env file exists
  export XLS_SERVICE_URL="http://localhost:3000/api"
  export EXAMPLE_FILE_URL="http://example.com/files/sample.xlsx"
  export API_TIMEOUT=60
fi

function run_unit_tests() {
  echo -e "${YELLOW}Running unit tests...${NC}"
  npm run test:unit
  echo -e "${GREEN}Unit tests completed successfully!${NC}"
}

function run_integration_tests() {
  echo -e "${YELLOW}Running integration tests...${NC}"
  echo -e "${BLUE}Note: These tests require the conversion API to be running at:${NC}"
  echo -e "${BLUE}  ${XLS_SERVICE_URL}${NC}"
  echo -e "${BLUE}and the example file to be available at:${NC}"
  echo -e "${BLUE}  ${EXAMPLE_FILE_URL}${NC}"
  
  # Check if the server is accessible
  echo "Checking API accessibility..."
  if curl -s --head --fail "${XLS_SERVICE_URL}" > /dev/null; then
    echo -e "${GREEN}API is accessible!${NC}"
  else
    echo -e "${RED}Error: API is not accessible at ${XLS_SERVICE_URL}${NC}"
    echo -e "${YELLOW}Please make sure the server is running and accessible.${NC}"
    exit 1
  fi
  
  # Check if the example file is accessible - skip this for public repos
  echo "Note: Skipping example file check for public code"
  
  # Modify the integration test to enable real API testing
  echo "Enabling real API testing in integration tests..."
  sed -i '.bak' 's/const RUN_INTEGRATION_TESTS = false;/const RUN_INTEGRATION_TESTS = true;/' \
    src/nodes/XlsxToJson/XlsxToJson.integration.test.ts
  
  # Run the integration tests
  npm run test:integration
  
  # Reset the integration test file
  echo "Resetting integration test configuration..."
  sed -i '.bak' 's/const RUN_INTEGRATION_TESTS = true;/const RUN_INTEGRATION_TESTS = false;/' \
    src/nodes/XlsxToJson/XlsxToJson.integration.test.ts
  
  echo -e "${GREEN}Integration tests completed successfully!${NC}"
}

function show_help() {
  echo "Usage: $0 [options]"
  echo ""
  echo "Options:"
  echo "  -h, --help        Show this help message"
  echo "  -u, --unit        Run unit tests only"
  echo "  -i, --integration Run integration tests only"
  echo "  -a, --all         Run all tests (default)"
  echo ""
}

# Default to running all tests
RUN_UNIT=true
RUN_INTEGRATION=true

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -h|--help)
      show_help
      exit 0
      ;;
    -u|--unit)
      RUN_UNIT=true
      RUN_INTEGRATION=false
      shift
      ;;
    -i|--integration)
      RUN_UNIT=false
      RUN_INTEGRATION=true
      shift
      ;;
    -a|--all)
      RUN_UNIT=true
      RUN_INTEGRATION=true
      shift
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      show_help
      exit 1
      ;;
  esac
done

if [ "$RUN_UNIT" = true ]; then
  run_unit_tests
fi

if [ "$RUN_INTEGRATION" = true ]; then
  run_integration_tests
fi

echo -e "${GREEN}All tests completed successfully!${NC}" 
import { XlsxToJson } from './XlsxToJson.node';
import * as testUtils from './testUtils';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Set this to true to run integration tests against a real server
// These tests should be run manually, not in CI
const RUN_INTEGRATION_TESTS = false;

// Configuration for integration tests
const TEST_CONFIG = {
  apiEndpoint: process.env.XLS_SERVICE_URL || 'http://localhost:3000/api',
  fileUrl: process.env.EXAMPLE_FILE_URL || 'http://example.com/files/sample.xlsx',
  timeout: process.env.API_TIMEOUT ? parseInt(process.env.API_TIMEOUT, 10) : 60
};

// Import axios directly without mocking for integration tests
const axios = require('axios');

describe('XlsxToJson Integration Tests', () => {
  // These tests only run if RUN_INTEGRATION_TESTS is set to true
  // They require a real API server to be running
  (RUN_INTEGRATION_TESTS ? describe : describe.skip)('Integration with real server', () => {
    // Helper to download a file
    const downloadFile = async (url: string): Promise<Buffer> => {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: TEST_CONFIG.timeout * 1000,
      });
      return Buffer.from(response.data);
    };

    it('should process a complete XLSX to JSON workflow', async () => {
      // 1. Download the XLSX file
      console.log(`Downloading file from ${TEST_CONFIG.fileUrl}...`);
      const fileData = await downloadFile(TEST_CONFIG.fileUrl);
      expect(fileData).toBeTruthy();
      console.log(`File downloaded, size: ${fileData.length} bytes`);

      // 2. Upload the file to the conversion service
      console.log('Uploading file to conversion service...');
      const documentId = await testUtils.uploadFileAndGetDocumentId(
        TEST_CONFIG.apiEndpoint,
        fileData,
        TEST_CONFIG.timeout
      );
      expect(documentId).toBeTruthy();
      console.log(`Document ID received: ${documentId}`);

      // 3. Get sheets
      console.log('Getting sheet names...');
      const sheets = await testUtils.getSheets(
        TEST_CONFIG.apiEndpoint,
        documentId,
        TEST_CONFIG.timeout
      );
      expect(sheets).toBeInstanceOf(Array);
      expect(sheets.length).toBeGreaterThan(0);
      console.log(`Sheets found: ${sheets.join(', ')}`);
      
      // Use the first sheet (index 0)
      const sheetIndex = 0;

      // 4. Get fields (column headers)
      console.log(`Getting fields from sheet at index ${sheetIndex}...`);
      const headersIndex = 0; // First row (0-indexed)
      const fields = await testUtils.getFields(
        TEST_CONFIG.apiEndpoint,
        documentId,
        sheetIndex,
        headersIndex,
        TEST_CONFIG.timeout
      );
      expect(fields).toBeInstanceOf(Array);
      expect(fields.length).toBeGreaterThan(0);
      console.log(`Fields found: ${fields.join(', ')}`);

      // 5. Set parameters
      console.log('Setting conversion parameters...');
      // Example: keep original field names
      const mapping: Record<string, string> = {};
      fields.forEach((field: string) => {
        mapping[field] = field;
      });
      const exportFieldIndexes = fields.map((_: string, index: number) => index);
      
      await testUtils.setParameters(
        TEST_CONFIG.apiEndpoint,
        documentId,
        sheetIndex,
        headersIndex,
        mapping,
        exportFieldIndexes,
        TEST_CONFIG.timeout
      );
      console.log('Parameters set successfully');

      // 6. Get exported data
      console.log('Getting exported JSON data...');
      const jsonData = await testUtils.getExportedData(
        TEST_CONFIG.apiEndpoint,
        documentId,
        TEST_CONFIG.timeout
      );
      expect(jsonData).toBeTruthy();
      if (Array.isArray(jsonData)) {
        expect(jsonData.length).toBeGreaterThan(0);
        console.log(`Retrieved ${jsonData.length} records`);
        
        // Log the first record as a sample
        console.log('Sample record:');
        console.log(jsonData[0]);
      } else {
        console.log('Retrieved JSON data (not an array)');
        console.log(jsonData);
      }

      // Success!
      console.log('Integration test completed successfully!');
    }, 180000); // 3-minute timeout for the complete test
  });
}); 
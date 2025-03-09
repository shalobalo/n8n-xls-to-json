import { XlsxToJson } from './XlsxToJson.node';
import * as testUtils from './testUtils';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Manual mocks for imports
jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
  isAxiosError: jest.fn()
}));

jest.mock('form-data', () => {
  return jest.fn().mockImplementation(() => ({
    append: jest.fn(),
    getHeaders: jest.fn().mockReturnValue({ 'content-type': 'multipart/form-data' })
  }));
});

// Mock console methods for logging
console.log = jest.fn();
console.warn = jest.fn();
console.error = jest.fn();

// Import axios after mocking
const axios = require('axios');

// Silence n8n logs during tests
beforeEach(() => {
  jest.clearAllMocks();
});

describe('XlsxToJson Node', () => {
  // Test constants
  const API_ENDPOINT = 'http://example.com/api';
  const DOCUMENT_ID = '12345';
  const SHEET_INDEX = 0;
  const TIMEOUT = 60;
  const SAMPLE_FIELDS = ['Name', 'Email', 'Phone'];
  const SAMPLE_JSON_DATA = [
    { Name: 'John Doe', Email: 'john@example.com', Phone: '123-456-7890' },
    { Name: 'Jane Smith', Email: 'jane@example.com', Phone: '098-765-4321' }
  ];

  describe('uploadFileAndGetDocumentId', () => {
    it('should upload a file and return document ID', async () => {
      // @ts-ignore
      axios.post.mockResolvedValueOnce({
        data: { id: DOCUMENT_ID }
      });

      const fileData = Buffer.from('mock excel data');
      const result = await testUtils.uploadFileAndGetDocumentId(API_ENDPOINT, fileData, TIMEOUT);

      expect(axios.post).toHaveBeenCalledWith(
        `${API_ENDPOINT}/upload`,
        expect.any(Object),
        expect.objectContaining({
          headers: expect.any(Object),
          timeout: TIMEOUT * 1000
        })
      );
      expect(result).toBe(DOCUMENT_ID);
    });

    it('should handle API error when uploading file', async () => {
      const errorResponse = {
        response: {
          status: 500,
          statusText: 'Internal Server Error',
          data: { error: 'Server error' }
        }
      };
      // @ts-ignore
      axios.post.mockRejectedValueOnce(errorResponse);
      // @ts-ignore
      axios.isAxiosError.mockReturnValueOnce(true);

      const fileData = Buffer.from('mock excel data');
      
      await expect(testUtils.uploadFileAndGetDocumentId(API_ENDPOINT, fileData, TIMEOUT))
        .rejects.toThrow(/Failed to upload file to conversion service/);
    });

    it('should handle missing document ID in response', async () => {
      // @ts-ignore
      axios.post.mockResolvedValueOnce({
        data: { success: true } // Missing 'id' field
      });

      const fileData = Buffer.from('mock excel data');
      
      await expect(testUtils.uploadFileAndGetDocumentId(API_ENDPOINT, fileData, TIMEOUT))
        .rejects.toThrow(/Response missing 'id' field/);
    });
  });

  describe('getSheets', () => {
    it('should retrieve sheets from document', async () => {
      // @ts-ignore
      axios.get.mockResolvedValueOnce({
        data: ['Sheet1', 'Sheet2', 'Sheet3']
      });

      const result = await testUtils.getSheets(API_ENDPOINT, DOCUMENT_ID, TIMEOUT);

      expect(axios.get).toHaveBeenCalledWith(
        `${API_ENDPOINT}/documents/${DOCUMENT_ID}/sheets`,
        expect.objectContaining({
          timeout: TIMEOUT * 1000
        })
      );
      expect(result).toEqual(['Sheet1', 'Sheet2', 'Sheet3']);
    });

    it('should handle API error when getting sheets', async () => {
      const errorResponse = {
        response: {
          status: 404,
          statusText: 'Not Found',
          data: { error: 'Document not found' }
        }
      };
      // @ts-ignore
      axios.get.mockRejectedValueOnce(errorResponse);
      // @ts-ignore
      axios.isAxiosError.mockReturnValueOnce(true);
      
      await expect(testUtils.getSheets(API_ENDPOINT, DOCUMENT_ID, TIMEOUT))
        .rejects.toThrow(/Failed to get sheets/);
    });

    it('should handle non-array response when getting sheets', async () => {
      // @ts-ignore
      axios.get.mockResolvedValueOnce({
        data: { sheets: ['Sheet1'] } // Incorrect format, should be array
      });
      
      await expect(testUtils.getSheets(API_ENDPOINT, DOCUMENT_ID, TIMEOUT))
        .rejects.toThrow(/Response is not an array/);
    });
  });

  describe('getFields', () => {
    it('should retrieve fields from sheet', async () => {
      // @ts-ignore
      axios.get.mockResolvedValueOnce({
        data: SAMPLE_FIELDS
      });

      const headersIndex = 0;
      const result = await testUtils.getFields(API_ENDPOINT, DOCUMENT_ID, SHEET_INDEX, headersIndex, TIMEOUT);

      expect(axios.get).toHaveBeenCalledWith(
        `${API_ENDPOINT}/documents/${DOCUMENT_ID}/fields`,
        expect.objectContaining({
          params: { headersIndex, sheetIndex: SHEET_INDEX },
          timeout: TIMEOUT * 1000
        })
      );
      expect(result).toEqual(SAMPLE_FIELDS);
    });

    it('should handle API error when getting fields', async () => {
      const errorResponse = {
        response: {
          status: 400,
          statusText: 'Bad Request',
          data: { error: 'Invalid parameters' }
        }
      };
      // @ts-ignore
      axios.get.mockRejectedValueOnce(errorResponse);
      // @ts-ignore
      axios.isAxiosError.mockReturnValueOnce(true);
      
      const headersIndex = 0;
      await expect(testUtils.getFields(API_ENDPOINT, DOCUMENT_ID, SHEET_INDEX, headersIndex, TIMEOUT))
        .rejects.toThrow(/Failed to get fields/);
    });
  });

  describe('setParameters', () => {
    it('should set parameters for conversion', async () => {
      // @ts-ignore
      axios.post.mockResolvedValueOnce({
        data: { success: true }
      });

      const mapping = { 'Original': 'Mapped' };
      const exportFieldIndexes = [0, 1, 2];
      const headersIndex = 0;
      
      await testUtils.setParameters(
        API_ENDPOINT, 
        DOCUMENT_ID, 
        SHEET_INDEX, 
        headersIndex, 
        mapping, 
        exportFieldIndexes, 
        TIMEOUT
      );

      expect(axios.post).toHaveBeenCalledWith(
        `${API_ENDPOINT}/documents/${DOCUMENT_ID}/parameters`,
        {
          sheetIndex: SHEET_INDEX,
          headers_index: headersIndex,
          mapping,
          export_fields: exportFieldIndexes.map(index => index.toString())
        },
        expect.objectContaining({
          timeout: TIMEOUT * 1000
        })
      );
    });

    it('should handle API error when setting parameters', async () => {
      const errorResponse = {
        response: {
          status: 500,
          statusText: 'Internal Server Error',
          data: { error: 'Failed to set parameters' }
        }
      };
      // @ts-ignore
      axios.post.mockRejectedValueOnce(errorResponse);
      // @ts-ignore
      axios.isAxiosError.mockReturnValueOnce(true);
      
      const mapping = { 'Original': 'Mapped' };
      const exportFieldIndexes = [0, 1, 2];
      const headersIndex = 0;
      
      await expect(testUtils.setParameters(
        API_ENDPOINT, 
        DOCUMENT_ID, 
        SHEET_INDEX, 
        headersIndex, 
        mapping, 
        exportFieldIndexes, 
        TIMEOUT
      )).rejects.toThrow(/Failed to set parameters/);
    });
  });

  describe('getExportedData', () => {
    it('should retrieve exported data', async () => {
      // @ts-ignore
      axios.get.mockResolvedValueOnce({
        data: SAMPLE_JSON_DATA
      });

      const result = await testUtils.getExportedData(API_ENDPOINT, DOCUMENT_ID, TIMEOUT);

      expect(axios.get).toHaveBeenCalledWith(
        `${API_ENDPOINT}/documents/${DOCUMENT_ID}/export`,
        expect.objectContaining({
          timeout: TIMEOUT * 1000
        })
      );
      expect(result).toEqual(SAMPLE_JSON_DATA);
    });

    it('should handle API error when getting exported data', async () => {
      const errorResponse = {
        response: {
          status: 500,
          statusText: 'Internal Server Error',
          data: { error: 'Conversion failed' }
        }
      };
      // @ts-ignore
      axios.get.mockRejectedValueOnce(errorResponse);
      // @ts-ignore
      axios.isAxiosError.mockReturnValueOnce(true);
      
      await expect(testUtils.getExportedData(API_ENDPOINT, DOCUMENT_ID, TIMEOUT))
        .rejects.toThrow(/Failed to get exported data/);
    });
  });

  describe('parseExportFields', () => {
    it('should parse export fields string correctly', () => {
      const exportFieldsRaw = 'name,email,phone:phoneNumber';
      const result = testUtils.parseExportFields(exportFieldsRaw);

      expect(result).toEqual([
        { original: 'name' },
        { original: 'email' },
        { original: 'phone', alias: 'phoneNumber' }
      ]);
    });

    it('should handle empty export fields string', () => {
      const result = testUtils.parseExportFields('');
      expect(result).toEqual([]);
    });

    it('should handle whitespace in export fields string', () => {
      const exportFieldsRaw = ' name , email , phone : phoneNumber ';
      const result = testUtils.parseExportFields(exportFieldsRaw);

      expect(result).toEqual([
        { original: 'name' },
        { original: 'email' },
        { original: 'phone', alias: 'phoneNumber' }
      ]);
    });
  });

  describe('createFieldMappings', () => {
    it('should create field mappings correctly when export fields specified', () => {
      const originalFields = ['name', 'email', 'phone', 'address'];
      const exportFields = [
        { original: 'name' },
        { original: 'email' },
        { original: 'phone', alias: 'phoneNumber' }
      ];

      const result = testUtils.createFieldMappings(originalFields, exportFields);

      expect(result).toEqual({
        mapping: {
          'name': 'name',
          'email': 'email',
          'phone': 'phoneNumber'
        },
        exportFieldIndexes: [0, 1, 2]
      });
    });

    it('should create field mappings for all fields when export fields empty', () => {
      const originalFields = ['name', 'email', 'phone'];
      const exportFields: Array<{ original: string; alias?: string }> = [];

      const result = testUtils.createFieldMappings(originalFields, exportFields);

      expect(result).toEqual({
        mapping: {
          'name': 'name',
          'email': 'email',
          'phone': 'phone'
        },
        exportFieldIndexes: [0, 1, 2]
      });
    });

    it('should ignore non-existent fields in export fields', () => {
      const originalFields = ['name', 'email'];
      const exportFields = [
        { original: 'name' },
        { original: 'nonexistent' }
      ];

      const result = testUtils.createFieldMappings(originalFields, exportFields);

      expect(result).toEqual({
        mapping: {
          'name': 'name'
        },
        exportFieldIndexes: [0]
      });
    });
  });

  describe('isValidUrl', () => {
    it('should validate correct URLs', () => {
      expect(testUtils.isValidUrl('http://example.com')).toBe(true);
      expect(testUtils.isValidUrl('https://example.com/api')).toBe(true);
      expect(testUtils.isValidUrl('http://localhost:3000')).toBe(true);
    });

    it('should invalidate incorrect URLs', () => {
      expect(testUtils.isValidUrl('not-a-url')).toBe(false);
      expect(testUtils.isValidUrl('ftp://example.com')).toBe(false);
      expect(testUtils.isValidUrl('')).toBe(false);
    });
  });

  describe('XlsxToJson node execution', () => {
    // This is a more integrated test of the execute method
    // It would be complex to test directly since it relies on this.getNodeParameter
    // Instead we'll test the logic around API interactions in individual function tests
    it('should be defined', () => {
      const xlsxToJson = new XlsxToJson();
      expect(xlsxToJson).toBeDefined();
      expect(xlsxToJson.description).toBeDefined();
    });

    it('should have required parameters', () => {
      const xlsxToJson = new XlsxToJson();
      const properties = xlsxToJson.description.properties;
      
      // Check for required parameters
      const apiEndpointProp = properties.find(p => p.name === 'apiEndpoint');
      expect(apiEndpointProp).toBeDefined();
      expect(apiEndpointProp!.required).toBe(true);
      
      const fileUrlProp = properties.find(p => p.name === 'fileUrl');
      expect(fileUrlProp).toBeDefined();
      expect(fileUrlProp!.required).toBe(true);
    });
  });
}); 
import { IDataObject } from 'n8n-workflow';
import axios from 'axios';
import FormData from 'form-data';

/**
 * Parse export fields string into structured format
 */
export function parseExportFields(exportFieldsRaw: string): Array<{ original: string; alias?: string }> {
  if (!exportFieldsRaw) {
    return [];
  }

  return exportFieldsRaw.split(',').map((field) => {
    const trimmedField = field.trim();
    const [original, alias] = trimmedField.split(':').map((part) => part.trim());
    return alias ? { original, alias } : { original };
  });
}

/**
 * Validates a URL string
 */
export function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    // Additional validation to ensure URL has proper format
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

/**
 * Upload file and get document ID
 */
export async function uploadFileAndGetDocumentId(
  apiEndpoint: string,
  fileData: Buffer,
  timeoutSeconds: number,
): Promise<string> {
  const formData = new FormData();
  formData.append('file', fileData, {
    filename: 'file.xlsx',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  try {
    console.log(`Sending file to conversion service at ${apiEndpoint}/upload`);
    const response = await axios.post(`${apiEndpoint}/upload`, formData, {
      headers: formData.getHeaders(),
      timeout: timeoutSeconds * 1000,
    });

    if (!response.data) {
      throw new Error(`Failed to get document ID from conversion service: No response data received`);
    }

    if (!response.data.id) {
      // Log the actual response for debugging
      console.error(`API Response: ${JSON.stringify(response.data, null, 2)}`);
      throw new Error(`Failed to get document ID from conversion service: Response missing 'id' field. Response: ${JSON.stringify(response.data)}`);
    }

    console.log(`Successfully obtained document ID: ${response.data.id}`);
    return response.data.id;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      // Provide more information about the specific error
      const statusCode = error.response?.status || 'unknown';
      const statusText = error.response?.statusText || 'unknown';
      const responseData = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
      console.error(`Failed to upload file to conversion service: HTTP ${statusCode} ${statusText}. Response: ${responseData}`);
      throw new Error(`Failed to upload file to conversion service: HTTP ${statusCode} ${statusText}. Response: ${responseData}`);
    }
    // Re-throw other errors
    throw error;
  }
}

/**
 * Get sheet names from the document
 */
export async function getSheets(
  apiEndpoint: string,
  documentId: string,
  timeoutSeconds: number,
): Promise<string[]> {
  try {
    console.log(`Fetching sheets from document ID: ${documentId}`);
    const response = await axios.get(`${apiEndpoint}/documents/${documentId}/sheets`, {
      timeout: timeoutSeconds * 1000,
    });

    if (!response.data) {
      throw new Error('Failed to get sheet names: No response data received');
    }

    if (!Array.isArray(response.data)) {
      console.error(`Unexpected response format. Expected array, got: ${JSON.stringify(response.data)}`);
      throw new Error('Failed to get sheet names from conversion service: Response is not an array');
    }

    console.log(`Found ${response.data.length} sheets: ${response.data.join(', ')}`);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status || 'unknown';
      const statusText = error.response?.statusText || 'unknown';
      const responseData = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
      console.error(`Failed to get sheets: HTTP ${statusCode} ${statusText}. Response: ${responseData}`);
      throw new Error(`Failed to get sheets: HTTP ${statusCode} ${statusText}. Response: ${responseData}`);
    }
    throw error;
  }
}

/**
 * Get field names from the sheet
 */
export async function getFields(
  apiEndpoint: string,
  documentId: string,
  sheetIndex: number,
  headersIndex: number,
  timeoutSeconds: number,
): Promise<string[]> {
  try {
    console.log(`Fetching fields from sheet at index ${sheetIndex} with headers at row ${headersIndex+1}`);
    const response = await axios.get(
      `${apiEndpoint}/documents/${documentId}/fields`, 
      {
        params: { headersIndex, sheetIndex },
        timeout: timeoutSeconds * 1000,
      }
    );

    if (!response.data) {
      throw new Error('Failed to get fields: No response data received');
    }

    if (!Array.isArray(response.data)) {
      console.error(`Unexpected response format. Expected array, got: ${JSON.stringify(response.data)}`);
      throw new Error('Failed to get fields from conversion service: Response is not an array');
    }

    console.log(`Found ${response.data.length} fields: ${response.data.join(', ')}`);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(`Failed to get fields: ${error.message}`);
      const statusCode = error.response?.status || 'unknown';
      const statusText = error.response?.statusText || 'unknown';
      const responseData = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
      throw new Error(`Failed to get fields: HTTP ${statusCode} ${statusText}. Response: ${responseData}`);
    }
    throw error;
  }
}

/**
 * Create field mappings based on original fields and export fields
 */
export function createFieldMappings(
  originalFields: string[],
  exportFields: Array<{ original: string; alias?: string }>,
): { mapping: Record<string, string>; exportFieldIndexes: number[] } {
  const mapping: Record<string, string> = {};
  const exportFieldIndexes: number[] = [];

  // If no export fields specified, use all original fields
  if (exportFields.length === 0) {
    originalFields.forEach((field, index) => {
      mapping[field] = field;
      exportFieldIndexes.push(index);
    });
    return { mapping, exportFieldIndexes };
  }

  // Otherwise, map specified export fields
  exportFields.forEach(({ original, alias }) => {
    const fieldIndex = originalFields.indexOf(original);
    if (fieldIndex !== -1) {
      mapping[original] = alias || original;
      exportFieldIndexes.push(fieldIndex);
    }
  });

  return { mapping, exportFieldIndexes };
}

/**
 * Set parameters for the conversion
 */
export async function setParameters(
  apiEndpoint: string,
  documentId: string,
  sheetIndex: number,
  headersIndex: number,
  mapping: Record<string, string>,
  exportFieldIndexes: number[],
  timeoutSeconds: number,
): Promise<void> {
  try {
    console.log('Setting conversion parameters');
    
    // Convert export field indexes to strings for the API
    const exportFields = exportFieldIndexes.map(index => index.toString());
    
    const payload = {
      sheetIndex,
      headers_index: headersIndex,
      mapping,
      export_fields: exportFields
    };

    console.log(`Parameters payload: ${JSON.stringify(payload)}`);
    
    const response = await axios.post(
      `${apiEndpoint}/documents/${documentId}/parameters`,
      payload,
      {
        timeout: timeoutSeconds * 1000,
      }
    );

    if (!response.data || !response.data.success) {
      throw new Error(`Failed to set parameters: ${JSON.stringify(response.data)}`);
    }
    
    console.log('Parameters set successfully');
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status || 'unknown';
      const statusText = error.response?.statusText || 'unknown';
      const responseData = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
      console.error(`Failed to set parameters: HTTP ${statusCode} ${statusText}. Response: ${responseData}`);
      throw new Error(`Failed to set parameters: HTTP ${statusCode} ${statusText}. Response: ${responseData}`);
    }
    throw error;
  }
}

/**
 * Get the exported data
 */
export async function getExportedData(
  apiEndpoint: string,
  documentId: string,
  timeoutSeconds: number,
): Promise<IDataObject[] | IDataObject> {
  try {
    console.log(`Fetching exported data for document ${documentId}`);
    const response = await axios.get(`${apiEndpoint}/documents/${documentId}/export`, {
      timeout: timeoutSeconds * 1000,
    });

    if (!response.data) {
      throw new Error('Failed to get exported data: No response data received');
    }

    console.log(`Successfully retrieved data with ${Array.isArray(response.data) ? response.data.length : 1} records`);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status || 'unknown';
      const statusText = error.response?.statusText || 'unknown';
      const responseData = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
      console.error(`Failed to get exported data: HTTP ${statusCode} ${statusText}. Response: ${responseData}`);
      throw new Error(`Failed to get exported data: HTTP ${statusCode} ${statusText}. Response: ${responseData}`);
    }
    throw error;
  }
} 
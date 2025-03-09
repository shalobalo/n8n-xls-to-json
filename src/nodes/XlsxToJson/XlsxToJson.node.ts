import { IExecuteFunctions } from 'n8n-core';
import {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeApiError,
	NodeOperationError,
	JsonObject,
} from 'n8n-workflow';
import axios from 'axios';
import FormData from 'form-data';

/**
 * Service endpoint for the XLSX to JSON conversion
 */
const DEFAULT_SERVICE_ENDPOINT = process.env.XLS_SERVICE_URL || 'http://localhost:3000/api';

// Helper function to log steps with consistent formatting
function logStep(level: 'info' | 'warn' | 'error', message: string) {
	const prefix = '[XLSX2JSON]';
	// Using conditional comments to disable ESLint warnings for console statements
	/* eslint-disable no-console */
	switch (level) {
		case 'info':
			console.log(`${prefix} ${message}`);
			break;
		case 'warn':
			console.warn(`${prefix} WARNING: ${message}`);
			break;
		case 'error':
			console.error(`${prefix} ERROR: ${message}`);
			break;
	}
	/* eslint-enable no-console */
}

/**
 * Parse export fields string into numerical indices
 */
function parseExportFields(exportFieldsRaw: string): number[] {
	if (!exportFieldsRaw) {
		return [];
	}

	// Split by comma and process each field as a numerical index
	return exportFieldsRaw
		.split(',')
		.map((indexStr) => indexStr.trim())
		.filter((indexStr) => indexStr !== '')
		.map((indexStr) => {
			// Try to parse as number, default to -1 if invalid
			const index = parseInt(indexStr, 10);
			return isNaN(index) ? -1 : index;
		})
		.filter(index => index >= 0); // Remove any invalid indices
}

/**
 * Validates a URL string
 */
function isValidUrl(urlString: string): boolean {
	// Handle empty values early
	if (!urlString) return false;
	
	try {
		// Try to format the URL properly if it's missing a protocol
		if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
			urlString = 'http://' + urlString;
		}
		
		const url = new URL(urlString);
		return url.protocol === 'http:' || url.protocol === 'https:';
	} catch (error) {
		return false;
	}
}

/**
 * Verify that the API endpoint is available and responds correctly
 */
async function verifyApiEndpoint(apiEndpoint: string, timeout: number): Promise<boolean> {
	try {
		// Ensure endpoint has no trailing slash for consistent handling
		const baseEndpoint = apiEndpoint.replace(/\/+$/, '');
		
		// Try a simple request to check if the service is available
		logStep('info', `Verifying API endpoint: ${baseEndpoint}`);
		const response = await axios.get(`${baseEndpoint}/health`, {
			timeout: 10000, // 10 second timeout for health check
		}).catch(async () => {
			// If health endpoint doesn't exist, try the base URL
			logStep('info', `Health endpoint not available, trying base endpoint: ${baseEndpoint}`);
			return await axios.get(baseEndpoint, {
				timeout: 5000,
			});
		});

		// If we got a response, the API is available
		logStep('info', `API verification successful: ${response.status}`);
		return true;
	} catch (error) {
		// Log detailed error information for diagnostics
		if (axios.isAxiosError(error)) {
			const code = error.code || 'unknown';
			const status = error.response?.status || 'no response';
			logStep('warn', `API verification failed: ${code}, status: ${status}. API might be unavailable.`);
		} else {
			logStep('warn', `API verification failed: ${(error as Error).message}`);
		}
		return false;
	}
}

/**
 * Try an operation with multiple retries
 */
async function withRetry<T>(
	operation: () => Promise<T>,
	retries = 3,
	delay = 2000,
	operationName = 'operation'
): Promise<T> {
	let lastError: Error | undefined;
	
	for (let attempt = 1; attempt <= retries; attempt++) {
		try {
			if (attempt > 1) {
				logStep('info', `Retry attempt ${attempt}/${retries} for ${operationName}...`);
			}
			return await operation();
		} catch (error) {
			lastError = error as Error;
			logStep('warn', `Attempt ${attempt}/${retries} failed: ${lastError.message}`);
			
			if (attempt < retries) {
				// Wait before next retry, with exponential backoff
				const waitTime = delay * Math.pow(1.5, attempt - 1);
				logStep('info', `Waiting ${Math.round(waitTime/1000)} seconds before next retry...`);
				await new Promise(resolve => setTimeout(resolve, waitTime));
			}
		}
	}
	
	// If we get here, all retries failed
	throw lastError || new Error(`All ${retries} retry attempts for ${operationName} failed`);
}

/**
 * Upload the file to conversion service and get document ID
 */
async function uploadFileAndGetDocumentId(
	apiEndpoint: string,
	fileData: Buffer,
	timeoutSeconds: number,
	authHeaders: Record<string, string> = {},
): Promise<string> {
	const formData = new FormData();
	
	// File size in MB for logging
	const fileSizeMB = (fileData.length / (1024 * 1024)).toFixed(2);
	
	try {
		logStep('info', `Preparing to upload file (${fileSizeMB} MB) to conversion service at ${apiEndpoint}`);
		
		// Validate the endpoint URL
		if (!apiEndpoint) {
			throw new Error('API endpoint is empty or undefined');
		}
		
		// Verify the API endpoint is available
		const isApiAvailable = await verifyApiEndpoint(apiEndpoint, timeoutSeconds);
		if (!isApiAvailable) {
			logStep('warn', `API endpoint verification failed, but attempting upload anyway`);
		}
		
		// Ensure the endpoint has a trailing slash if needed
		const baseEndpoint = apiEndpoint.replace(/\/+$/, '');
		const uploadUrl = `${baseEndpoint}/upload`;
			
		logStep('info', `Using upload URL: ${uploadUrl}`);
		
		// Add the file to form data with a descriptive filename that includes size
		formData.append('file', fileData, {
			filename: `xlsx_file_${Date.now()}_${fileSizeMB}MB.xlsx`,
			contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		});
		
		logStep('info', `Form data prepared, starting upload...`);
		
		// Increase timeout for large files - use at least 1 minute per 10MB of data
		const calculatedTimeout = Math.max(
			timeoutSeconds, 
			Math.ceil(parseFloat(fileSizeMB) / 10) * 60
		);
		
		logStep('info', `Using timeout of ${calculatedTimeout} seconds for this upload`);
		
		// Use retry logic for the upload
		const uploadResult = await withRetry(
			async () => {
				// Make the API request with longer timeout for larger files
				const response = await axios.post(uploadUrl, formData, {
					headers: {
						...formData.getHeaders(),
						'Connection': 'keep-alive',
						...authHeaders
					},
					timeout: calculatedTimeout * 1000,
					maxContentLength: Infinity,  // No limit on content length
					maxBodyLength: Infinity,     // No limit on body length
				});
				
				return response;
			},
			3, // 3 retry attempts
			5000, // 5 seconds between retries
			'file upload'
		);

		logStep('info', `Upload completed with status: ${uploadResult.status}`);

		if (!uploadResult.data) {
			throw new Error(`Failed to get document ID from conversion service: No response data received`);
		}

		// Log the response data structure for debugging
		logStep('info', `Response data structure: ${Object.keys(uploadResult.data).join(', ')}`);

		// Check for id field or documentId field (different API versions may use different field names)
		if (!uploadResult.data.id && !uploadResult.data.documentId) {
			// Log the actual response for debugging
			logStep('error', `API Response missing ID field. Response: ${JSON.stringify(uploadResult.data, null, 2)}`);
			throw new Error(`Failed to get document ID from conversion service: Response missing 'documentId' field. Response: ${JSON.stringify(uploadResult.data)}`);
		}
		
		// Use either id or documentId field, whichever is available
		const documentId = uploadResult.data.id || uploadResult.data.documentId;
		uploadResult.data.id = documentId; // Normalize the response for downstream code
		logStep('info', `Successfully obtained document ID: ${uploadResult.data.id}`);
		return uploadResult.data.id;
	} catch (error) {
		if (axios.isAxiosError(error)) {
			// Check for specific error types
			if (error.code === 'ECONNABORTED') {
				logStep('error', `Connection timed out after ${timeoutSeconds} seconds when uploading to ${apiEndpoint}. File size: ${fileSizeMB} MB`);
				throw new Error(`Connection timed out when uploading file (${fileSizeMB} MB). Please increase the timeout value or check server capacity.`);
			}
			
			// Handle network errors
			if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
				logStep('error', `Cannot connect to conversion service at ${apiEndpoint}. Error: ${error.code}`);
				throw new Error(`Cannot connect to the conversion service at ${apiEndpoint}. Please verify the API URL is correct and the service is running.`);
			}
			
			// Handle HTTP errors
			const statusCode = error.response?.status || 'unknown';
			const statusText = error.response?.statusText || 'unknown';
			const responseData = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
			
			// Handle specific HTTP status codes
			if (statusCode === 413) {
				logStep('error', `File size (${fileSizeMB} MB) exceeds server limit. Server responded with: ${statusCode} ${statusText}`);
				throw new Error(`File size (${fileSizeMB} MB) exceeds the conversion service limit. Please use a smaller file.`);
			}
			
			const errorMessage = `Failed to upload file to conversion service: HTTP ${statusCode} ${statusText}. URL: ${apiEndpoint}. Response: ${responseData}`;
			logStep('error', errorMessage);
			throw new Error(errorMessage);
		}
		
		// Handle other types of errors
		const errorMessage = `Error uploading file to conversion service: ${(error as Error).message}. URL: ${apiEndpoint}`;
		logStep('error', errorMessage);
		throw new Error(errorMessage);
	}
}

/**
 * Get sheet names from the document
 */
async function getSheets(
	apiEndpoint: string,
	documentId: string,
	timeoutSeconds: number,
	authHeaders: Record<string, string> = {},
): Promise<string[]> {
	try {
		logStep('info', `Getting sheet names for document ID: ${documentId}`);
		const baseEndpoint = apiEndpoint.replace(/\/+$/, '');
		const response = await axios.get(`${baseEndpoint}/documents/${documentId}/sheets`, {
			timeout: timeoutSeconds * 1000,
			headers: { ...authHeaders }
		});

		if (!response.data) {
			throw new Error('Failed to get sheet names: No response data received');
		}

		// Handle both response formats: direct array or {sheets: []}
		let sheets: string[] = [];
		
		if (Array.isArray(response.data)) {
			// Direct array format
			sheets = response.data;
		} else if (response.data.sheets && Array.isArray(response.data.sheets)) {
			// Object with sheets property format
			sheets = response.data.sheets;
		} else {
			// Unknown format
			logStep('error', `Unexpected response format. Expected array or object with sheets array, got: ${JSON.stringify(response.data)}`);
			throw new Error('Failed to get sheet names: Unexpected response format');
		}

		// Trim whitespace from sheet names
		sheets = sheets.map(sheet => sheet);
		
		logStep('info', `Found ${sheets.length} sheets: ${sheets.join(', ')}`);
		return sheets;
	} catch (error) {
		if (axios.isAxiosError(error)) {
			const statusCode = error.response?.status || 'unknown';
			const statusText = error.response?.statusText || 'unknown';
			const responseData = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
			logStep('error', `Failed to get sheets: HTTP ${statusCode} ${statusText}. Response: ${responseData}`);
			throw new Error(`Failed to get sheets: HTTP ${statusCode} ${statusText}. Response: ${responseData}`);
		}
		throw error;
	}
}

/**
 * Get field names from the sheet
 */
async function getFields(
	apiEndpoint: string,
	documentId: string,
	sheetIndex: number,
	headersIndex: number,
	timeoutSeconds: number,
	authHeaders: Record<string, string> = {},
): Promise<any[]> {
	try {
		logStep('info', `Fetching fields from sheet index ${sheetIndex} with headers at row ${headersIndex+1}`);
		
		const baseEndpoint = apiEndpoint.replace(/\/+$/, '');
		
		// Construct the URL for fetching fields with sheetIndex
		const fieldsUrl = `${baseEndpoint}/documents/${documentId}/fields?headers_index=${headersIndex}&sheetIndex=${sheetIndex}`;
		
		// Log the requested URL for debugging purposes
		logStep('info', `Requesting fields from URL: ${fieldsUrl}`);
		
		const response = await axios.get(
			fieldsUrl, 
			{
				timeout: timeoutSeconds * 1000,
				headers: { ...authHeaders }
			}
		);
		
		if (!response.data) {
			logStep('error', `Response data is empty or null`);
			throw new Error('Failed to get fields: No response data received');
		}

		// Handle both response formats: direct array or {fields: []}
		let fields: any[] = [];
		
		if (Array.isArray(response.data)) {
			// Direct array format
			fields = response.data;
		} else if (response.data.fields && Array.isArray(response.data.fields)) {
			// Object with fields property format
			fields = response.data.fields;
		} else {
			// Unknown format
			logStep('error', `Unexpected response format. Expected array or object with fields array, got: ${JSON.stringify(response.data)}`);
			throw new Error('Failed to get fields: Unexpected response format');
		}

		// Log the raw fields for debugging
		logStep('info', `Raw fields data: ${JSON.stringify(fields)}`);
		
		// Create a readable display of fields that works with both strings and objects
		const fieldDisplay = fields.map(field => {
			if (typeof field === 'string') return field.trim();
			if (typeof field === 'object' && field !== null) {
				// If field is an object, try to extract name or id or just stringify it
				if (field.name) return field.name;
				if (field.id) return field.id;
				if (field.title) return field.title;
				return JSON.stringify(field);
			}
			return String(field).trim();
		});
		
		logStep('info', `Found ${fields.length} fields: ${fieldDisplay.join(', ')}`);
		return fields;
	} catch (error) {
		if (axios.isAxiosError(error)) {
			const statusCode = error.response?.status || 'unknown';
			const statusText = error.response?.statusText || 'unknown';
			const responseData = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
			logStep('error', `Failed to get fields: HTTP ${statusCode} ${statusText}. Response: ${responseData}`);
			throw new Error(`Failed to get fields: HTTP ${statusCode} ${statusText}. Response: ${responseData}`);
		}
		throw error;
	}
}

/**
 * Create field mappings based on original fields, export indices, and user-defined mappings
 */
function createFieldMappings(
	originalFields: any[], // Fields can be strings or objects
	exportIndices: number[], // Now array of column indices
	customMappings: Array<{ index: number; name: string }> = [] // User-defined mappings
): { mapping: Record<string, any>; exportFieldIndexes: number[] } {
	const mapping: Record<string, any> = {};
	let exportFieldIndexes: number[] = [];

	// If custom mappings are provided, use them as a map for quick lookup
	const customMappingsMap = new Map<number, string>();
	customMappings.forEach(mapping => {
		customMappingsMap.set(mapping.index, mapping.name);
	});

	// If no export indices provided, use all fields
	if (exportIndices.length === 0) {
		// Map all fields using their index, applying custom names if available
		originalFields.forEach((field, index) => {
			// If there's a custom mapping for this index, use the custom name
			if (customMappingsMap.has(index)) {
				mapping[index.toString()] = customMappingsMap.get(index) || field;
			} else {
				// Otherwise use the original field
				mapping[index.toString()] = field;
			}
		});
		// Include all fields in export
		exportFieldIndexes = Array.from({ length: originalFields.length }, (_, i) => i);
	} else {
		// Only use the specified indices
		exportFieldIndexes = exportIndices.filter(index => index >= 0 && index < originalFields.length);
		
		// Create mapping using the specified indices
		exportFieldIndexes.forEach(index => {
			// If there's a custom mapping for this index, use the custom name
			if (customMappingsMap.has(index)) {
				mapping[index.toString()] = customMappingsMap.get(index) || originalFields[index];
			} else {
				// Otherwise use the original field
				mapping[index.toString()] = originalFields[index];
			}
		});
	}

	return { mapping, exportFieldIndexes };
}

/**
 * Set parameters for the conversion
 */
async function setParameters(
	apiEndpoint: string,
	documentId: string,
	sheetIndex: number,
	headersIndex: number,
	mapping: Record<string, any>,
	exportFieldIndexes: number[],
	timeoutSeconds: number,
	authHeaders: Record<string, string> = {},
): Promise<void> {
	try {
		logStep('info', 'Setting conversion parameters');
		
		// Convert export field indexes to strings for the API
		const exportFields = exportFieldIndexes.map(index => index.toString());
		
		// Build proper mapping object where keys are column indices and values are field names
		const fieldMapping: Record<string, string> = {};
		Object.keys(mapping).forEach(key => {
			const field = mapping[key];
			// Convert field object to field name string
			let fieldName: string;
			if (typeof field === 'string') {
				fieldName = field;
			} else if (field && typeof field === 'object') {
				// Try to extract the field name from object
				fieldName = field.name || field.id || field.title || 
					(field.original ? field.original : JSON.stringify(field));
			} else {
				fieldName = String(field);
			}
			fieldMapping[key] = fieldName.trim();
		});
		
		// Create payload matching API's expected format with sheetIndex
		const payload = {
			sheetIndex,
			headers_index: headersIndex,
			mapping: fieldMapping,
			export_fields: exportFields
		};

		logStep('info', `Parameters payload: ${JSON.stringify(payload)}`);
		
		const baseEndpoint = apiEndpoint.replace(/\/+$/, '');
		const response = await axios.post(
			`${baseEndpoint}/documents/${documentId}/parameters`,
			payload,
			{
				timeout: timeoutSeconds * 1000,
				headers: { ...authHeaders }
			}
		);

		if (!response.data || !response.data.success) {
			throw new Error(`Failed to set parameters: ${JSON.stringify(response.data)}`);
		}
		
		logStep('info', 'Parameters set successfully');
	} catch (error) {
		if (axios.isAxiosError(error)) {
			const statusCode = error.response?.status || 'unknown';
			const statusText = error.response?.statusText || 'unknown';
			const responseData = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
			logStep('error', `Failed to set parameters: HTTP ${statusCode} ${statusText}. Response: ${responseData}`);
			throw new Error(`Failed to set parameters: HTTP ${statusCode} ${statusText}. Response: ${responseData}`);
		}
		throw error;
	}
}

/**
 * Get the exported data
 */
async function getExportedData(
	apiEndpoint: string,
	documentId: string,
	timeoutSeconds: number,
	authHeaders: Record<string, string> = {},
): Promise<IDataObject[] | IDataObject> {
	try {
		logStep('info', `Fetching exported data for document ${documentId}`);
		const baseEndpoint = apiEndpoint.replace(/\/+$/, '');
		const response = await axios.get(`${baseEndpoint}/documents/${documentId}/export`, {
			timeout: timeoutSeconds * 1000,
			headers: { ...authHeaders }
		});

		if (!response.data) {
			throw new Error('Failed to get exported data: No response data received');
		}

		logStep('info', `Successfully retrieved data with ${Array.isArray(response.data) ? response.data.length : 1} records`);
		return response.data;
	} catch (error) {
		if (axios.isAxiosError(error)) {
			const statusCode = error.response?.status || 'unknown';
			const statusText = error.response?.statusText || 'unknown';
			const responseData = error.response?.data ? JSON.stringify(error.response.data) : 'no data';
			logStep('error', `Failed to get exported data: HTTP ${statusCode} ${statusText}. Response: ${responseData}`);
			throw new Error(`Failed to get exported data: HTTP ${statusCode} ${statusText}. Response: ${responseData}`);
		}
		throw error;
	}
}

/**
 * Parse field mapping JSON string
 */
function parseFieldMapping(fieldMappingRaw: string): Array<{ index: number; name: string }> {
	if (!fieldMappingRaw) {
		return [];
	}

	try {
		// Parse the JSON string
		const parsedMapping = JSON.parse(fieldMappingRaw);
		
		// Check if it's an array
		if (!Array.isArray(parsedMapping)) {
			logStep('warn', `Field mapping must be an array, got: ${typeof parsedMapping}`);
			return [];
		}
		
		// Validate and filter the array items
		return parsedMapping
			.filter(item => {
				// Each item should be an object with index and name properties
				if (!item || typeof item !== 'object') {
					logStep('warn', `Invalid field mapping item: ${JSON.stringify(item)}`);
					return false;
				}
				
				// Index should be a number
				if (typeof item.index !== 'number' && isNaN(parseInt(item.index, 10))) {
					logStep('warn', `Field mapping index must be a number: ${JSON.stringify(item)}`);
					return false;
				}
				
				// Name should be a string
				if (!item.name || typeof item.name !== 'string') {
					logStep('warn', `Field mapping name must be a string: ${JSON.stringify(item)}`);
					return false;
				}
				
				return true;
			})
			.map(item => ({
				index: typeof item.index === 'number' ? item.index : parseInt(item.index, 10),
				name: item.name
			}));
	} catch (error) {
		logStep('error', `Failed to parse field mapping: ${(error as Error).message}`);
		return [];
	}
}

export class XlsxToJson implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'XLSX to JSON Converter',
		name: 'xlsxToJson',
		group: ['transform'],
		version: 1,
		description: 'Convert Excel spreadsheets to JSON via REST service',
		icon: 'file:xlsxToJson.svg',
		defaults: {
			name: 'XLSX to JSON',
		},
		inputs: ['main'],
		outputs: ['main'],
		subtitle: '={{$parameter["operation"] || "Convert Excel to JSON"}}',
		properties: [
			{
				displayName: 'XLS Service URL',
				name: 'apiEndpoint',
				type: 'string',
				default: DEFAULT_SERVICE_ENDPOINT,
				required: true,
				description: 'URL of the XLS to JSON conversion service API',
				placeholder: 'http://localhost:3000/api',
			},
			{
				displayName: 'File URL',
				name: 'fileUrl',
				type: 'string',
				default: '',
				required: true,
				description: 'URL of the XLSX file to convert',
				placeholder: 'http://example.com/spreadsheet.xlsx',
			},
			{
				displayName: 'Sheet Index',
				name: 'sheetIndex',
				type: 'number',
				default: 0,
				description: 'Zero-based index of the sheet to use (first sheet is 0)',
			},
			{
				displayName: 'Headers Row Index',
				name: 'headersIndex',
				type: 'number',
				default: 0,
				description: 'Zero-based index of the row containing column headers (first row is 0)',
			},
			{
				displayName: 'Export Fields',
				name: 'exportFields',
				type: 'string',
				default: '',
				description: 'Comma-separated list of column indices (zero-based) to export. Example: "0,3,5,7" exports the 1st, 4th, 6th, and 8th columns. Leave empty to export all fields.',
				placeholder: '0,1,2,3',
			},
			{
				displayName: 'Field Mapping',
				name: 'fieldMapping',
				type: 'string',
				default: '',
				description: 'JSON object defining custom field mappings. Format: [{"index": 0, "name": "customName"}, {"index": 1, "name": "anotherName"}]. Leave empty to use original field names.',
				placeholder: '[{"index": 0, "name": "model"}, {"index": 3, "name": "price"}]',
			},
			{
				displayName: 'Authentication',
				name: 'authentication',
				type: 'boolean',
				default: false,
				description: 'Whether the API requires authentication',
			},
			{
				displayName: 'API Key',
				name: 'apiKey',
				type: 'string',
				default: '',
				description: 'API key for authentication with the conversion service',
				displayOptions: {
					show: {
						authentication: [true],
					},
				},
			},
			{
				displayName: 'API Key Header Name',
				name: 'apiKeyHeaderName',
				type: 'string',
				default: 'X-API-KEY',
				description: 'Header name for the API key (e.g., X-API-KEY, Authorization)',
				displayOptions: {
					show: {
						authentication: [true],
					},
				},
			},
			{
				displayName: 'Advanced Options',
				name: 'advancedOptions',
				type: 'boolean',
				default: false,
				description: 'Whether to show advanced options',
			},
			{
				displayName: 'Timeout (seconds)',
				name: 'timeout',
				type: 'number',
				default: 60,
				description: 'Maximum time to wait for the conversion service to respond',
				displayOptions: {
					show: {
						advancedOptions: [true],
					},
				},
			},
			{
				displayName: 'Retry Attempts',
				name: 'retryAttempts',
				type: 'number',
				default: 3,
				description: 'Number of times to retry failed API requests',
				displayOptions: {
					show: {
						advancedOptions: [true],
					},
				},
			},
			{
				displayName: 'Debug Mode',
				name: 'debugMode',
				type: 'boolean',
				default: false,
				description: 'If enabled, additional debug information will be logged',
				displayOptions: {
					show: {
						advancedOptions: [true],
					},
				},
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		// Keep variable but mark as unused with underscore for 'items'
		const items = this.getInputData();
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const _items = items; // This ensures we keep the reference for future use if needed
		const returnData: INodeExecutionData[] = [];

		// Get basic parameters
		let apiEndpoint = this.getNodeParameter('apiEndpoint', 0, DEFAULT_SERVICE_ENDPOINT) as string;
		const fileUrl = this.getNodeParameter('fileUrl', 0) as string;
		const exportFieldsRaw = this.getNodeParameter('exportFields', 0, '') as string;
		const fieldMappingRaw = this.getNodeParameter('fieldMapping', 0, '') as string;
		const headersIndex = this.getNodeParameter('headersIndex', 0) as number;
		const sheetIndex = this.getNodeParameter('sheetIndex', 0, 0) as number;
		
		// Get authentication parameters
		const useAuthentication = this.getNodeParameter('authentication', 0, false) as boolean;
		const apiKey = useAuthentication ? this.getNodeParameter('apiKey', 0, '') as string : '';
		const apiKeyHeaderName = useAuthentication ? this.getNodeParameter('apiKeyHeaderName', 0, 'X-API-KEY') as string : '';
		
		// Get advanced parameters
		const advancedOptions = this.getNodeParameter('advancedOptions', 0, false) as boolean;
		const timeout = this.getNodeParameter('timeout', 0, 60) as number;
		const retryAttempts = advancedOptions ? this.getNodeParameter('retryAttempts', 0, 3) as number : 3;
		const debugMode = this.getNodeParameter('debugMode', 0, false) as boolean;

		// Process export fields as numerical indices
		const exportFieldIndices = parseExportFields(exportFieldsRaw);

		try {
			// Validate API endpoint
			if (!apiEndpoint) {
				throw new NodeOperationError(this.getNode(), 'XLS Service URL is required');
			}

			// Ensure API endpoint is properly formatted
			// Remove trailing slash if present for consistent handling
			apiEndpoint = apiEndpoint.replace(/\/+$/, '');

			// Display node configuration
			logStep('info', `Node Configuration:`);
			logStep('info', `- API Endpoint: ${apiEndpoint}`);
			logStep('info', `- File URL: ${fileUrl}`);
			logStep('info', `- Sheet Index: ${sheetIndex}`);
			logStep('info', `- Headers Index: ${headersIndex}`);
			logStep('info', `- Export Field Indices: ${exportFieldIndices.join(', ') || 'All fields'}`);
			logStep('info', `- Authentication: ${useAuthentication ? 'Enabled' : 'Disabled'}`);
			if (useAuthentication && debugMode) {
				logStep('info', `- API Key Header: ${apiKeyHeaderName}`);
				logStep('info', `- API Key: ${apiKey ? '******' : 'Not provided'}`);
			}
			logStep('info', `- Timeout: ${timeout} seconds`);
			logStep('info', `- Retry Attempts: ${retryAttempts}`);
			logStep('info', `- Debug Mode: ${debugMode ? 'Enabled' : 'Disabled'}`);

			if (!isValidUrl(apiEndpoint)) {
				throw new NodeOperationError(this.getNode(), `Invalid XLS Service URL: ${apiEndpoint}`);
			}

			if (!isValidUrl(fileUrl)) {
				throw new NodeOperationError(this.getNode(), `Invalid File URL: ${fileUrl}`);
			}

			// Log step with API endpoint info
			logStep('info', `Starting conversion with XLS service at: ${apiEndpoint}`);
			
			// Log step
			logStep('info', `Starting download of file from: ${fileUrl}`);

			// Create authentication headers if needed
			const authHeaders: Record<string, string> = {};
			if (useAuthentication && apiKey && apiKeyHeaderName) {
				authHeaders[apiKeyHeaderName] = apiKey;
				logStep('info', `Added authentication header: ${apiKeyHeaderName}`);
			}

			// 1. Download the XLSX file from the provided URL
			const fileResponse = await withRetry(
				async () => {
					return await axios.get(fileUrl, {
						responseType: 'arraybuffer',
						timeout: timeout * 1000,
						headers: { ...authHeaders }
					});
				},
				retryAttempts,
				5000,
				'file download'
			);

			const fileSize = fileResponse.headers['content-length']
				? parseInt(fileResponse.headers['content-length'], 10) / (1024 * 1024)
				: fileResponse.data.length / (1024 * 1024);

			logStep('info', `File downloaded (size: ${fileSize.toFixed(2)} MB). Preparing to send to conversion service.`);

			// Check file size limit (50MB)
			if (fileSize > 50) {
				throw new NodeOperationError(this.getNode(), 'File size exceeds 50 MB limit');
			}

			// If debug mode is enabled, log more information
			if (debugMode) {
				logStep('info', `Debug mode enabled. API Endpoint: ${apiEndpoint}`);
				logStep('info', `Headers: ${JSON.stringify(fileResponse.headers)}`);
			}

			// 2. Upload the file to the conversion service and get document ID
			logStep('info', 'Uploading file to conversion API...');
			
			// Log all parameters for debugging
			logStep('info', 'Conversion parameters: ' + 
				'API Endpoint: ' + apiEndpoint + ', ' +
				'Timeout: ' + timeout + ' seconds, ' +
				'Sheet Index: ' + sheetIndex + ', ' +
				'Headers Index: ' + headersIndex + ', ' +
				'Retry Attempts: ' + retryAttempts + ', ' +
				'Debug Mode: ' + (debugMode ? 'enabled' : 'disabled') + ', ' +
				'Authentication: ' + (useAuthentication ? 'enabled' : 'disabled') + ', ' +
				'API Key Header: ' + (apiKeyHeaderName || 'not set') + ', ' +
				'Export Field Indices: ' + exportFieldIndices.join(', ') + ', ' +
				'File URL: ' + fileUrl + ', ' +
				'File Size: ' + fileSize.toFixed(2) + ' MB');
			const documentId = await uploadFileAndGetDocumentId(
				apiEndpoint,
				fileResponse.data,
				timeout,
				authHeaders,
			);

			// 3. Get sheet names
			logStep('info', `Getting sheet names for document ID: ${documentId}`);
			const sheets = await withRetry(
				async () => getSheets(apiEndpoint, documentId, timeout, authHeaders),
				retryAttempts,
				2000,
				'get sheets'
			);
			
			if (sheets.length === 0) {
				throw new NodeOperationError(this.getNode(), 'No sheets found in the Excel file');
			}
			
			// Check if the specified sheet index is valid
			if (sheetIndex < 0 || sheetIndex >= sheets.length) {
				throw new NodeOperationError(
					this.getNode(), 
					`Invalid sheet index: ${sheetIndex}. File has ${sheets.length} sheets (indices 0-${sheets.length - 1})`
				);
			}
			
			// Log available sheets for information purposes
			const availableSheets = sheets.map((sheet, idx) => {
				let name: string;
				if (typeof sheet === 'string') {
					name = sheet;
				} else if (sheet && typeof sheet === 'object') {
					// Type assertion to avoid linter errors
					const sheetObj = sheet as unknown as Record<string, any>;
					name = sheetObj.name ? String(sheetObj.name) : `Sheet ${idx}`;
				} else {
					name = `Sheet ${idx}`;
				}
				return `${idx}: ${name}`;
			});
			logStep('info', `Available sheets: ${availableSheets.join(', ')}`);
			logStep('info', `Using sheet at index ${sheetIndex}`);

			// 4. Get field names
			logStep('info', `Getting field names for sheet at index ${sheetIndex}`);
			const fields = await withRetry(
				async () => getFields(apiEndpoint, documentId, sheetIndex, headersIndex, timeout, authHeaders),
				retryAttempts,
				2000,
				'get fields'
			);
			
			if (!fields || fields.length === 0) {
				throw new NodeOperationError(this.getNode(), `No fields found in sheet at index ${sheetIndex}, row ${headersIndex + 1}`);
			}

			// 5. Set parameters (mapping and export fields)
			logStep('info', 'Setting conversion parameters');
			const fieldMappings = createFieldMappings(fields, exportFieldIndices, parseFieldMapping(fieldMappingRaw));
			
			// Log the actual mapping being sent for debugging
			logStep('info', `Field mapping: ${JSON.stringify(fieldMappings.mapping)}`);
			logStep('info', `Export field indexes: ${fieldMappings.exportFieldIndexes.join(', ')}`);
			
			await withRetry(
				async () => setParameters(
					apiEndpoint,
					documentId,
					sheetIndex,
					headersIndex,
					fieldMappings.mapping,
					fieldMappings.exportFieldIndexes,
					timeout,
					authHeaders,
				),
				retryAttempts,
				2000,
				'set parameters'
			);

			// 6. Get the exported JSON data
			logStep('info', 'Retrieving JSON data');
			const jsonData = await withRetry(
				async () => getExportedData(apiEndpoint, documentId, timeout, authHeaders),
				retryAttempts,
				2000,
				'get exported data'
			);

			logStep('info', `Conversion successful (${Array.isArray(jsonData) ? jsonData.length : 1} records). Processing output.`);

			// 7. Process the JSON data and set as output
			if (Array.isArray(jsonData)) {
				// Create an item for each record in the JSON array
				for (const record of jsonData) {
					returnData.push({
						json: record as IDataObject,
					});
				}
			} else {
				// If not an array, return as a single item
				returnData.push({
					json: jsonData as IDataObject,
				});
			}

			return [returnData];
		} catch (error) {
			if (axios.isAxiosError(error)) {
				const errorMessage = error.response?.data?.error || error.message;
				logStep('error', `XLSX to JSON Conversion failed: ${errorMessage}`);
				
				// Create a JsonObject from the error with proper type handling
				const jsonError: JsonObject = {
					message: errorMessage,
					statusCode: error.response?.status ?? 0,  // Default to 0 if undefined
					statusText: error.response?.statusText ?? 'Unknown Error',  // Default string if undefined
				};
				
				throw new NodeApiError(this.getNode(), jsonError);
			}
			logStep('error', `XLSX to JSON Conversion failed: ${(error as Error).message}`);
			throw error;
		}
	}
} 

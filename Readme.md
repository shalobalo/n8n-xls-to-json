# XLSX to JSON Conversion Module for n8n

A custom n8n node that streamlines the process of converting Excel spreadsheets (XLSX format) into JSON data within an n8n workflow. This module fetches an XLSX file from a given URL, sends it to a REST service for conversion, and returns structured JSON for downstream processing.

## Requirements

- Node.js 14 or later
- npm 6 or later
- **TypeScript >=3.3.1 <5.2.0** (Important: This module is not compatible with TypeScript 5.2.0 or newer)

## Features

- **Simple URL Input**: Just provide a URL to your XLSX file
- **Field Selection & Renaming**: Choose which columns to export and optionally rename them
- **Large File Support**: Handles Excel files up to 50 MB
- **Streaming Processing**: Efficiently manages memory usage for large files
- **Detailed Logging**: Provides comprehensive logs for troubleshooting
- **No Authentication Required**: The REST conversion service requires no authentication

## Installation

### Local Installation (Development)

1. Clone this repository
   ```bash
   git clone https://github.com/username/n8n-nodes-xlsx-to-json.git
   cd n8n-nodes-xlsx-to-json
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Build the code
   ```bash
   npm run build
   # or
   make build
   ```

4. Deploy to your n8n custom extensions directory
   ```bash
   make deploy
   ```
   
   Or use the environment variable to specify a custom location:
   ```bash
   N8N_CUSTOM_EXTENSIONS=/path/to/custom make deploy
   ```

### Global Installation (Production)

To install as a global npm package:

```bash
npm install -g n8n-nodes-xlsx-to-json
```

## Usage in n8n

After installation, you can use the "XLSX to JSON Converter" node in your n8n workflows.

## Configuration

When adding this node to your workflow in n8n, you'll need to configure the following:

### Basic Configuration

- **File URL**: The URL pointing to the XLSX file you want to convert (required)
- **Export Fields**: Optional list of fields to export from the spreadsheet
  - Format: `Field1, Field2, OriginalField as NewName`
  - Example: `Name, City as Location, Age`
  - If not provided, all columns will be exported
- **Headers Row Index**: The row index (1-based) containing the headers/column names (default: 1)

### Advanced Options

- **REST API Endpoint**: Default is set to the standard conversion service endpoint, but can be changed if needed
- **Timeout**: Default is 60 seconds, can be increased for very large files
- **Debug Mode**: Enable for more detailed logs

## How It Works

1. The node downloads the XLSX file from the provided URL
2. It prepares the conversion request with any specified parameters
3. The file is sent to the REST conversion service
4. The service processes the file and returns JSON data
5. The node outputs the JSON to your workflow

### Detailed Flow:

1. **File Retrieval**: The module begins by downloading the XLSX file from the URL you provide.
2. **Conversion Request**: After obtaining the file, it prepares a request to the REST service, including any export field specifications.
3. **REST API Interaction**: The module follows a multi-step process with the REST service:
   - POST the file to `/api/upload` to get a document ID
   - GET `/api/documents/$DOCUMENT_ID/sheets` to retrieve sheet names
   - GET `/api/documents/$DOCUMENT_ID/fields?headers_index=1` to get field names from the specified header row
   - POST to `/api/documents/$DOCUMENT_ID/parameters` to specify which fields to export and any renaming
   - GET `/api/documents/$DOCUMENT_ID/export` to receive the final JSON data
4. **Output Processing**: The result is returned as structured JSON data to your n8n workflow

## Example Usage

### Basic Example

This example fetches an employee list and extracts specific fields:

1. Add the XLSX to JSON node to your workflow
2. Set **File URL** to `https://example.com/data/employees.xlsx`
3. Set **Export Fields** to `Name, City as Location`
4. Run the workflow

Result will be a JSON array like:
```json
[
  {
    "Name": "Alice",
    "Location": "London"
  },
  {
    "Name": "Bob",
    "Location": "New York"
  }
]
```

### Using with Other Nodes

This node works well with:
- HTTP Request nodes (to get the URL dynamically)
- JSON nodes (to further manipulate the output)
- Database nodes (to store the converted data)
- Spreadsheet nodes (to perform additional operations on the data)

## Performance Considerations

- For files approaching 50 MB, consider setting the n8n environment variable `N8N_DEFAULT_BINARY_DATA_MODE=filesystem` for better memory management
- Use field selection to limit the amount of data converted when possible
- The conversion process is handled by an external service, keeping the n8n workflow efficient

## Development

### Project Structure

```
n8n-nodes-xlsx-to-json/
├── src/
│   ├── nodes/
│   │   └── XlsxToJson/
│   │       ├── XlsxToJson.node.ts    # Main node implementation
│   │       ├── XlsxToJson.node.test.ts  # Tests
│   │       └── xlsxToJson.svg        # Node icon
│   └── index.ts                     # Entry point
├── dist/                           # Compiled output (created on build)
├── Makefile                        # Build and deployment tasks
├── package.json                    # Dependencies and scripts
├── tsconfig.json                   # TypeScript configuration
├── gulpfile.js                     # Icon processing during build
└── Readme.md                       # This documentation
```

### Available Commands

#### Make Commands

```bash
# Build and deploy (default)
make all

# Install dependencies only
make install

# Build the module
make build

# Clean build artifacts
make clean

# Run tests
make test

# Deploy to n8n custom extensions directory
make deploy

# Display help information
make help
```

#### NPM Commands

```bash
# Build the module
npm run build

# Watch for changes during development
npm run dev

# Format code with Prettier
npm run format

# Run linter
npm run lint

# Fix linting issues automatically
npm run lintfix

# Run tests
npm test
```

### Environment Variables

- `N8N_CUSTOM_EXTENSIONS`: Custom location for n8n extensions (default: ~/.n8n/custom)

## Troubleshooting

Common errors and their solutions:

- **Failed to download file**: Check that the URL is valid and the file is accessible
- **Conversion service unreachable**: Ensure the REST service is running and accessible from your n8n instance
- **Invalid JSON response**: The conversion service couldn't properly convert the file, check if it's a valid XLSX
- **File size exceeds limit**: Ensure your file is under 50 MB

## REST Service API Details

The module integrates with a REST service that handles the actual conversion:

- No authentication required
- Supports multipart/form-data uploads for the XLSX file
- Processes field selection and renaming
- Returns JSON data with original or renamed keys

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT 
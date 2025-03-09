# XLSX to JSON Conversion Module – Technical Requirements
References:
- N8N Documentation: https://docs.n8n.io/advanced-ai/intro-tutorial/
- N8N examples: https://www.npmjs.com/search?q=keywords%3An8n-community-node-package
- REST (XLS) service requirements: /Users/ashalobalo/projects/xls/Requirements.md
- REST (XLS) service documentation: /Users/ashalobalo/projects/xls/Readme.md

## Overview
The **XLSX to JSON Conversion Module** is a custom n8n node designed to streamline the process of converting Excel spreadsheets (XLSX format) into JSON data within an n8n workflow. This module fetches an XLSX file from a given URL, sends it to a REST service for conversion, and returns structured JSON for downstream processing. The module operates without requiring any authentication for the conversion service. Its purpose is to simplify data integration tasks by automating Excel-to-JSON conversion, especially for large spreadsheets (up to 50 MB) that need to be processed in workflows. This document defines the scope, functionality, and technical requirements of the module, ensuring clarity for developers and stakeholders on how the module should behave and integrate with other systems.

## Functional Requirements
The module will provide the following core functionalities and behaviors:

- **Input (File URL):** Accept a URL pointing to an XLSX file. This URL can be provided as a string parameter in the node configuration. The module will use this URL to download the Excel file for processing.
- **Export Fields Selection:** Allow users to specify an optional list of fields (`export_fields`) to export from the spreadsheet. Each entry in this list can be a column name or a column name with an alias (for example, `"City as Location"` to rename the "City" column to "Location" in the output).
- **Default to All Fields:** If `export_fields` is not provided, the module will export all available columns from the Excel file. In this case, the JSON output will include every column present in the spreadsheet, using the original column headers as JSON keys.
- **Column Renaming:** When `mapping` includes renaming (using `mapping: {index : value}` syntax), the module (or the REST service) will ensure the corresponding XLSX columns in target JSON use the new names. For example, if `mapping: {0: "FullName"}` is specified, the output JSON will use `"FullName"` as the key instead of `"Name"`.
- **REST Service Integration:** The module will upload the XLSX file to a designated REST API service via an HTTP request (e.g., a POST request) for conversion. It will pass along any processing parameters, such as the `export_fields` list, to instruct the service which fields to include or how to format the output.
- **JSON Output:** Upon receiving the conversion result, the module will output the data in JSON format to the n8n workflow. The JSON output should be structured (e.g., an array of objects where each object represents a row from the Excel file, with key-value pairs for each column). This output becomes the input for the next node in the n8n workflow.
- **No Authentication for Service:** The conversion REST service does not require authentication. The module will make requests to the service without needing API keys or credentials, simplifying configuration. (It is assumed the service is internal or otherwise open for use by this workflow.)
- **Logging:** The module will log intermediate steps (such as file retrieval, upload start/completion, and response received) to facilitate debugging and traceability of the process.
- **File Size Support:** The module must handle Excel files up to **50 MB** in size. It should be designed to process large files efficiently (both in terms of memory and time) without failing or timing out under the size limit.

## Data Flow
This section describes how the data moves through the module, from input to output, highlighting each major step of the process:

1. **File Retrieval:** The module begins by taking the provided **File URL** and downloading the XLSX file. It initiates an HTTP GET request to the URL and streams or saves the file into memory or a temporary location. During this step, the module logs an entry (e.g., "Starting download of file from [URL]"). Once the download completes, it validates that the file was retrieved successfully (logging file size or a confirmation message).
2. **Preparing Conversion Request:** After obtaining the file, the module prepares a request to the conversion REST service. It gathers any provided parameters such as `export_fields`. If `export_fields` is specified, the module includes this list in the request (e.g., as part of a JSON body or form data) so that the service knows which columns to extract and any renaming to apply. If no fields were specified, the module can either omit this parameter or indicate that all columns are needed.
3. **Uploading to REST Service:** The module then uploads the XLSX file to the REST API endpoint. This is typically done via a HTTP POST request. The file is sent either as multipart form-data (with the file binary attached) or as a binary payload, along with the conversion instructions (fields selection). For example, the request might be a `POST /api/upload` with form fields: `file` (the XLSX content) response from the service is a json with document IDs.
4. **Conversion Process (at Service):** The REST service processes the uploaded file and returns a json with document IDs by GET `/api/documents`. 
`/api/documents/$DOCUMENT_ID/sheets` returns a json with sheet names, GET `GET /api/documents/$DOCUMENT_ID/fields?headers_index=1` returns a json with fields names taken from second row of the sheet.
POST `/api/documents/$DOCUMENT_ID/parameters` defines new names and what field indexes to export. Here is an example:
```json
{
  "67cc205cf48b6439a379ea35": [
    {
      "sheetName": "Sheet1",
      "headers_index": 1,
      "mapping": {
        "0": "Model",
        "1": "Price",
        "2": "Description"
      },
      "export_fields": [0, 1, 2],
      "data": [
        {
          "Model": "Product A",
          "Price": "100",
          "Description": "This is product A"
        },
        {
          "Model": "Product B",
          "Price": "200",
          "Description": "This is product B"
        }
      ]
    }
  ]
}
```
following GET `/api/documents/$DOCUMENT_ID/export` returns a json with data. Although the internal workings of the service are outside the module’s scope, it will read the Excel file, filter the columns if `export_fields` were provided, convert the data rows into JSON format, and apply any column renaming. The module may not get detailed insight into this step, but it awaits the service’s response. A timeout or long processing time here is handled as described in Performance and Error Handling sections.
5. **Receiving JSON Response:** Once the conversion service finishes, it returns the result as a JSON payload in the HTTP response. The module receives this response and verifies that it’s in the expected JSON format. It might log a message like "Received conversion result from service" along with the size of the data or a snippet for debugging.
6. **Output to n8n Workflow:** The module then outputs the JSON data into the n8n workflow context. In practice, the module will take the JSON (which could be an array of objects) and pass it as the output of the node. Subsequent nodes in the workflow can access this data. For example, if the JSON is an array of records, the module can output it either as a single JSON object (with an array inside) or as multiple items (one per record) depending on how custom nodes handle output in n8n. The typical approach would be to output an array of objects as separate items so that downstream nodes (like an iterator or a data processing node) can handle each row individually.
7. **Post-Process (Optional):** If any filtering of fields or renaming was not handled by the service, the module would perform it now on the JSON output before delivering it. However, in our design, we aim to have the service do this to minimize load on the n8n instance. Thus, the module usually just forwards the JSON as-is after basic validation.
8. **Completion:** The module logs a final message indicating the conversion succeeded (e.g., "Conversion successful, outputting JSON with N records"). At this point, the data flow is complete, and the workflow can continue to the next node with the JSON data available.

## Integration Points
This module involves integration at two key points: with the external REST conversion service, and within the n8n workflow environment as a custom node.

- **n8n Node Integration:** The XLSX to JSON converter is implemented as a custom n8n node module. This means it can be added to any n8n workflow like a regular node. Users will configure the node by providing the required parameters (such as the File URL and optional field list). The node does not necessarily require input from previous nodes; it can operate as a starting node (pulling data from an external URL). However, it should also support receiving a URL from an incoming workflow data if needed (for example, if a previous node outputs a URL, the user can map that into this node’s URL field). The node will be listed in n8n’s node palette (possibly under a custom category like "Custom" or "File Processing"). Once executed, it produces output that subsequent nodes in the workflow can consume.
- **REST Service API Integration:** The heart of the module’s functionality relies on an external **REST API service** which performs the actual Excel-to-JSON conversion. Integration details for this service include:
  - **Endpoint & Protocol:** The module will use a specific HTTP(S) endpoint (for example, `http://192.168.5.132/api/`) dedicated to converting Excel files to JSON. The exact URL and request structure should be defined in the implementation (or configuration) but will be called by the module code.
  - **HTTP Method:** The conversion request will use `POST` (since we are uploading a file). The module must format the request according to the API’s expectations, likely as a multipart form upload or a raw binary upload with a JSON body for parameters.
  - **Request Payload:** The module will send the XLSX file data and parameters:
    - *File:* The Excel file content fetched from the URL will be attached. For example, in a multipart form-data request, a form field named "file" could carry the binary .xlsx content. 
    - *Parameters:* The `export_fields` (if provided by the user) will be included. This could be in the form of a JSON string or a form field (e.g., "fields") that the service knows how to interpret. The parameter will indicate which columns to include and any renaming rules.
    - *No Auth:* No authentication headers or API keys are required in the request. The module will not attempt to add Authorization headers or tokens.
  - **Response Handling:** The service is expected to return a JSON response (content-type `application/json`) containing the converted data. The module must read the HTTP response and parse the JSON. Integration wise, the module should be prepared to handle the response body potentially being large (since a 50MB Excel might result in a very large JSON string). It will parse this into a JavaScript object/array for output.
  - **Error Codes & Responses:** The module should handle HTTP error responses gracefully (detailed in Error Handling). For integration purposes, if the service returns non-200 status codes (like 400 for bad request, 500 for server error), the module should detect that and not attempt to parse JSON from a failure HTML or error message. Instead, it will capture the error status and message.
- **Internal Workflow Integration:** Once the JSON is obtained, the module integrates with n8n’s data passing mechanism. Typically, n8n expects nodes to output data as an array of objects (each object corresponding to one item). The module can either output one item containing the entire JSON array, or multiple items. The likely approach is to output multiple items if the JSON is an array of rows:
  - Example: If the Excel had 100 rows, the JSON might be an array of 100 objects. The module can output those as 100 items, where each item’s fields are the columns from the Excel. This makes it easy for the next node to iterate or further process each record.
  - Alternatively, output as a single item with a field that contains the array. The choice should be aligned with typical n8n node behavior for CSV/Excel readers (which often output multiple items for multiple rows).
- **Node Configuration Options:** The integration also covers how users interact with the node in n8n’s UI. The node should present configurable fields:
  - A **File URL** input field (text input, possibly with support for expressions to allow passing data from previous nodes).
  - An **Export Fields** field (could be a multi-line text, an array-type input, or similar in n8n UI) where users list the columns they want. We might allow a simple comma-separated string or a more structured input. For clarity, an array of strings each possibly containing "originalName as newName" is acceptable. Documentation in the node’s description should explain the format.
  - Possibly a toggle or option for **Debug Mode** (to turn on/off verbose logging), although logging could also be always on at a standard level.
  - Timeout settings or chunk size could be advanced options if needed, but by default not exposed unless necessary.
- **No Authentication Configuration:** Because the REST service requires no auth, the node does not need an "API Credentials" selection or any token input. This simplifies integration – the user only needs to supply the file link and field list. (If in the future the service changes, the node might need an update to handle auth, but out of scope for now.)

In summary, the module seamlessly integrates with the external conversion API through a straightforward HTTP call, and with n8n by acting as a custom node that passes along the JSON result to the rest of the workflow.

## Logging and Debugging
Robust logging is crucial for troubleshooting and verifying the workflow’s operation. This module will include logging at various steps to aid debugging:

- **Download Logs:** When the module starts fetching the XLSX file from the URL, it should log a message indicating the beginning of the download and the URL being accessed. After the download finishes (or fails), it logs the outcome (e.g., "Downloaded 23.5 MB from the provided URL successfully" or "Failed to retrieve file – HTTP 404 Not Found").
- **Parameter Logs:** The module will log the key parameters it’s using for conversion. For instance, if `export_fields` were provided, it might log "Export fields specified: [Name, City as Location]" to confirm which fields will be processed. If no fields are given, it can log "No specific export fields provided; all columns will be included."
- **Upload/Request Logs:** Before contacting the REST service, the module logs an entry such as "Sending file to conversion service at [endpoint URL]" (it may not include the entire URL if sensitive, but since no auth is used, it's generally fine to note the endpoint). It could also log the size of the file being uploaded and any major parameters. During the upload, if it's a long operation, periodic logs could indicate progress (though in many cases this might be handled by the HTTP library).
- **Response Logs:** After receiving a response from the service, the module logs "Received response from conversion service – Status: 200 OK" for a success or logs an error message if the status is not 200. In case of success, it may also log the size of the JSON payload or number of records converted for insight (e.g., "Conversion service returned 500 records in JSON format").
- **Debug Mode:** If the module includes a debug or verbose mode setting, enabling it would produce more granular logs – for example, logging headers or partial content of the data (capped at a reasonable length) for analysis. By default, the module should log enough information to trace the flow without overwhelming. Sensitive data (though in this scenario mostly just file content and maybe URLs) should not be logged in entirety to avoid large logs or exposing data.
- **Error Logs:** In error scenarios (detailed in Error Handling), the module will log error details. For example, "ERROR: File download failed due to network timeout," or "ERROR: Conversion service returned 500 Internal Server Error." These logs help identify at which stage the failure occurred.
- **Logging Access:** All logs generated by the module should be accessible via n8n’s standard logging mechanism. Typically, if n8n is running in a server environment, these would appear in the console or log files. If run via the Editor UI, some logs may appear in the execution log or the browser console (depending on how n8n surfaces node logs). The module might utilize n8n’s built-in Logger if available or simply use console logging (which n8n captures). Documentation for the module should instruct how to enable viewing of these logs (for instance, running n8n in debug mode or checking the server log output).
- **Intermediate Data Inspection:** Besides textual logs, n8n users can often inspect node outputs at each stage in the Editor. The module could leverage this by outputting intermediate information as part of the data (for example, if there was a need to output some metadata). However, since the primary goal is to output the final JSON, intermediate steps are mainly observable via logs rather than data output.
- **Example Log Sequence (for clarity):**  
  - *"[XLSX2JSON] Starting file download from: https://example.com/data.xlsx"*  
  - *"[XLSX2JSON] File downloaded (size: 10.2 MB). Preparing to send to conversion service."*  
  - *"[XLSX2JSON] Export fields: [Name, City as Location]"*  
  - *"[XLSX2JSON] Uploading file to conversion API..."*  
  - *"[XLSX2JSON] Conversion service response received (200 OK, 100 records)."*  
  - *"[XLSX2JSON] Conversion successful. Passing JSON output to next node."*  
  - (In case of error: *"[XLSX2JSON] ERROR – Conversion failed: Service responded with 500 Internal Server Error."*)

These logs (prefixed with a tag like `[XLSX2JSON]` to identify the module) illustrate the kind of information captured at each step.

## Performance Considerations
Handling large Excel files (up to 50 MB as required) efficiently is a key consideration in the module’s design. The following outlines how the module should manage performance and resource usage:

- **Streaming vs. Buffering:** To avoid excessive memory usage, the module should use streaming where possible. Rather than loading the entire 50 MB file into memory at once, it can stream the download directly into the upload request (pipeline streaming). For example, as the module downloads the file from the URL, it can pipe the data to the REST service request if the HTTP client libraries allow. This reduces peak memory footprint, since the file doesn’t fully reside in memory at any one time.
- **Memory Management:** n8n runs on Node.js and has memory limits; a 50 MB file in memory is usually okay, but converting it to JSON might expand data size. The module should be mindful not to create huge in-memory copies unnecessarily. Using Node streams or temporary files on disk (if configured to use filesystem for binary data) could help. The module might leverage n8n’s setting `N8N_DEFAULT_BINARY_DATA_MODE=filesystem` (if available in the environment) so that large binary data is stored in a temp file instead of RAM ([Working with larger files (2MB - 20MB+) - Questions - n8n Community](https://community.n8n.io/t/working-with-larger-files-2mb-20mb/11073#:~:text=also%20need%20to%20make%20adjustments,entire%20instance%20crashing%20with%20out)). This way, reading/writing the file is offloaded to disk, which is slower than RAM but more stable for large files.
- **Timeouts and Long Processing:** Converting a very large or complex Excel might take time on the REST service side. The module’s request to the service should have a reasonable timeout set (for example, 60 seconds or more, depending on expected processing time for 50 MB Excel). It should not hang indefinitely. The service should ideally stream its response as well, but typically JSON conversion will send the full JSON at once. The module should be ready to handle a slow incoming response by not blocking the event loop (again, using streaming parse if possible).
- **Chunked Transfer:** If either downloading the file or receiving the JSON response can be done in chunks, the module should handle chunked transfers gracefully. Many HTTP libraries do this internally. The module doesn’t need to manually chunk the JSON, but it should not assume the entire payload arrives in one piece. It should aggregate the incoming data stream into the complete JSON.
- **Resource Cleanup:** After processing, the module should free up resources. If a temporary file was used for the XLSX or if streams were opened, close them to avoid memory leaks. This is especially important in a long-running n8n instance where multiple workflows may run.
- **Large JSON Output Handling:** A 50 MB Excel file could contain tens of thousands of rows. The resulting JSON might be very large (possibly several MBs of text). n8n will have to hold this JSON to pass to the next node. The module should consider if it needs to split the output. One approach, as mentioned in Integration, is outputting each row as a separate item. This way, each item is smaller and n8n’s internal handling (which can page through items) might be more efficient than one giant JSON array. This also allows downstream nodes to stream process each item. Therefore, performance-wise, emitting multiple items (each corresponding to one row or a batch of rows) is advisable for very large datasets.
- **Testing on Upper Limits:** As a requirement, the module should be tested with a ~50 MB XLSX file to ensure it doesn’t crash the n8n workflow. This test would verify that memory usage stays within acceptable bounds and that execution time is reasonable. For instance, converting a 50 MB file might be expected to complete within a couple of minutes depending on network and the service speed. If the service or network is slower, at least the module should not exhaust memory while waiting.
- **Parallelism:** The node itself processes one file per execution. If an n8n workflow triggers multiple such conversions in parallel (for example, in separate branches or via the Split In Batches node), system resources could be strained. While the module doesn’t control workflow design, it’s worth noting that performing multiple 50 MB conversions simultaneously multiplies memory and CPU use. Workflow designers should be cautious about that. The module could log a warning if it detects extremely large data or multiple usage, but this is more of a documentation note than a built-in behavior.
- **No In-Node Data Expansion:** The module should avoid converting the Excel to JSON within n8n itself (which would be extremely slow in pure Node.js for large files and use lots of memory). Offloading this to the REST service (which might be optimized in a different environment or language for Excel parsing) is a deliberate design choice. This keeps the n8n side lightweight, only handling I/O. The performance of the conversion is largely dependent on the external service, which can be scaled or optimized independently.
- **Summary:** In essence, the module is designed as a thin I/O heavy node. It should efficiently shuttle data between the source (URL), the conversion service, and the workflow, while minimally impacting n8n’s performance. Proper streaming, memory management, and chunk handling ensure that even at the upper file size limit, the conversion can be done reliably. Documentation for the module will mention any relevant n8n configuration (like enabling filesystem mode for binaries) if the users plan to routinely hit the upper size limits ([Working with larger files (2MB - 20MB+) - Questions - n8n Community](https://community.n8n.io/t/working-with-larger-files-2mb-20mb/11073#:~:text=also%20need%20to%20make%20adjustments,entire%20instance%20crashing%20with%20out)).

## Error Handling
The module should handle potential error scenarios gracefully, providing clear error messages and not causing the entire workflow to hang or crash unexpectedly. Below are expected failure scenarios and how the module will mitigate them:

- **File Download Errors:** If the XLSX file cannot be retrieved from the URL:
  - *Scenario:* The URL is invalid, the server is unreachable, or returns a non-200 status (404 Not Found, 403 Forbidden, etc.).
  - *Handling:* The module should catch HTTP errors or network exceptions during download. It will log an error message ("Failed to download file: [error detail]") and terminate the operation for that execution. In n8n, this would surface as a node error. The error message returned by the node should clearly state it was a download issue (so users know the conversion never happened due to input issue).
  - *Mitigation:* Before attempting conversion, always check the response of the GET request. If a response code is not 200, do not proceed to upload. The module can also check if the content-length (if provided) exceeds 50 MB and abort early with a message ("File size exceeds 50 MB limit") rather than trying to download it fully.
- **Unsupported File or Format Issues:** If the provided URL does not point to a valid XLSX file or the content is corrupted:
  - *Scenario:* The file is not actually Excel format (maybe the URL was a HTML page or a different file type), or the file is an XLSX but corrupted/unsupported by the conversion service.
  - *Handling:* The conversion service likely will respond with an error if it cannot parse the file. This could be a 400 Bad Request with a message. The module should detect this (non-200 response) and capture the error message from the service if available (for example, service might return a JSON with an error field, or plain text error).
  - *Mitigation:* The module itself cannot fully validate Excel format, but it may do a basic check on file header/magic number after download to ensure it's likely an XLSX. Mostly, rely on the service to validate. If the service returns an error, propagate a clear error to the user (e.g., "Conversion failed: the file is not a valid Excel document").
- **REST Service Connection Errors:** If the module fails to reach the REST service (due to network issues, DNS failure, service downtime):
  - *Scenario:* The HTTP POST to the conversion API times out or cannot connect.
  - *Handling:* The module should have a timeout set (e.g., 30s or configurable). If a timeout or connection error occurs, catch that exception. The node should then error out with a message like "Conversion service unreachable: [timeout or network error]". This informs the user that the issue lies with the external service connectivity.
  - *Mitigation:* Possibly implement a retry mechanism for transient network errors. For example, automatically retry the upload once if a network error occurs (but not if a 4xx/5xx response is received, as those are not transient in the same way). However, retries should be cautious with large files to not double-post 50 MB unnecessarily. This could be an advanced option.
- **REST Service API Errors:** If the conversion service returns an error response:
  - *Scenario:* The service is up but returns an error code (400 if the request was bad, 413 if payload too large, 500 if internal error, etc.).
  - *Handling:* The module should check the HTTP status of the response. If it’s not 200 OK, treat it as a failure. Attempt to parse any response body for error details. For example, the service might return `{"error": "Could not parse file"}`. Include that detail in the node’s error message. If the body isn’t JSON (e.g., an HTML error page or empty), use a generic message based on status (like "Conversion service returned 500 Internal Server Error").
  - *Mitigation:* Ensure the request sent was properly formatted (to avoid 400s). If a 413 (Payload Too Large) is received, it means the file was too large for the service (contrary to expectations); in this case, the module should report "The file exceeds the maximum size accepted by the conversion service." If it's a 500, it's likely an issue on the service side – user might need to contact service support.
- **JSON Parsing Errors:** If the module cannot parse the response into JSON:
  - *Scenario:* The service responded with 200 but the body is not valid JSON (maybe service bug or a proxy returned HTML).
  - *Handling:* The module should attempt to parse JSON and catch any exceptions. On failure, log and error out with "Received an invalid JSON response from conversion service." Possibly include a snippet or info for debugging if safe.
  - *Mitigation:* Not much the module can do except report the anomaly. This scenario should be rare if the service is reliable.
- **Exceeded Size/Memory Issues:** If the file is extremely large or the output JSON is huge, leading to memory issues:
  - *Scenario:* n8n might crash or the node might run out of memory while processing, especially if not streaming. (For instance, reading a 50MB file entirely into memory plus conversion might use hundreds of MB of RAM.)
  - *Handling:* By design, Performance Considerations address this (streaming). But if memory issues still occur, the process may be killed by the system. The module itself might not catch a low-level out-of-memory error. However, we can proactively check file size before loading. If a file is clearly beyond limits, the module should stop. Also, using n8n’s filesystem mode for binaries mitigates some memory bloat ([Working with larger files (2MB - 20MB+) - Questions - n8n Community](https://community.n8n.io/t/working-with-larger-files-2mb-20mb/11073#:~:text=also%20need%20to%20make%20adjustments,entire%20instance%20crashing%20with%20out)).
  - *Mitigation:* Document that for extremely large Excel files close to 50MB, the n8n instance should be configured with enough memory or use the filesystem mode. Also, encourage using export_fields to limit output size if only certain columns are needed, rather than always converting full data.
- **Missing or Incorrect `export_fields` syntax:** If the user provides `export_fields` in an unexpected format:
  - *Scenario:* The user input for fields is not understood by the module or service (e.g., a single string of comma-separated values when the module expected an array, or typos in the "as" syntax).
  - *Handling:* The module should validate the `export_fields` input format. In n8n, if it's configured as a List type parameter, it will naturally give an array. If it’s a string, the module can split by commas or newlines. On parsing, if something looks wrong (e.g., an entry with multiple "as" or strange characters), log a warning. At minimum, ensure the module sends a well-formed instruction to the service. If the format is wrong and leads to service rejecting it (400), handle that as above. Potentially, the module could error out early with "Invalid format for export_fields parameter" to prompt the user to fix it.
  - *Mitigation:* Provide examples in the node description/documentation for how to specify fields and renames. This reduces user error. Possibly, implement simple patterns (like detecting " as " in a string to split original/alias).
- **Partial Data or Conversion Issues:** If the conversion service only returns partial data (for example, if it crashed in the middle and returned a truncated JSON):
  - *Scenario:* The module might receive a JSON that ends unexpectedly or misses some records.
  - *Handling:* The JSON parsing would likely fail in this case (caught by the JSON parse error handling). If, however, the JSON is valid but missing data (which the module can’t easily know without row counts), that’s harder to detect. The module operates on trust that the service returns everything or fails explicitly if not.
  - *Mitigation:* Not much can be done at the module level except possibly cross-checking if the service indicated how many rows it processed versus how many were expected. If the module knew, for example, the Excel had 1000 rows (it could potentially count in advance using a streaming parser or a library, but that’s heavy), then it could compare with the JSON length. That is likely out of scope. So primarily rely on the service to signal success or failure clearly.
- **Workflow Error Propagation:** In all above cases where the module encounters an error, it should cause the node to fail gracefully. n8n’s behavior on node failure (stop the workflow or go to an error branch if configured) will take over. The module should ensure to provide an **error message** that is actionable. For instance:
  - Instead of a generic "Error: something went wrong", say "XLSX to JSON Conversion failed at [stage]: [reason]".
  - This clarity helps users pinpoint if the issue was with input (URL, file), with the service, or internal.
  
By anticipating these errors and handling them, the module will be robust and user-friendly. Proper logging, as discussed, goes hand-in-hand with error handling to ensure that when things do go wrong, diagnosing the problem is straightforward.

## Example Usage
This section provides an example scenario to illustrate how the module is used in practice, including sample inputs and outputs. 

**Scenario:** Suppose we have an Excel file containing a list of employees with columns: **Name**, **Age**, **City**, **Department**. We want to use n8n to fetch this Excel and get a JSON array of objects containing only the Name and City for each employee (perhaps for a directory or further processing), and we want to rename "City" to "Location" in the output.

- **Workflow Configuration:** In the n8n editor, we add the "XLSX to JSON Conversion" custom node to our workflow.
  - We set the **File URL** field to: `https://example.com/data/employees.xlsx` (this is the direct link to the Excel file).
  - We set the **Export Fields** field to: `["Name", "City as Location"]`. This tells the module (and the conversion service) that we only want the "Name" and "City" columns from the spreadsheet, and that "City" should be labeled as "Location" in the output JSON.
- **Execution:** We run the node (or the entire workflow). The module performs the steps as described:
  1. Downloads the `employees.xlsx` file from the URL.
  2. Sends it to the conversion REST API, including the field selection parameter (`Name` and `City` with alias).
  3. Receives the JSON response from the API.
  4. Outputs the JSON to the workflow.

- **Output:** The next node in the workflow (for example, a debug node or an HTTP response node if this were in a webhook) would receive data from the conversion node. The output is a JSON representation of the Excel data. Given our example, it would be an array of objects where each object has keys "Name" and "Location". For instance, if the Excel had the following rows:
    - Row1: Name = Alice, Age = 30, City = London, Department = Sales  
    - Row2: Name = Bob, Age = 25, City = New York, Department = Engineering  

  The JSON output produced by the module would look like: 

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

  Each object in the array corresponds to a row in the Excel. Note that only **Name** and **Location** are present as keys, as requested. "City" was renamed to "Location", and **Age** and **Department** columns are excluded from the output since they were not in the export list.
- **Passing Data to Next Node:** In n8n, if a node outputs an array of objects like above, the next node will treat it as multiple items (in this case 2 items, one for Alice and one for Bob). This means a subsequent node can, for example, iterate through each employee record or perhaps insert them into a database, etc. The data is now in a convenient JSON form for any JSON-compatible operations.
- **Example with All Fields:** If we did not specify any `export_fields`, and the Excel had 4 columns (Name, Age, City, Department), the output for the same two rows would be:
  
  ```json
  [
    {
      "Name": "Alice",
      "Age": 30,
      "City": "London",
      "Department": "Sales"
    },
    {
      "Name": "Bob",
      "Age": 25,
      "City": "New York",
      "Department": "Engineering"
    }
  ]
  ```

  Here, all columns are included by default, with keys exactly as the column headers in Excel.
- **Logs in Example:** During this execution, if we were to check the module’s logs (in the n8n server console), we might see:
  - "Starting download of file from https://example.com/data/employees.xlsx"
  - "Downloaded file (2 MB). Sending to conversion service..."
  - "Export fields specified: Name, City as Location"
  - "Conversion successful, received 2 records."
  - (No errors in this case, so it proceeds normally.)

- **Error Example:** To illustrate error handling, if the File URL was wrong (say a typo causing a 404), the module would log the failure and the n8n UI would show an error for that node, e.g., "Error: Failed to download file (404 Not Found)." The workflow would stop or move to an error path as configured.

**Use Cases:** This module can be used in various scenarios, such as:
- Automating the extraction of data from periodic Excel reports posted online, converting them to JSON for database import or API forwarding.
- Simplifying integration with systems that only output Excel by converting those outputs to JSON within an n8n workflow, where subsequent logic can filter or react to the data.
- Handling large Excel data dumps by delegating the heavy conversion step to a specialized service, thus combining the power of n8n workflow automation with external processing.

Through this example and use cases, it’s clear how the XLSX to JSON Conversion module operates and how it can be configured. It provides a straightforward interface (just a URL and optional fields list) to perform what would otherwise be a multi-step manual process, thereby saving time and reducing errors in data processing workflows.
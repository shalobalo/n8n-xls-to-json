// Start the server
app.listen(port, () => {
  console.log(`XLSX to JSON conversion service listening at http://localhost:${port}`);
  console.log(`API endpoints:`);
  console.log(`- POST /api/upload - Upload XLSX file`);
  console.log(`- GET /api/documents/:id/sheets - Get sheets in document`);
  console.log(`- GET /api/documents/:id/sheets/:sheet/fields?headersIndex=0 - Get fields in sheet`);
  console.log(`- POST /api/documents/:id/parameters - Set conversion parameters`);
  console.log(`- GET /api/documents/:id/export - Get exported JSON data`);
}); 
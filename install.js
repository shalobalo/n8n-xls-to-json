/**
 * Install script for n8n-nodes-xlsx-to-json
 * 
 * This script helps n8n correctly locate and install this community node.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get n8n directory
const getN8nDirectory = () => {
  let n8nDirectory;
  
  try {
    // Try to find n8n directory in standard locations
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    const possibleDirs = [
      path.join(homeDir, '.n8n'),
      path.join(homeDir, 'n8n'),
      '/usr/local/lib/node_modules/n8n',
      '/opt/n8n',
    ];
    
    for (const dir of possibleDirs) {
      if (fs.existsSync(dir)) {
        n8nDirectory = dir;
        break;
      }
    }
    
    // If still not found, check where n8n is installed
    if (!n8nDirectory) {
      try {
        const n8nPath = execSync('which n8n', { encoding: 'utf8' }).trim();
        if (n8nPath) {
          n8nDirectory = path.dirname(path.dirname(n8nPath));
        }
      } catch (e) {
        // Failed to find n8n, will use default
      }
    }
    
  } catch (error) {
    console.error('Error finding n8n directory:', error);
  }
  
  // Default to ~/.n8n if not found
  return n8nDirectory || path.join(process.env.HOME || process.env.USERPROFILE, '.n8n');
};

// Recursive copy function for directories
const copyRecursive = (src, dest) => {
  // If source is a file, just copy it
  if (fs.statSync(src).isFile()) {
    fs.copyFileSync(src, dest);
    return;
  }
  
  // If source is a directory, create destination directory and copy contents
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  // Get all files in source directory
  const entries = fs.readdirSync(src);
  
  // Copy each file/directory
  for (const entry of entries) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    
    if (fs.statSync(srcPath).isDirectory()) {
      // Recursively copy subdirectories
      copyRecursive(srcPath, destPath);
    } else {
      // Copy files
      fs.copyFileSync(srcPath, destPath);
    }
  }
};

const installNode = async () => {
  try {
    const n8nDir = getN8nDirectory();
    const customDir = path.join(n8nDir, 'custom');
    
    // Create custom directory if it doesn't exist
    if (!fs.existsSync(customDir)) {
      fs.mkdirSync(customDir, { recursive: true });
      console.log(`Created custom nodes directory at: ${customDir}`);
    }
    
    // Copy our node to the custom directory
    const packageDir = path.resolve(__dirname);
    const targetDir = path.join(customDir, 'n8n-nodes-xlsx-to-json');
    
    // Create the target directory if it doesn't exist
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    // Check if dist directory exists first
    const distDir = path.join(packageDir, 'dist');
    if (!fs.existsSync(distDir)) {
      console.log('Dist directory does not exist yet. Skipping installation.');
      console.log('Run "npm run build" first to create the dist directory.');
      return; // Exit without error
    }
    
    // Copy files from dist to the target directory
    copyRecursive(distDir, targetDir);
    
    console.log(`Successfully installed n8n-nodes-xlsx-to-json to ${targetDir}`);
    console.log('Please restart n8n for the changes to take effect.');
    
  } catch (error) {
    console.error('Error installing node:', error);
    process.exit(1);
  }
};

// Run the installation if this script is run directly
if (require.main === module) {
  installNode();
}

module.exports = { installNode }; 
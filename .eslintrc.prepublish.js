// This is a stricter version of eslint config used before publishing
const baseConfig = require('./.eslintrc.js');

module.exports = {
  ...baseConfig,
  rules: {
    ...baseConfig.rules,
    'no-console': 'warn', // During publishing, warn about console logs
  },
}; 
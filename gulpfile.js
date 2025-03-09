const { src, dest } = require('gulp');
const path = require('path');

// Copy icons to build output for n8n to use
function buildIcons() {
  const nodeSource = path.resolve('src', 'nodes');
  const nodeDestination = path.resolve('dist', 'nodes');

  return src([`${nodeSource}/**/*.svg`, `${nodeSource}/**/*.png`]).pipe(
    dest(nodeDestination)
  );
}

exports['build:icons'] = buildIcons; 
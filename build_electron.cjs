const packager = require('electron-packager');
const path = require('path');

async function bundle() {
  console.log('Starting build...');
  
  const options = {
    dir: '.',
    name: 'Forklift Desirer',
    platform: 'win32',
    arch: 'x64',
    out: 'release',
    overwrite: true,
    // Prune dev dependencies
    prune: true,
    // Ignore files that mess up the build or are not needed
    ignore: [
        '[\\\\/]\\.vs',
        '[\\\\/]\\.git',
        '[\\\\/]\\.vscode',
        '[\\\\/]src',
        '[\\\\/]test_packer\\.ts'
    ]
  };

  try {
      const appPaths = await packager(options);
      console.log(`Electron app bundles created at:\n${appPaths.join('\n')}`);
  } catch (err) {
      console.error('Build failed:', err);
      process.exit(1);
  }
}

bundle();

const SKIP_DIRS = [
  '.git', '.svn', '.hg', '.bzr', '$recycle.bin', 'system volume information', '$windows.~bt', '$windows.~ws',
  'windows.old', 'winsxs', 'servicing', 'softwaredistribution', 'msocache', 'recovery', 'perflogs', 'appdata',
  'application data', 'onedrivetemp', 'windows', '$winreagent', 'config.msi', 'temp', 'tmp', 'crashdumps',
  'd3dscache', 'inetcache', 'webcache', '.venv', 'venv', 'env', '.env', 'virtualenv', '.virtualenvs', '.conda',
  'conda-env', 'site-packages', 'dist-packages', '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache',
  '.tox', '.nox', '.hypothesis', '.eggs', 'pip-wheel-metadata', 'node_modules', 'bower_components', '.next',
  '.nuxt', '.turbo', '.npm', '.pnpm', '.pnpm-store', '.yarn', '.yarn-cache', '.parcel-cache', '.svelte-kit',
  '.output', '.docusaurus', '.cache', 'target', '.cargo', '.rustup', 'vendor', '.bundle', '.gradle', '.m2',
  '.ivy2', '.sbt', '.android', 'obj', 'bin', '.nuget', '.vs', '.idea', '.vscode', '.settings',
  'cmake-build-debug', 'cmake-build-release', '.cxx', 'ipch',
];
module.exports = { SKIP_DIRS };

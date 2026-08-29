const gate = process.argv[2] || 'unknown';

console.error(
  `[pending] ${gate} verification is not implemented in the current prototype. ` +
  'See docs/LOCAL_SETUP_AND_VERIFICATION.md.'
);

process.exitCode = 1;

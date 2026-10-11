// Compatibility for callers of the previous build entry point.
process.argv.push('production');
await import('../esbuild.config.mjs');

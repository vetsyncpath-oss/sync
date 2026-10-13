import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
export async function writeStyles() {
  const { outputFiles } = await build({ entryPoints: ['src/ui/styles.ts'], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'warning' });
  const styles = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'));
  await writeFile('styles.css', styles.PLUGIN_CSS + styles.WORKSPACE_CSS);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await writeStyles();

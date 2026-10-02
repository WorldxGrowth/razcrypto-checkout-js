/** Builds dist/checkout.js (IIFE → window.RazCrypto), dist/checkout.esm.js and copies the IIFE to the website's /v1/. */
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const banner = `/*! @razcrypto/checkout v${pkg.version} | MIT */`;
await build({ entryPoints: ['src/index.ts'], bundle: true, minify: true, format: 'iife', globalName: 'RazCrypto', target: 'es2018', outfile: 'dist/checkout.js', banner: { js: banner } });
await build({ entryPoints: ['src/index.ts'], bundle: true, minify: true, format: 'esm', target: 'es2018', outfile: 'dist/checkout.esm.js', banner: { js: banner } });

const js = readFileSync('dist/checkout.js');
const sri = `sha384-${createHash('sha384').update(js).digest('base64')}`;
const web = '../../Website/frontend/public/v1';
mkdirSync(web, { recursive: true });
copyFileSync('dist/checkout.js', `${web}/checkout.js`);
copyFileSync('dist/checkout.js', `${web}/checkout.${pkg.version}.js`);
writeFileSync(`${web}/checkout.${pkg.version}.js.sri`, `${sri}\n`);
console.log(`checkout.js ${js.length} B, ${gzipSync(js).length} B gzip, ${sri}`);

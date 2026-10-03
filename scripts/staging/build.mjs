import {readFile, writeFile, mkdir, rm, copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve, dirname, extname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {STAGING, PRODUCTION} from './config.mjs';
import {qrFallbackConfig} from '../../js/qr-public-config.mjs';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TEXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.txt', '.xml']);
const STATIC = new Set([...TEXT, '.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg',
  '.ico', '.pdf', '.mp4', '.woff', '.woff2']);
const publicDirs = new Set(['assets', 'admin', 'colaboradores', 'css', 'js', 'portal']);
const prodOrigin = `https://${PRODUCTION.projectRef}.supabase.co`;
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function publicAsset(path) {
  if (path.endsWith('-qa.html') || path === 'colaboradores/colaboradores-index-etapa2-estable.html') return false;
  if (path === '_headers' || path === '_redirects') return true;
  const parts = path.split('/');
  return (parts.length === 1 || publicDirs.has(parts[0])) && STATIC.has(extname(path));
}

export function transform(source, path, productionKeys, qaKey) {
  let result = source.replaceAll(prodOrigin, STAGING.databaseOrigin)
    .replaceAll(PRODUCTION.projectRef, STAGING.projectRef);
  for (const key of productionKeys) result = result.replaceAll(key, qaKey);
  // All generated public links, including newly printed test QR codes, stay in staging.
  for (const host of [...PRODUCTION.hosts].sort((a, b) => b.length - a.length)) {
    result = result.replace(new RegExp(`(?<![a-zA-Z0-9.-])${escapeRegex(host)}(?![a-zA-Z0-9.-])`, 'g'), STAGING.host);
  }
  if (path.endsWith('.html')) {
    // The normal Alquileres source includes environment labels in screens and
    // printable documents. Keep both truthful in the staging artifact.
    if (/^admin\/alquileres-(admin|franjas|propietario)\.html$/.test(path)) {
      result = result.replaceAll('PRODUCCIÓN', 'PRUEBAS').replaceAll('Producción', 'Pruebas');
    }
    // Disable external analytics, preserving a harmless gtag stub in browser-safety.
    result = result.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, tag =>
      /googletagmanager|google-analytics|gtag\('config'/.test(tag) ? '' : tag);
    result = result.replace(/<head\b[^>]*>/i, '$&\n<script src="/js/staging-safety.js"></script>\n<meta name="robots" content="noindex,nofollow,noarchive">');
    // mailto assignments can bypass click interception. Replace every mail/WA URI,
    // including dynamic template strings, with a local harmless destination.
    result = result.replaceAll('mailto:', '/__staging/contact-disabled?to=')
      .replaceAll('https://wa.me/', '/__staging/contact-disabled?to=')
      .replaceAll('https://api.whatsapp.com/', '/__staging/contact-disabled?to=');
  }
  if (path === 'js/burbuja-contacto.js') {
    result = result.replaceAll('mailto:', '/__staging/contact-disabled?to=')
      .replaceAll('https://wa.me/', '/__staging/contact-disabled?to=');
  }
  if (result.includes(PRODUCTION.projectRef) || productionKeys.some(key => result.includes(key))) {
    throw new Error(`production_reference_in_artifact:${path}`);
  }
  return result;
}

export async function build({dataReady = false} = {}) {
  const destination = resolve(ROOT, 'dist-staging');
  const tracked = execFileSync('git', ['ls-files', '-z'], {cwd: ROOT, encoding: 'utf8'}).split('\0').filter(Boolean);
  const assets = tracked.filter(publicAsset);
  const configSource = await readFile(resolve(ROOT, 'js/config.js'), 'utf8');
  const productionKeys = [...new Set(configSource.match(/sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_.-]+/g) || [])];
  if (productionKeys.length !== 1) throw new Error('production_public_key_inventory_changed');
  const qaKey = qrFallbackConfig('localhost').anonKey;
  if (!qaKey || JSON.parse(Buffer.from(qaKey.split('.')[1], 'base64url')).ref !== STAGING.projectRef) throw new Error('qa_public_key_identity_mismatch');
  await rm(destination, {recursive: true, force: true});
  await mkdir(destination, {recursive: true});
  const hashes = {};
  for (const path of assets) {
    await mkdir(dirname(resolve(destination, path)), {recursive: true});
    if (TEXT.has(extname(path)) || path.startsWith('_')) {
      const source = await readFile(resolve(ROOT, path), 'utf8');
      const text = transform(source, path, productionKeys, qaKey);
      await writeFile(resolve(destination, path), text);
      hashes[path] = createHash('sha256').update(text).digest('hex');
    } else {
      await copyFile(resolve(ROOT, path), resolve(destination, path));
    }
  }
  // Single-environment fallback: no production credentials or hostname switching.
  await writeFile(resolve(destination, 'js/qr-public-config.mjs'),
    `export function qrFallbackConfig(hostname){return hostname===${JSON.stringify(STAGING.host)}?` +
    `${JSON.stringify({rpcUrl: `${STAGING.databaseOrigin}/rest/v1/rpc/qr_resolver_anon_v1`, anonKey: qaKey})}:` +
    `{rpcUrl:'',anonKey:''};}\n`);
  const safety = (await readFile(new URL('./browser-safety.js', import.meta.url), 'utf8'))
    .replace('__STAGING_CONFIG__', JSON.stringify({...STAGING, dataReady}));
  await writeFile(resolve(destination, 'js/staging-safety.js'), safety);
  await writeFile(resolve(destination, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  await writeFile(resolve(destination, 'sitemap.xml'), '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n');
  // No service worker or manifest install in the clone until independently tested.
  for (const path of ['admin/sw.js', 'colaboradores/sw.js']) await rm(resolve(destination, path), {force:true});
  // Hash final emitted bytes, including rewritten configuration and every binary.
  for (const path of [...new Set([...assets, 'js/staging-safety.js'])]) {
    try { hashes[path] = createHash('sha256').update(await readFile(resolve(destination,path))).digest('hex'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; delete hashes[path]; }
  }
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: ROOT, encoding:'utf8'}).trim();
  const manifest = {sourceCommit:commit, ...STAGING, dataReady, assetCount:Object.keys(hashes).length,
    preparedAt:new Date().toISOString(), textHashes:hashes};
  await writeFile(resolve(destination, 'staging-build.json'), JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.slice(2).some(arg => arg !== '--data-ready')) throw new Error('unknown_build_argument');
  const result = await build({dataReady:process.argv.includes('--data-ready')});
  console.log(JSON.stringify({...result,textHashes:undefined}));
}

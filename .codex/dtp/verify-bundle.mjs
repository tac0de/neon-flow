import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const directory = process.argv[2];
const html = readFileSync(join(directory, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']\.\/(assets\/[a-z0-9._-]+\.js)["']/gi)];
if (!scripts.length || scripts.some(([, file]) => lstatSync(join(directory, file)).size === 0)) {
  throw new Error('빌드 HTML이 실제 JavaScript 산출물을 참조하지 않습니다.');
}
const hash = createHash('sha256');
for (const file of readdirSync(directory, { recursive: true }).sort()) {
  const path = join(directory, file);
  const stat = lstatSync(path);
  if (stat.isDirectory()) continue;
  if (!stat.isFile()) throw new Error('일반 파일이 아닌 산출물이 있습니다.');
  hash.update(JSON.stringify([file, createHash('sha256').update(readFileSync(path)).digest('hex')]) + '\n');
}
console.log(JSON.stringify({ artifactSha256: hash.digest('hex'), entrypoints: scripts.length }));

/**
 * Serves the two independent test sites used by the "universal" tests.
 *
 * These pages are deliberately NOT part of the mock website and are never registered
 * anywhere in the extension: they prove that a newly encountered origin works out of
 * the box. React is served from the mock website's node_modules so no extra download
 * is required.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..', '..');

const VENDOR = {
  '/vendor/react.js': path.join(projectRoot, 'mock-website/node_modules/react/umd/react.production.min.js'),
  '/vendor/react-dom.js': path.join(
    projectRoot,
    'mock-website/node_modules/react-dom/umd/react-dom.production.min.js',
  ),
  '/vendor/vue.js': path.join(projectRoot, 'integration/node_modules/vue/dist/vue.global.prod.js'),
};

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function resolveFile(pathname) {
  const vendorFile = VENDOR[pathname];
  if (vendorFile) return vendorFile;

  let relative = pathname === '/' ? '/index.html' : pathname;
  if (relative.endsWith('/')) relative += 'index.html';

  const absolute = path.normalize(path.join(here, relative.replace(/^\/+/, '')));
  const inside = path.relative(here, absolute);
  if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) return null;

  return absolute;
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const pathname = url.pathname;

  if (pathname === '/') {
    response.writeHead(302, { Location: '/site-plain/' }).end();
    return;
  }

  const file = resolveFile(pathname);
  if (!file) {
    response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    return;
  }

  fs.readFile(file, (error, data) => {
    if (error) {
      response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(data);
  });
});

const port = Number(process.env.FIXTURE_PORT ?? 5180);
server.listen(port, '127.0.0.1', () => {
  console.log(`fixture sites: http://127.0.0.1:${port}/site-plain/ and http://127.0.0.1:${port}/site-react/`);
});

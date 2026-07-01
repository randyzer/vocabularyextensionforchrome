import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';

const root = resolve('tests/fixtures');

createServer((request, response) => {
  const path = request.url === '/' ? '/article.html' : request.url;

  if (path !== '/article.html') {
    response.writeHead(404).end();
    return;
  }

  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
  });
  createReadStream(resolve(root, 'article.html')).pipe(response);
}).listen(4173, '127.0.0.1');

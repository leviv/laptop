import { defineConfig, type Plugin } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Dev-only helper: POST /__cap?name=foo with a base64 JPEG body writes
// .captures/foo.jpg so frames can be inspected without a visible window.
function captureSink(): Plugin {
  return {
    name: 'capture-sink',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__cap', (req, res) => {
        const name = new URL(req.url ?? '/', 'http://x').searchParams.get('name') ?? 'cap';
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          const dir = join(process.cwd(), '.captures');
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, name.replace(/[^\w-]/g, '') + '.jpg'), Buffer.from(body, 'base64'));
          res.end('ok');
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [captureSink()],
});

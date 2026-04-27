import { createServer } from 'http';
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, '..', 'data');
const LOG_FILE = join(LOG_DIR, 'events.jsonl');
const PORT = process.env.WEBHOOK_PORT || 3847;

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

const server = createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(200);
    res.end('BrandMultiplier GTM webhook alive');
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const event = JSON.parse(body);
      const ts = new Date().toISOString();
      const source = event.source || 'unknown';

      // Log raw event
      const logEntry = { ts, source, ...event };
      appendFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n');

      // Pretty print to console
      if (source === 'users' || event.user_full_name) {
        console.log(`\n🤝 [${ts}] NUOVA CONNESSIONE: ${event.user_full_name || '?'} (@${event.user_public_identifier || '?'})`);
      } else if (source === 'messaging' || event.message) {
        const sender = event.sender?.name || event.sender || '?';
        const text = event.message?.text || event.message || '';
        console.log(`\n💬 [${ts}] MESSAGGIO da ${sender}: ${String(text).slice(0, 200)}`);
      } else {
        console.log(`\n📌 [${ts}] Event:`, JSON.stringify(event).slice(0, 300));
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    } catch (e) {
      console.error('Parse error:', e.message);
      res.writeHead(400);
      res.end('{"error":"invalid json"}');
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 BrandMultiplier GTM webhook server on http://localhost:${PORT}`);
  console.log(`📁 Events log: ${LOG_FILE}\n`);
});

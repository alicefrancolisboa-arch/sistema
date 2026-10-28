import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('configuração Cloudflare preserva banco compartilhado e rotas críticas', () => {
  const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  const worker = readFileSync(new URL('../worker.mjs', import.meta.url), 'utf8');
  assert.equal(config.name, 'acai-da-mary');
  assert.match(config.vars.TURSO_DATABASE_URL, /^libsql:\/\/saidas-mary-/);
  assert.ok(config.compatibility_flags.includes('enable_nodejs_sqlite_module'));
  assert.match(worker, /handleAsNodeRequest/);
  assert.match(worker, /env\.ASSETS\.fetch/);
  assert.match(worker, /env\.TURSO_AUTH_TOKEN/);
  assert.match(worker, /env\.GEMINI_API_KEY/);
});

import { handleAsNodeRequest } from 'cloudflare:node';
import apk from './dist/Saidas-Mary.apk';
import { CloudStore } from './lib/cloud-store.mjs';
import { createApp } from './server.mjs';

const port = 3210;
let running;

async function ensureApp(env) {
  if (running) return running;
  const cloud = new CloudStore({
    url: env.TURSO_DATABASE_URL,
    token: env.TURSO_AUTH_TOKEN,
  });
  await cloud.ready();
  running = createApp({
    cloud,
    apiKey: env.GEMINI_API_KEY || '',
    password: env.APP_PASSWORD || '',
    username: env.APP_USER || 'CASADOACAI',
    model: env.GEMINI_MODEL || 'gemini-3.8-flash',
  });
  running.server.listen(port);
  return running;
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/baixar-apk') {
      return new Response(apk, {
        headers: {
          'Content-Type': 'application/vnd.android.package-archive',
          'Content-Disposition': 'attachment; filename="Acai-da-Mary.apk"',
          'Cache-Control': 'no-cache',
        },
      });
    }
    if (!path.startsWith('/api/') && path !== '/healthz') {
      return env.ASSETS.fetch(request);
    }
    await ensureApp(env);
    return handleAsNodeRequest(port, request);
  },
};

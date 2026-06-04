import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { UsageCache } from './cache.js';
import { loadConfig } from './config.js';
import { GitHubClient } from './githubClient.js';
import { buildDashboardUsage } from './usageAggregator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

async function main() {
  const config = loadConfig();
  const github = new GitHubClient(config);
  const cache = new UsageCache(path.resolve(projectRoot, 'data/cache.json'));
  const app = Fastify({ logger: true });

  await cache.load();

  async function refreshUsage() {
    const usage = await buildDashboardUsage(config, github);
    await cache.save(usage);
    return usage;
  }

  app.get('/api/health', async () => ({
    ok: true,
    hasCache: cache.get() !== null,
    stale: cache.get()?.stale ?? false,
    refreshedAt: cache.get()?.refreshedAt ?? null
  }));

  app.get('/api/usage', async (_request, reply) => {
    const cached = cache.get();

    if (cached) {
      return cached;
    }

    try {
      return await refreshUsage();
    } catch (error) {
      reply.code(503);
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });

  app.post('/api/refresh', async (_request, reply) => {
    try {
      return await refreshUsage();
    } catch (error) {
      const stale = cache.markStale(error);
      if (stale) {
        reply.code(202);
        return stale;
      }

      reply.code(503);
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });

  const clientDist = path.resolve(projectRoot, 'dist/client');
  if (existsSync(clientDist)) {
    await app.register(fastifyStatic, {
      root: clientDist,
      wildcard: false
    });

    app.setNotFoundHandler(async (request, reply) => {
      if (request.raw.url?.startsWith('/api/')) {
        reply.code(404);
        return { error: 'Not found' };
      }

      return reply.sendFile('index.html');
    });
  }

  refreshUsage().catch((error) => {
    app.log.warn({ error }, 'Initial GitHub usage refresh failed');
    cache.markStale(error);
  });

  setInterval(() => {
    refreshUsage().catch((error) => {
      app.log.warn({ error }, 'Scheduled GitHub usage refresh failed');
      cache.markStale(error);
    });
  }, config.REFRESH_INTERVAL_MS).unref();

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
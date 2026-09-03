import type { Core } from '@strapi/strapi';

type LogInput = {
  source: 'manual' | 'cron' | 'test';
  status: 'success' | 'partial' | 'error';
  message?: string;
  inserted?: number;
  updated?: number;
  skipped?: number;
  failed?: number;
  durationMs?: number;
  errors?: string[];
  meta?: Record<string, unknown>;
};

const UID = 'plugin::brandstory-ai.sync-log';

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async write(input: LogInput) {
    try {
      return await strapi.documents(UID).create({
        data: {
          source: input.source,
          status: input.status,
          message: input.message || '',
          inserted: input.inserted ?? 0,
          updated: input.updated ?? 0,
          skipped: input.skipped ?? 0,
          failed: input.failed ?? 0,
          durationMs: input.durationMs ?? null,
          errors: input.errors ?? [],
          meta: input.meta ?? {},
        },
      });
    } catch (err) {
      strapi.log.warn(
        `[brandstory-ai] failed to write sync-log: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
  },

  async list(limit = 50) {
    try {
      return await strapi.documents(UID).findMany({
        sort: { createdAt: 'desc' },
        limit: Math.min(100, Math.max(1, limit)),
      });
    } catch (err) {
      strapi.log.warn(
        `[brandstory-ai] failed to list sync-logs: ${err instanceof Error ? err.message : String(err)}`
      );
      return [];
    }
  },
});

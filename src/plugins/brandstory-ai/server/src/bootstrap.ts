import type { Core } from '@strapi/strapi';

export default ({ strapi }: { strapi: Core.Strapi }) => {
  const pluginConfig = strapi.config.get('plugin::brandstory-ai') as {
    cronSchedule?: string;
  };
  const schedule = (pluginConfig?.cronSchedule ?? '0 */3 * * *').trim();
  if (!schedule) {
    strapi.log.info('[brandstory-ai] cron disabled (empty cronSchedule)');
    return;
  }

  strapi.cron.add({
    brandstoryAiImport: {
      task: async ({ strapi: s }) => {
        try {
          const settings = await s.plugin('brandstory-ai').service('settings').get();
          if (!settings?.siteUrl || !settings?.workspace) {
            return;
          }
          await s.plugin('brandstory-ai').service('sync').runImport({
            source: 'cron',
            publishStatus: settings.defaultPublishStatus || 'published',
          });
        } catch (err) {
          s.log.error(
            `[brandstory-ai] cron import failed: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      },
      options: { rule: schedule },
    },
  });

  strapi.log.info(`[brandstory-ai] cron scheduled: ${schedule}`);
};

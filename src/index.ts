import type { Core } from '@strapi/strapi';

/**
 * On Windows, Strapi dev can emit admin HTML with backslashes in the Vite
 * entry script URL (e.g. /admin/.strapi\client\app.js). Browsers treat that
 * as an invalid module URL, so the admin stays blank. Normalize to forward slashes.
 */
function normalizeAdminHtmlWindowsPaths(html: string): string {
  return html.replace(/(\/admin\/\.strapi)\\+(client)\\+(app\.js)/g, '$1/$2/$3');
}

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register({ strapi }: { strapi: Core.Strapi }) {
    strapi.server.use(async (ctx, next) => {
      await next();
      const isAdminShell =
        ctx.path === '/admin' || ctx.path === '/admin/';
      if (
        ctx.method === 'GET' &&
        isAdminShell &&
        typeof ctx.body === 'string' &&
        ctx.body.includes('.strapi\\')
      ) {
        ctx.body = normalizeAdminHtmlWindowsPaths(ctx.body);
      }
    });
  },

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  bootstrap(/* { strapi }: { strapi: Core.Strapi } */) {},
};

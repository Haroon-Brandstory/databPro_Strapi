export default ({ env }) => ({
  'users-permissions': {
    config: {
      jwtSecret: env('JWT_SECRET') || env('USERS_PERMISSIONS_JWT_SECRET'),
    },
  },
  'brandstory-ai': {
    enabled: true,
    resolve: './src/plugins/brandstory-ai',
    config: {
      // Cron auto-import. Use '' to disable.
      cronSchedule: '0 */3 * * *',
    },
  },
});

export default ({ env }) => ({
  'users-permissions': {
    config: {
      jwtSecret: env('JWT_SECRET') || env('USERS_PERMISSIONS_JWT_SECRET'),
    },
  },
});

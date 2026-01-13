export default ({ env }) => ({
  'users-permissions': {
    config: {
      jwtSecret: env('USERS_PERMISSIONS_JWT_SECRET'),
    },
  },
});

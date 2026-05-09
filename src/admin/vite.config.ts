import { mergeConfig, type UserConfig } from 'vite';

/** Strapi 5 merges this with the admin Vite config; keep minimal overrides. */
export default (config: UserConfig) =>
  mergeConfig(config, {
    resolve: {
      dedupe: ['react', 'react-dom', 'react-router-dom', 'styled-components', 'react-redux'],
    },
  });

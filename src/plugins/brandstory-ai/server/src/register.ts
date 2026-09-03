import type { Core } from '@strapi/strapi';

const register = ({ strapi }: { strapi: Core.Strapi }) => {
  strapi.log.info('[brandstory-ai] plugin registered');
};

export default register;

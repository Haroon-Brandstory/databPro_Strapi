import pluginId from './pluginId';
import Initializer from './components/Initializer';
import PluginIcon from './components/PluginIcon';

export default {
  register(app: any) {
    app.addMenuLink({
      to: `plugins/${pluginId}`,
      icon: PluginIcon,
      intlLabel: {
        id: `${pluginId}.plugin.name`,
        defaultMessage: 'Brandstory AI',
      },
      // Sync import() — async Component callbacks break React context in Strapi 5
      Component: () => import('./pages/App'),
      permissions: [],
    });

    app.registerPlugin({
      id: pluginId,
      initializer: Initializer,
      isReady: false,
      name: pluginId,
    });
  },

  async registerTrads({ locales }: { locales: string[] }) {
    return Promise.all(
      locales.map(async (locale) => {
        try {
          const { default: data } = await import(`./translations/${locale}.json`);
          return { data: prefixPluginTranslations(data, pluginId), locale };
        } catch {
          return { data: {}, locale };
        }
      })
    );
  },
};

function prefixPluginTranslations(
  trad: Record<string, Record<string, string> | string>,
  pluginIdValue: string
) {
  const nested = trad[pluginIdValue];
  if (nested && typeof nested === 'object') {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(nested)) {
      out[`${pluginIdValue}.${k}`] = v;
    }
    return out;
  }
  return trad as Record<string, string>;
}

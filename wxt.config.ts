import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Sidebar Max',
    short_name: 'Sidebar Max',
    description:
      'A native side panel workspace with real browser tabs, independent from your main browsing.',
    version: '0.2.0',
    minimum_chrome_version: '116',
    permissions: [
      'tabs',
      'tabGroups',
      'storage',
      'sidePanel',
      'declarativeNetRequest',
      'favicon',
      'commands',
      'scripting',
      'alarms',
    ],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'Toggle Sidebar Max',
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
    declarative_net_request: {
      rule_resources: [
        {
          id: 'sidepanel_embed',
          enabled: true,
          path: 'rules.json',
        },
      ],
    },
    commands: {
      'toggle-panel': {
        suggested_key: {
          default: 'Ctrl+Shift+Y',
        },
        description: 'Toggle Sidebar Max panel',
      },
    },
  },
});

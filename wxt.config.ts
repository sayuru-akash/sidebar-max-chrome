import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Sidebar Max',
    short_name: 'Sidebar Max',
    description:
      'A collapsible right-dock browsing workspace for Chromium with hybrid embedded and native fallback tabs.',
    version: '0.1.0',
    minimum_chrome_version: '116',
    permissions: ['tabs', 'scripting', 'storage', 'commands', 'activeTab'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'Toggle Sidebar Max',
    },
    commands: {
      'toggle-dock': {
        suggested_key: {
          default: 'Ctrl+Shift+Y',
        },
        description: 'Toggle Sidebar Max in the current tab',
      },
    },
  },
});

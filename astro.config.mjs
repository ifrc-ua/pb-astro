// @ts-check
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import tailwindcss from '@tailwindcss/vite';

import react from '@astrojs/react';
import mdx from '@astrojs/mdx';

// Зовнішні посилання відкриваються в новій вкладці. Markdown-синтаксис
// [текст](url) не має куди вписати target, тож додаємо його rehype-плагіном
// усім <a> з абсолютним http(s)-href (сирі HTML-лінки в MDX парсяться як JSX
// і сюди не потрапляють — target у них уже проставлений руками).
function externalLinksBlank() {
  /** @param {any} node @param {(n: any) => void} fn */
  const walk = (node, fn) => {
    fn(node);
    for (const child of node.children ?? []) walk(child, fn);
  };
  return (/** @type {any} */ tree) => {
    walk(tree, (node) => {
      if (node.type === 'element' && node.tagName === 'a' && /^https?:\/\//.test(String(node.properties?.href ?? ''))) {
        node.properties.target = '_blank';
        node.properties.rel = 'noopener';
      }
    });
  };
}

// https://astro.build/config
export default defineConfig({
  integrations: [react(), mdx()],
  // Astro 7: плагіни передаються процесору unified() (класичний remark/rehype
  // конвеєр з @astrojs/markdown-remark); markdown.rehypePlugins — депрекований
  markdown: {
    processor: unified({
      rehypePlugins: [externalLinksBlank],
    }),
  },
  vite: {
    plugins: [tailwindcss()],
  },
});

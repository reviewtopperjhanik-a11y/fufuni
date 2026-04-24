// Copyright (c) 2024-2026 Ronan LE MEILLAT
// License: AGPL-3.0-or-later
import { MANIFEST } from "../manifest";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function generateIndexHTML() {
  const topicListItems = MANIFEST.topics.map(topic => {
    const title = escapeHtml(topic.title);
    const description = escapeHtml(topic.description);
    const tags = escapeHtml(topic.tags.join(", "));
    const updatedAt = escapeHtml(new Date(topic.updated_at).toLocaleDateString());
    const slug = escapeHtml(topic.slug);

    return `
      <li>
        <button class="topic-link" type="button" data-slug="${slug}">
          <h2>${title}</h2>
        </button>
        <p>${description}</p>
        <p><strong>Tags:</strong> ${tags}</p>
        <p><em>Last updated: ${updatedAt}</em></p>
      </li>
    `;
  }).join("\n");

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Fufuni MCP Server - Knowledge Base</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; color: #111827; background: #f8fafc; }
        h1 { color: #111827; margin-bottom: 1rem; }
        ul { list-style: none; padding: 0; margin: 0; }
        li { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 12px; }
        .topic-link { background: none; border: none; padding: 0; width: 100%; text-align: left; cursor: pointer; }
        .topic-link:hover h2 { text-decoration: underline; }
        h2 { margin: 0 0 8px 0; font-size: 1.25rem; color: #111827; }
        p { margin: 6px 0; line-height: 1.6; }
        #topic-view { margin-top: 24px; padding: 24px; background: #ffffff; border: 1px solid #d1d5db; border-radius: 12px; }
        #topic-view h2 { margin-top: 0; }
        pre { background: #111827; color: #f8fafc; padding: 16px; border-radius: 8px; overflow-x: auto; }
        code { background: #f3f4f6; color: #111827; padding: 2px 4px; border-radius: 4px; }
        blockquote { border-left: 4px solid #cbd5e1; margin: 0; padding-left: 16px; color: #475569; }
      </style>
      <script type="module">
        import { marked } from "https://cdn.jsdelivr.net/npm/marked@5.1.1/lib/marked.esm.js";
        marked.setOptions({ mangle: false, headerIds: false });

        const topicCache = new Map();

        function escapeHtml(value) {
          return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        }

        async function renderMarkdown(slug) {
          const target = document.getElementById('topic-view');
          target.innerHTML = '<p>Loading <strong>' + escapeHtml(slug) + '</strong>…</p>';
          if (topicCache.has(slug)) {
            target.innerHTML = marked.parse(topicCache.get(slug));
            return;
          }

          try {
            const response = await fetch('/topic/' + encodeURIComponent(slug) + '.md');
            if (!response.ok) {
              throw new Error('HTTP ' + response.status);
            }
            const md = await response.text();
            topicCache.set(slug, md);
            target.innerHTML = marked.parse(md);
          } catch (error) {
            console.error('Failed to load topic content:', error);
            target.innerHTML = '<p style="color: #b91c1c;">Unable to load content for ' + escapeHtml(slug) + '.</p>';
          }
        }

        function attachTopicLinks() {
          document.querySelectorAll('.topic-link').forEach(button => {
            button.addEventListener('click', () => {
              renderMarkdown(button.dataset.slug);
            });
          });
        }

        window.addEventListener('DOMContentLoaded', attachTopicLinks);
      </script>
    </head>
    <body>
      <h1>Fufuni MCP Server - Knowledge Base</h1>
      <p>Click a topic to render the generated Markdown on the client side.</p>
      <ul>
        ${topicListItems}
      </ul>
      <section id="topic-view">
        <p>Select a topic to preview its content.</p>
      </section>
    </body>
    </html>
  `;
}

export function serveIndex() {
  return new Response(generateIndexHTML(), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export function serveMarkdownTopic(markdown: string) {
  return new Response(markdown, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

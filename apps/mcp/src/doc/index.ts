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
      <div class="accordion-item">
        <h2 class="accordion-header" id="heading-${slug}">
          <button class="accordion-button collapsed" type="button"
            data-bs-toggle="collapse"
            data-bs-target="#collapse-${slug}"
            aria-expanded="false"
            aria-controls="collapse-${slug}"
            data-slug="${slug}">
            ${title}
          </button>
        </h2>
        <div id="collapse-${slug}" class="accordion-collapse collapse" aria-labelledby="heading-${slug}" data-bs-parent="#knowledgeAccordion">
          <div class="accordion-body">
            <p class="topic-description">${description}</p>
            <p class="topic-meta"><strong>Tags:</strong> ${tags} · <em>Updated: ${updatedAt}</em></p>
            <div id="wrapper" class="topic-content" data-slug="${slug}"></div>
          </div>
        </div>
      </div>
    `;
  }).join("\n");

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Fufuni MCP Server - Knowledge Base</title>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css" integrity="sha256-2FMn2Zx6PuH5tdBQDRNwrOo60ts5wWPC9R8jK67b3t4=" crossorigin="anonymous">
      <link id="mainstyle" rel="stylesheet" type="text/css" href="https://marked2app.com/styles/styles/github-updated.css">
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; color: #111827; background: #f8fafc; }
        h1 { color: #111827; margin-bottom: 1rem; }
        .accordion-item { border: 1px solid #e5e7eb; border-radius: 0.75rem; margin-bottom: 1rem; overflow: hidden; }
        .accordion-button:not(.collapsed) { color: #111827; background-color: #f8fafc; }
        .topic-meta { font-size: 0.95rem; color: #6b7280; margin-bottom: 0.75rem; }
        .topic-description { margin-bottom: 1rem; }
        .loading-placeholder { font-style: italic; color: #374151; }
      </style>
      <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.min.js" integrity="sha256-ew8UiV1pJH/YjpOEBInP1HxVvT/SfrCmwSoUzF9JIgc=" crossorigin="anonymous"></script>
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

        async function loadTopicContent(slug) {
          const content = document.querySelector('.topic-content[data-slug="' + slug + '"]');
          if (!content) return;
          if (topicCache.has(slug)) {
            content.innerHTML = marked.parse(topicCache.get(slug));
            return;
          }

          content.innerHTML = '<p class="loading-placeholder">Loading content…</p>';
          try {
            const response = await fetch('/topic/' + encodeURIComponent(slug) + '.md');
            if (!response.ok) {
              throw new Error('HTTP ' + response.status);
            }
            const md = await response.text();
            topicCache.set(slug, md);
            content.innerHTML = marked.parse(md);
          } catch (error) {
            console.error('Failed to load topic content:', error);
            content.innerHTML = '<div class="alert alert-danger">Unable to load content for ' + escapeHtml(slug) + '.</div>';
          }
        }

        function attachAccordionEvents() {
          document.querySelectorAll('.accordion-button').forEach(button => {
            button.addEventListener('click', () => {
              const slug = button.dataset.slug;
              if (slug) {
                loadTopicContent(slug);
              }
            });
          });
        }

        window.addEventListener('DOMContentLoaded', attachAccordionEvents);
      </script>
    </head>
    <body>
      <div class="container">
        <h1>Fufuni MCP Server - Knowledge Base</h1>
        <p class="lead">Click on a topic to expand and load its content.</p>
        <div class="accordion" id="knowledgeAccordion">
          ${topicListItems}
        </div>
      </div>
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

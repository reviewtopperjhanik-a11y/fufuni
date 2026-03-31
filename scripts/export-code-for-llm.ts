/**
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 * License: AGPL-3.0-or-later
 *
 * export-code-for-llm.ts — Enhanced LLM context exporter for Fufuni
 *
 * Improvements over v1:
 *  - Structured YAML front-matter for LLM system context
 *  - Architecture overview section (stack, conventions, key patterns)
 *  - Per-file metadata (exports, route bindings, DB tables, Stripe events)
 *  - Token budget awareness: configurable --max-tokens=N flag
 *  - --slim mode: strips comments and blank lines to reduce token count
 *  - Migration schema summary extracted from SQL files (shown before code)
 *  - Package.json trimmed to relevant keys only (no lockfile noise)
 *  - llms.txt companion file (ultra-compact index for Haiku/fast models)
 *  - --verbose flag to inspect per-section token costs
 */

import fg from "fast-glob";
import fs from "node:fs/promises";
import path from "node:path";

// ─── CLI flags ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const outFile      = args.find((a) => !a.startsWith("--")) ?? "llms.md";
const slim         = args.includes("--slim");
const maxTokensArg = args.find((a) => a.startsWith("--max-tokens="));
const maxTokens    = maxTokensArg ? parseInt(maxTokensArg.split("=")[1]) : Infinity;
const withIndex    = !args.includes("--no-index");
const verbose      = args.includes("--verbose");

// ─── Helpers ──────────────────────────────────────────────────────────────────
function languageForExt(ext: string): string {
    const map: Record<string, string> = {
        ".ts": "typescript", ".tsx": "typescript",
        ".js": "javascript", ".jsx": "javascript",
        ".json": "json",     ".css": "css",    ".sql": "sql",
    };
    return map[ext] ?? "";
}

/** Rough token estimator: ~1 token per 4 chars (GPT-4 heuristic) */
function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

/** Strip single-line and block comments + consecutive blank lines */
function slimify(src: string, ext: string): string {
    if (ext === ".sql") return src;
    return src
        .replace(/\/\/.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*[\r\n]/gm, "");
}

/** Extract named exports from a TS/TSX file */
function extractExports(src: string): string[] {
    const re =
        /export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|type|interface|enum)\s+(\w+)/g;
    const found: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) found.push(m[1]);
    return [...new Set(found)];
}

/** Extract Hono/Express-style route definitions */
function extractRoutes(src: string): string[] {
    const re = /\.(?:get|post|put|patch|delete|all)\(["'`]([^"'`]+)["'`]/g;
    const found: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) found.push(m[1]);
    return [...new Set(found)];
}

/** Extract D1/SQL table names referenced in the source */
function extractTables(src: string): string[] {
    const re = /(?:FROM|INTO|UPDATE|JOIN)\s+([\w]+)/gi;
    const found: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) found.push(m[1].toLowerCase());
    return [...new Set(found)];
}

/** Extract Stripe event types handled */
function extractStripeEvents(src: string): string[] {
    const re =
        /["']((?:checkout|customer|payment_intent|invoice|subscription|product|price|webhook)[^"'\s]+)['"]/g;
    const found: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) found.push(m[1]);
    return [...new Set(found)];
}

/**
 * Summarise a SQL migration: extract CREATE TABLE names + column names.
 */
function summariseSql(src: string): string {
    const tables: string[] = [];
    const re =
        /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"'\[]?([\w]+)[`"'\]]?\s*\(([^;]+)\)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
        const name = m[1];
        const cols = m[2]
            .split(",")
            .map((c) => c.trim().split(/\s+/)[0])
            .filter(
                (c) =>
                    c &&
                    !/^(PRIMARY|UNIQUE|INDEX|FOREIGN|CHECK|CONSTRAINT)$/i.test(c)
            )
            .join(", ");
        tables.push(`**${name}** (${cols})`);
    }
    return tables.length ? tables.join("\n") : "";
}

/** Build ASCII tree from relative paths */
function buildTree(paths: string[]): string[] {
    const root = new Map<string, Map<string, any>>();
    for (const p of paths) {
        const parts = p.split("/");
        let node = root;
        for (const part of parts) {
            if (!node.has(part)) node.set(part, new Map());
            node = node.get(part);
        }
    }
    const lines: string[] = [];
    function walk(map: Map<string, any>, prefix: string) {
        const entries = Array.from(map.keys()).sort();
        entries.forEach((key, index) => {
            const last = index === entries.length - 1;
            lines.push(`${prefix}${last ? "└─ " : "├─ "}${key}`);
            const child = map.get(key);
            if (child?.size > 0) walk(child, prefix + (last ? "   " : "│  "));
        });
    }
    walk(root, "");
    return lines;
}

// ─── Architecture preamble ────────────────────────────────────────────────────
const ARCHITECTURE_PREAMBLE = `
## Architecture overview

Fufuni is a **full-stack e-commerce framework** built as a Turborepo monorepo.

### Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React 19 + Vite | \`apps/client\` — storefront SPA |
| Backend | Hono on Cloudflare Workers | \`apps/merchant\` — REST API + Stripe webhooks |
| Database | Cloudflare D1 (SQLite) | Migrations in \`apps/merchant/migrations/\` |
| Payments | Stripe (Checkout + Webhooks) | Products, prices, subscriptions, invoices |
| Auth | Clerk | JWT-based, enforced in Hono middleware |
| Storage | Cloudflare R2 | Product images, assets |
| Deployment | Wrangler + Vite build | Single \`turbo run build\` command |

### Key patterns

- **API routes** declared in \`apps/merchant/src/routes/\` using Hono's chainable \`.get() / .post()\` syntax
- **D1 queries** use parameterised statements via \`c.env.DB.prepare(...).bind(...)\`
- **Stripe webhooks** verified with \`stripe.webhooks.constructEvent()\` before any mutation
- **React components** in \`apps/client/src/components/\` are Tailwind-styled functional components with React Query for data fetching
- **Type safety** is end-to-end: Zod schemas in \`apps/merchant/src/schemas/\` validate both API I/O and DB results
- **Environment variables** typed via the \`Env\` interface in \`apps/merchant/src/types.ts\`

### Critical files for new contributors

| File | Purpose |
|------|---------|
| \`apps/merchant/src/index.ts\` | Hono app entry point, middleware stack |
| \`apps/merchant/src/routes/\` | All REST endpoints |
| \`apps/merchant/migrations/\` | D1 schema — read first to understand the data model |
| \`apps/client/src/App.tsx\` | React Router root, protected routes |
| \`apps/client/src/hooks/\` | Custom React Query hooks — data-layer API |
| \`apps/client/src/components/checkout/\` | Stripe Checkout integration |
`.trim();

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    const root = process.cwd();

    let readmeContent = "";
    try {
        readmeContent = await fs.readFile(path.join(root, "README.md"), "utf8");
    } catch {
        // ignore
    }

    const patterns = [
        "apps/client/src/**/*.{ts,tsx,js,jsx,json}",
        "apps/merchant/src/**/*.{ts,tsx,js,jsx,json}",
        "apps/merchant/migrations/*.sql",
    ];
    const ignore = [
        "**/node_modules/**", "**/dist/**", "**/.next/**", "**/*.d.ts",
        "apps/merchant/admin/**", "apps/merchant/example/**",
    ];

    const files = await fg(patterns, { cwd: root, absolute: true, onlyFiles: true, ignore });

    type CodeFile = {
        rel: string; content: string; ext: string;
        exports: string[]; routes: string[]; tables: string[]; stripeEvents: string[];
    };
    type ConfigFile = { rel: string; content: string };
    type SqlFile    = { rel: string; content: string; summary: string };

    const codeFiles:   CodeFile[]   = [];
    const configFiles: ConfigFile[] = [];
    const sqlFiles:    SqlFile[]    = [];

    for (const abs of files) {
        const rel = path.relative(root, abs);
        const ext = path.extname(rel).toLowerCase();
        const raw = await fs.readFile(abs, "utf8");

        if (ext === ".json") {
            if (rel.endsWith("package.json")) {
                try {
                    const pkg = JSON.parse(raw);
                    const trimmed = {
                        name:            pkg.name,
                        version:         pkg.version,
                        type:            pkg.type,
                        dependencies:    pkg.dependencies    ?? {},
                        devDependencies: Object.fromEntries(
                            Object.entries(pkg.devDependencies ?? {}).slice(0, 30)
                        ),
                    };
                    configFiles.push({ rel, content: JSON.stringify(trimmed, null, 2) });
                } catch {
                    configFiles.push({ rel, content: raw });
                }
            } else {
                configFiles.push({ rel, content: raw });
            }
        } else if (ext === ".sql") {
            sqlFiles.push({ rel, content: raw, summary: summariseSql(raw) });
        } else {
            const content = slim ? slimify(raw, ext) : raw;
            codeFiles.push({
                rel, content, ext,
                exports:      extractExports(raw),
                routes:       extractRoutes(raw),
                tables:       extractTables(raw),
                stripeEvents: extractStripeEvents(raw),
            });
        }
    }

    codeFiles.sort((a, b)   => a.rel.localeCompare(b.rel));
    configFiles.sort((a, b) => a.rel.localeCompare(b.rel));
    sqlFiles.sort((a, b)    => a.rel.localeCompare(b.rel));

    const allPaths = [
        ...codeFiles.map((f)   => f.rel),
        ...sqlFiles.map((f)    => f.rel),
        ...configFiles.map((f) => f.rel),
    ];

    const now = new Date().toISOString().slice(0, 10);
    let md = "";

    // YAML front-matter
    md += `---\n`;
    md += `title: "Fufuni e-commerce framework — full source context"\n`;
    md += `description: "Complete source export for LLM-assisted development. Includes architecture overview, all TypeScript/SQL source files with per-file metadata, and schema summaries."\n`;
    md += `framework: fufuni\n`;
    md += `stack: "React 19, Hono, Cloudflare Workers, D1, Stripe, Clerk"\n`;
    md += `generated: "${now}"\n`;
    md += `slim_mode: ${slim}\n`;
    md += `files_total: ${allPaths.length}\n`;
    md += `---\n\n`;

    if (readmeContent) {
        md += readmeContent.trim() + "\n\n---\n\n";
    }

    md += ARCHITECTURE_PREAMBLE + "\n\n---\n\n";

    const treeLines = buildTree(allPaths);
    if (treeLines.length) {
        md += "## Project structure\n\n";
        md += "```\n" + treeLines.join("\n") + "\n```\n\n";
    }

    // DB schema summary placed before code
    if (sqlFiles.length) {
        md += "## Database schema\n\n";
        md += "_Extracted from SQL migrations. Read these before the source code to understand the data model._\n\n";
        for (const f of sqlFiles) {
            md += `### Migration: \`${f.rel}\`\n\n`;
            if (f.summary) md += f.summary + "\n\n";
            md += "```sql\n" + f.content + (f.content.endsWith("\n") ? "" : "\n") + "```\n\n";
        }
    }

    // Source files with per-file metadata
    if (codeFiles.length) {
        md += "## Source code\n\n";
        let tokenCount = estimateTokens(md);

        for (const file of codeFiles) {
            const lang = languageForExt(file.ext);
            let section = `### \`${file.rel}\`\n\n`;

            const metaParts: string[] = [];
            if (file.exports.length)
                metaParts.push(`**Exports:** ${file.exports.join(", ")}`);
            if (file.routes.length)
                metaParts.push(`**Routes:** \`${file.routes.join("`, `")}\``);
            if (file.tables.length)
                metaParts.push(`**D1 tables:** ${file.tables.join(", ")}`);
            if (file.stripeEvents.length)
                metaParts.push(`**Stripe events:** ${file.stripeEvents.join(", ")}`);
            if (metaParts.length) section += metaParts.join("  \n") + "\n\n";

            section += "```" + lang + "\n" + file.content +
                (file.content.endsWith("\n") ? "" : "\n") + "```\n\n";

            const sectionTokens = estimateTokens(section);
            if (tokenCount + sectionTokens > maxTokens) {
                section = `### \`${file.rel}\`\n\n> _Omitted: token budget reached (--max-tokens=${maxTokens})._\n\n`;
            }
            tokenCount += sectionTokens;
            md += section;
        }
    }

    // Config files
    if (configFiles.length) {
        md += "## Configuration\n\n";
        for (const f of configFiles) {
            md += `### \`${f.rel}\`\n\n`;
            md += "```json\n" + f.content + (f.content.endsWith("\n") ? "" : "\n") + "```\n\n";
        }
    }

    await fs.writeFile(outFile, md, "utf8");
    const totalTokens = estimateTokens(md);
    console.log(
        `Exported ${allPaths.length} files → ${outFile}  (~${totalTokens.toLocaleString()} tokens${slim ? ", slim mode" : ""})`
    );

    // Companion llms.txt — ultra-compact index for Haiku / fast models
    if (withIndex) {
        const indexFile = path.join(path.dirname(outFile), "llms.txt");
        let idx = `Fufuni e-commerce framework — source index (${now})\n`;
        idx += `Stack: React 19 + Vite (client) · Hono on Cloudflare Workers (API) · Durable Objects (SQLite) · Stripe · Auth0\n\n`;
        idx += `FILES\n`;
        for (const p of allPaths) idx += `  ${p}\n`;

        idx += `\nDB TABLES\n`;
        const allTables = [
            ...new Set([
                ...codeFiles.flatMap((f) => f.tables),
                ...sqlFiles.flatMap((f) => {
                    const m =
                        f.content.match(
                            /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?([\w]+)/gi
                        ) ?? [];
                    return m.map((s) => s.split(/\s+/).pop()!.toLowerCase());
                }),
            ]),
        ].sort();
        for (const t of allTables) idx += `  ${t}\n`;

        idx += `\nSTRIPE EVENTS\n`;
        const allEvents = [...new Set(codeFiles.flatMap((f) => f.stripeEvents))].sort();
        for (const e of allEvents) idx += `  ${e}\n`;

        idx += `\nAPI ROUTES\n`;
        const allRoutes = [...new Set(codeFiles.flatMap((f) => f.routes))].sort();
        for (const r of allRoutes) idx += `  ${r}\n`;

        await fs.writeFile(indexFile, idx, "utf8");
        console.log(`Index written → ${indexFile}`);
    }

    if (verbose) {
        console.log(`\nToken breakdown:`);
        console.log(`  README:       ~${estimateTokens(readmeContent).toLocaleString()}`);
        console.log(`  Architecture: ~${estimateTokens(ARCHITECTURE_PREAMBLE).toLocaleString()}`);
        console.log(`  SQL schema:   ~${estimateTokens(sqlFiles.map((f) => f.content).join("")).toLocaleString()}`);
        console.log(`  Source code:  ~${estimateTokens(codeFiles.map((f) => f.content).join("")).toLocaleString()}`);
        console.log(`  Config:       ~${estimateTokens(configFiles.map((f) => f.content).join("")).toLocaleString()}`);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

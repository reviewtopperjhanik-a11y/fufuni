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
import { parse as parseDotenv } from "dotenv";

// ─── CLI flags ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
    console.log(`USAGE: npx tsx scripts/export-code-for-llm.ts [options] [output-file]

Options:
  --help, -h              Show this help message
  --no-index              Skip llms.txt index generation
  --slim                  Shrink output by stripping comments and blank lines
  --max-tokens=<n>        Stop exporting when token budget is reached
  --openapi-url=<url>     Use this OpenAPI JSON URL for route extraction
  --openapi-bearer=<tok>  Bearer token used to fetch openapi.json
  --openapi-inline        Use local worker app to generate openapi.json (no backend)
  --no-backend            Alias for --openapi-inline
  --export-swagger        Save openapi.json file alongside llms.md + llms.txt
`);
    process.exit(0);
}
const outFile       = args.find((a) => !a.startsWith("--")) ?? "llms.md";
const slim          = args.includes("--slim");
const maxTokensArg  = args.find((a) => a.startsWith("--max-tokens="));
const maxTokens     = maxTokensArg ? parseInt(maxTokensArg.split("=")[1]) : Infinity;
const withIndex     = !args.includes("--no-index");
const verbose       = args.includes("--verbose");
const openApiInline = args.includes("--openapi-inline") || args.includes("--no-backend");
const exportSwagger = args.includes("--export-swagger");
const openApiUrlArg = args.find((a) => a.startsWith("--openapi-url="));
const openApiBearerArg = args.find((a) => a.startsWith("--openapi-bearer="));
const openApiUrl    =
    openApiUrlArg?.split("=")[1] ||
    process.env.OPENAPI_URL ||
    "http://127.0.0.1:8787/openapi.json";
const openApiBearer =
    openApiBearerArg?.split("=")[1] ||
    process.env.OPENAPI_BEARER ||
    process.env.MERCHANT_SK ||
    undefined;

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

/** Extract API routes from OpenAPI json content */
function extractOpenApiRoutes(src: string): string[] {
    try {
        const json = JSON.parse(src);
        if (!json.paths || typeof json.paths !== "object") return [];
        return Object.keys(json.paths).sort();
    } catch {
        return [];
    }
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
 * Extract CREATE TABLE names from SQL in any file.
 */
function extractCreateTableNames(src: string): string[] {
    const tables: string[] = [];
    const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"'\[]?([\w]+)[`"'\]]?/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(src)) !== null) {
        tables.push(match[1].toLowerCase());
    }
    return [...new Set(tables)];
}

async function loadDotEnv(): Promise<Record<string, string>> {
    const envPath = path.join(process.cwd(), ".env");
    try {
        const content = await fs.readFile(envPath, "utf8");
        const parsed = parseDotenv(content);
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === "string") {
                process.env[key] = value;
            }
        }
        return parsed;
    } catch (err) {
        if (verbose) console.warn(`.env introuvable ou erreur de lecture: ${err}`);
        return {};
    }
}

function makeMerchantStub(): unknown {
    return {
        idFromName: (name: string) => name,
        get: (_id: string) => ({ cleanupExpiredCarts: async () => 0 }),
    };
}

async function fetchOpenApiRoutesFromWorkerApp(bearer?: string): Promise<string[]> {
    const dotEnv = await loadDotEnv();

    if (!('caches' in globalThis)) {
        (globalThis as any).caches = {
            open: async () => ({
                match: async () => undefined,
                put: async () => undefined,
                delete: async () => false,
                keys: async () => [],
            }),
            has: async () => false,
            delete: async () => false,
            keys: async () => [],
        };
    }

    if (!('DurableObject' in globalThis)) {
        (globalThis as any).DurableObject = class {
            constructor(ctx: any, env: any) {
                return {} as any;
            }
        };
    }

    const merchantAppModule = await import("../apps/merchant/src/index.ts");
    const workerApp = (merchantAppModule.default ?? merchantAppModule) as { fetch: (req: Request, env: any) => Promise<Response> };

    if (!workerApp || typeof workerApp.fetch !== "function") {
        console.error("Erreur: impossible d'obtenir workerApp.fetch depuis apps/merchant/src/index.ts");
        return [];
    }

    const headers: Record<string, string> = { Accept: "application/json" };
    if (bearer) headers.Authorization = `Bearer ${bearer}`;

    const env = {
        ...dotEnv,
        ...process.env,
        MERCHANT: makeMerchantStub(),
    };

    let res: Response;
    try {
        res = await workerApp.fetch(new Request("http://localhost/openapi.json", { method: "GET", headers }), env);
    } catch (err) {
        console.error("Exception fetch openapi depuis worker inline:", err);
        return [];
    }

    if (!res.ok) {
        console.error(`OpenAPI inline worker failed: HTTP ${res.status} ${res.statusText}`);
        return [];
    }

    const json = await res.json();
    if (!json.paths || typeof json.paths !== "object") {
        console.error("OpenAPI inline worker réponse non conforme (paths absent)");
        return [];
    }

    return Object.keys(json.paths).sort();
}

async function fetchOpenApiJsonFromWorkerApp(bearer?: string): Promise<Record<string, any> | null> {
    const dotEnv = await loadDotEnv();

    if (!('caches' in globalThis)) {
        (globalThis as any).caches = {
            open: async () => ({
                match: async () => undefined,
                put: async () => undefined,
                delete: async () => false,
                keys: async () => [],
            }),
            has: async () => false,
            delete: async () => false,
            keys: async () => [],
        };
    }

    if (!('DurableObject' in globalThis)) {
        (globalThis as any).DurableObject = class {
            constructor(ctx: any, env: any) {
                return {} as any;
            }
        };
    }

    const merchantAppModule = await import("../apps/merchant/src/index.ts");
    const workerApp = (merchantAppModule.default ?? merchantAppModule) as { fetch: (req: Request, env: any) => Promise<Response> };

    if (!workerApp || typeof workerApp.fetch !== "function") {
        console.error("Erreur: impossible d'obtenir workerApp.fetch depuis apps/merchant/src/index.ts");
        return null;
    }

    const headers: Record<string, string> = { Accept: "application/json" };
    if (bearer) headers.Authorization = `Bearer ${bearer}`;

    const env = {
        ...dotEnv,
        ...process.env,
        MERCHANT: makeMerchantStub(),
    };

    let res: Response;
    try {
        res = await workerApp.fetch(new Request("http://localhost/openapi.json", { method: "GET", headers }), env);
    } catch (err) {
        console.error("Exception fetch openapi depuis worker inline:", err);
        return null;
    }

    if (!res.ok) {
        console.error(`OpenAPI inline worker failed: HTTP ${res.status} ${res.statusText}`);
        return null;
    }

    const json = await res.json();
    if (!json || typeof json !== "object") {
        console.error("OpenAPI inline worker réponse non conforme (JSON attendu)");
        return null;
    }

    return json;
}

/**
 * Summarise a SQL migration: extract CREATE TABLE names + column names.
 */
async function verifyBackendConnection(url: string, bearer?: string): Promise<void> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    let res: Response;
    try {
        res = await fetch(url, { method: "GET", headers });
    } catch (err) {
        throw new Error(`Impossible de contacter le backend à ${url} : ${err}`);
    }
    if (!res.ok) {
        throw new Error(`Backend non disponible à ${url} : HTTP ${res.status} ${res.statusText}`);
    }
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
        throw new Error(`Backend réponse inattendue à ${url} : content-type=${contentType}`);
    }
}

async function fetchOpenApiRoutesFromUrl(url: string, bearer?: string): Promise<string[]> {
    try {
        const headers: Record<string, string> = { Accept: "application/json" };
        if (bearer) headers.Authorization = `Bearer ${bearer}`;
        const res = await fetch(url, { method: "GET", headers });
        if (!res.ok) {
            console.error(`OpenAPI fetch failed (${res.status}): ${res.statusText}`);
            return [];
        }
        const json = await res.json();
        if (!json.paths || typeof json.paths !== "object") {
            console.error("OpenAPI JSON has no paths object");
            return [];
        }
        return Object.keys(json.paths).sort();
    } catch (err) {
        console.error("OpenAPI fetch exception:", err);
        return [];
    }
}

async function fetchOpenApiJsonFromUrl(url: string, bearer?: string): Promise<any | null> {
    try {
        const headers: Record<string, string> = { Accept: "application/json" };
        if (bearer) headers.Authorization = `Bearer ${bearer}`;
        const res = await fetch(url, { method: "GET", headers });
        if (!res.ok) {
            console.error(`OpenAPI fetch failed (${res.status}): ${res.statusText}`);
            return null;
        }
        const json = await res.json();
        if (!json || typeof json !== "object") {
            console.error("OpenAPI JSON not valid");
            return null;
        }
        return json;
    } catch (err) {
        console.error("OpenAPI fetch exception:", err);
        return null;
    }
}

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
            const next = node.get(part);
            if (next instanceof Map) {
                node = next;
            } else {
                break;
            }
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
        "apps/merchant/*.sql",
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

    if (withIndex) {
        if (!openApiInline && !openApiUrl) {
            throw new Error("openApiUrl est requis pour générer llms.txt avec API routes (si --openapi-inline / --no-backend n'est pas activé). ");
        }
        if (!openApiInline) {
            await verifyBackendConnection(openApiUrl, openApiBearer);
        }

        const indexFile = path.join(path.dirname(outFile), "llms.txt");
        let idx = `Fufuni e-commerce framework — source index (${now})\n`;
        idx += `Stack: React 19 + Vite (client) · Hono on Cloudflare Workers (API) · Durable Objects (SQLite) · Stripe · Auth0\n\n`;
        idx += `FILES\n`;
        for (const p of allPaths) idx += `  ${p}\n`;

        idx += `\nDB TABLES\n`;
        const allTables = [
            ...new Set([
                ...sqlFiles.flatMap((f) => extractCreateTableNames(f.content)),
                ...codeFiles.flatMap((f) => extractCreateTableNames(f.content)),
            ]),
        ].sort();
        for (const t of allTables) idx += `  ${t}\n`;

        idx += `\nSTRIPE EVENTS\n`;
        const allEvents = [...new Set(codeFiles.flatMap((f) => f.stripeEvents))].sort();
        for (const e of allEvents) idx += `  ${e}\n`;

        idx += `\nAPI ROUTES\n`;
        let apiRoutes = [...new Set(codeFiles.flatMap((f) => f.routes))].sort();

        if (openApiInline) {
            const openApiRoutes = await fetchOpenApiRoutesFromWorkerApp(openApiBearer);
            if (openApiRoutes.length) {
                apiRoutes = openApiRoutes;
                if (verbose) console.log(`Using inline worker openapi for API route list (x${apiRoutes.length}).`);
            } else {
                console.warn("OpenAPI inline extraction failed; using code route fallback.");
            }
        } else if (openApiUrl) {
            const openApiRoutes = await fetchOpenApiRoutesFromUrl(openApiUrl, openApiBearer);
            if (openApiRoutes.length) {
                apiRoutes = openApiRoutes;
                if (verbose) console.log(`Using ${openApiUrl} for API route list (x${apiRoutes.length}).`);
            } else {
                console.warn("OpenAPI URL provided but route extraction failed; using code route fallback.");
            }
        }

        for (const r of apiRoutes) idx += `  ${r}\n`;

        await fs.writeFile(indexFile, idx, "utf8");
        console.log(`Index written → ${indexFile}`);
    }

    if (exportSwagger) {
        let openApiJson: Record<string, any> | null = null;
        if (openApiInline) {
            openApiJson = await fetchOpenApiJsonFromWorkerApp(openApiBearer);
        } else if (openApiUrl) {
            openApiJson = await fetchOpenApiJsonFromUrl(openApiUrl, openApiBearer);
        }

        if (openApiJson) {
            const swaggerFile = path.join(path.dirname(outFile), "openapi.json");
            await fs.writeFile(swaggerFile, JSON.stringify(openApiJson, null, 2), "utf8");
            console.log(`Swagger OpenAPI JSON written → ${swaggerFile}`);
        } else {
            console.warn("--export-swagger demandé mais impossible de récupérer openapi.json");
        }
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

// Copyright (c) 2024-2026 Ronan LE MEILLAT - SCTG Development
// License: AGPL-3.0-or-later

export type CliFlags = {
  topicFlags: string[];
  aiJsonEncFlag: string | undefined;
  showKeyOwner: boolean;
  showKeyUsageSummary: boolean;
  exportMaskedAiJson: boolean;
  dryRun: boolean;
  skipAI: boolean;
  offlineFetch: boolean;
  offlineBash: boolean;
  offlineYaml: boolean;
  offlineMode: boolean;
  skipNetwork: boolean;
  force: boolean;
  autoRefresh: boolean;
  discoverModels: boolean;
  noModelFallback: boolean;
  fetchTimeoutMs: number;
  maxTokenOverride: number | null;
  verbose: boolean;
  manifestOnly: boolean;
  bm25IndexOnly: boolean;
  showHelp: boolean;
  /** Value of --provider=<key> from CLI only (does not include AI_PROVIDER env var). */
  providerArgFromCli: string | undefined;
};

export const VALID_FLAGS = new Set([
  '--help',
  '-h',
  '--dry-run',
  '--skip-ai',
  '--offline-fetch',
  '--offline-bash',
  '--offline-yaml',
  '--force',
  '--auto-refresh',
  '--discover-models',
  '--verbose',
  '--ai-json-enc',
  '--show-key-owner',
  '--key-usage-summary',
  '--no-model-fallback',
  '--fetch-timeout',
  '--max-token-override',
  '--export-masked-ai-json',
  '--manifest-only',
  '--bm25-index-only',
  '--provider',
]);

/**
 * Parse command-line arguments into a structured flags object.
 *
 * @param argv - Raw process.argv slice (without node and script path).
 * @returns Parsed CLI flags.
 */
export function parseCliArgs(argv: string[]): CliFlags {
  const topicFlags = argv
    .filter((a) => a.startsWith('--topic='))
    .map((a) => a.split('=')[1])
    .filter(Boolean);
  const aiJsonEncFlag = argv.find((a) => a.startsWith('--ai-json-enc='))?.split('=')[1];
  const showKeyOwner = argv.includes('--show-key-owner');
  const showKeyUsageSummary = argv.includes('--key-usage-summary');
  const exportMaskedAiJson = argv.includes('--export-masked-ai-json');
  const dryRun = argv.includes('--dry-run');
  const skipAI = argv.includes('--skip-ai');
  const offlineFetch = argv.includes('--offline-fetch');
  const offlineBash = argv.includes('--offline-bash');
  const offlineYaml = argv.includes('--offline-yaml');
  const offlineMode = offlineFetch || offlineBash || offlineYaml;
  const skipNetwork = skipAI || offlineMode;
  const force = argv.includes('--force');
  const autoRefresh = argv.includes('--auto-refresh');
  const discoverModels = argv.includes('--discover-models');
  const noModelFallback = argv.includes('--no-model-fallback');
  const fetchTimeoutMs = (() => {
    const f = argv.find((a) => a.startsWith('--fetch-timeout='));
    return f ? parseInt(f.split('=')[1], 10) * 1_000 : 90_000;
  })();
  const maxTokenOverride = (() => {
    const f = argv.find((a) => a.startsWith('--max-token-override='));
    return f ? parseInt(f.split('=')[1], 10) : null;
  })();
  const verbose = argv.includes('--verbose');
  const manifestOnly = argv.includes('--manifest-only');
  const bm25IndexOnly = argv.includes('--bm25-index-only');
  const showHelp = argv.includes('--help') || argv.includes('-h');
  const providerArgFromCli = argv.find((a) => a.startsWith('--provider='))?.slice(11);

  return {
    topicFlags,
    aiJsonEncFlag,
    showKeyOwner,
    showKeyUsageSummary,
    exportMaskedAiJson,
    dryRun,
    skipAI,
    offlineFetch,
    offlineBash,
    offlineYaml,
    offlineMode,
    skipNetwork,
    force,
    autoRefresh,
    discoverModels,
    noModelFallback,
    fetchTimeoutMs,
    maxTokenOverride,
    verbose,
    manifestOnly,
    bm25IndexOnly,
    showHelp,
    providerArgFromCli,
  };
}

/**
 * Print CLI usage help and exit.
 *
 * @param relativePath - Script path shown in usage examples.
 * @param exitCode - Exit code to use when terminating the process.
 */
export function printHelp(relativePath: string, exitCode = 0): void {
  console.log(`Usage: npx tsx ${relativePath} [options]

Options:
  --help, -h           Show this help message and exit
  --topic=<name>       Generate the named topic (use the topic slug from the topic list). Can be specified multiple times.
  --ai-json-enc=<file> Specify an alternative ai.json.enc config file path
  --show-key-owner     Print the owner of the API key used for each AI call
  --key-usage-summary  Print a summary of each API key's success/failure counts at the end of execution
  --export-masked-ai-json  Decrypt ai.json.enc and print a masked JSON export to stdout
  --provider=<key>     Only use models from the specified provider key
  --dry-run            Build prompts without calling the AI or writing files
  --skip-ai            Build files from extracted source only, no AI call
  --offline-fetch      Do not call the network; generate per-topic TypeScript fetch scripts instead
  --offline-bash       Do not call the network; generate per-topic bash curl scripts instead
  --offline-yaml        Do not call the network; generate per-topic YAML request descriptions instead
  --manifest-only      Build only the manifest from existing generated topic markdown files
  --bm25-index-only    Build only the BM25 index and chunk files from existing generated topic markdown files
  --force              Overwrite existing mcp/*.md files
  --auto-refresh       Only regenerate topics whose source/manualFacts checksum changed
  --discover-models    Ignore AI_MODEL and force discovery via GET /models
  --no-model-fallback  Never switch to another model on error; retry transient failures on the same model only
  --fetch-timeout=<s>       Abort a stalled AI request after this many seconds and retry (default: 90)
  --max-token-override=<n>  Override the per-request token cap (like MAX_TOKENS_PER_REQUEST env var)
  --verbose                 Show additional debug logs

Environment variables:
  AI_API_KEY           Comma-separated list of Groq API keys
  AI_MODEL             Optional pinned model ID
  AI_API_URL           Optional API endpoint override
  CRYPTOKEN            Password used to encrypt/decrypt ai.json.enc

Topics are auto-discovered from apps/mcp/src/knowledge/topics/*.ts
Each file must export a default Topic object.

Examples:
npx tsx ${relativePath} --topic=migrations
npx tsx ${relativePath} --topic=migrations --topic=do-schemas
npx tsx ${relativePath} --discover-models
npx tsx ${relativePath} --dry-run
npx tsx ${relativePath} --force
AI_MODEL="" AI_API_KEY="" AI_API_URL="" npx tsx ${relativePath} --auto-refresh --provider=gemini
`);
  process.exit(exitCode);
}

/**
 * Validate CLI arguments and exit with an error if unknown flags are present.
 *
 * @param argv - Raw process.argv slice.
 * @param relativePath - Script path shown in error messages.
 */
export function validateCliArgs(argv: string[], relativePath: string): void {
  const unknownFlags = argv.filter(
    (arg) =>
      !VALID_FLAGS.has(arg) &&
      !arg.startsWith('--topic=') &&
      !arg.startsWith('--ai-json-enc=') &&
      !arg.startsWith('--provider=') &&
      !arg.startsWith('--fetch-timeout=') &&
      !arg.startsWith('--max-token-override='),
  );

  if (unknownFlags.length > 0) {
    console.error(
      `Error: unknown flag${unknownFlags.length > 1 ? 's' : ''}: ${unknownFlags.join(', ')}`,
    );
    printHelp(relativePath, 1);
  }
}

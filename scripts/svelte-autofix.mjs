import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

// The published MCP CLI registers documentation resources on startup and
// fetches svelte.dev even when only the local autofixer is requested. Keep
// this validation command offline so an unrelated docs request cannot hang it.
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith('https://svelte.dev/')) {
    return Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  }
  return nativeFetch(input, init);
};

const { svelteAutofixer } = await import('@sveltejs/mcp');

const files = process.argv.slice(2).filter((argument) => !argument.startsWith('-'));

if (files.length === 0) {
  console.error('Usage: pnpm run svelte:autofix -- <file.svelte> [file.svelte ...]');
  process.exit(2);
}

let hasIssues = false;

for (const file of files) {
  const filename = resolve(file);

  try {
    const code = await readFile(filename, 'utf8');
    const result = await svelteAutofixer({
      code,
      desired_svelte_version: 5,
      async: false,
      filename: basename(filename),
    });

    console.log(JSON.stringify({ file, ...result }, null, 2));
    hasIssues ||= result.issues.length > 0;
  } catch (error) {
    hasIssues = true;
    console.error(`${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

process.exit(hasIssues ? 1 : 0);

#!/usr/bin/env tsx
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';

type Route = { method: string; path: string; source: string; line: number; openapi: boolean };
const root = process.cwd();
const outJson = resolve(root, 'Doc/repository/API_ROUTE_INDEX_2026-08-10.json');
const outMd = resolve(root, 'Doc/repository/API_ROUTE_INDEX_2026-08-10.md');
const checkOnly = process.argv.includes('--check');
const minCoverage = Number(process.env.APEX_OPENAPI_MIN_COVERAGE ?? '1.00');

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name); const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else if (/\.(?:ts|mts)$/.test(name)) out.push(full);
  }
  return out;
}
function normalizePath(path: string): string { return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}'); }
function discoverRuntimeRoutes(): Route[] {
  const files = [
    resolve(root, 'server.ts'),
    ...walk(resolve(root, 'src/services')),
    ...walk(resolve(root, 'src/features')),
  ];
  const routes: Route[] = [];
  const seen = new Set<string>();
  const pattern = /\b(?:app|router)\.(get|post|put|patch|delete|options|head)\s*\(\s*(['"`])(\/api\/[^'"`]+)\2/g;
  for (const file of files) {
    const text = readFileSync(file, 'utf8'); let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      const method = match[1].toUpperCase(); const path = match[3];
      if (path.includes('${')) continue;
      const key = `${method} ${path}`; if (seen.has(key)) continue; seen.add(key);
      const line = text.slice(0, match.index).split(/\r?\n/).length;
      routes.push({ method, path, source: relative(root, file).replaceAll('\\', '/'), line, openapi: false });
    }
  }
  return routes.sort((a,b)=>a.path.localeCompare(b.path)||a.method.localeCompare(b.method));
}
function discoverOpenApiOperations(): Set<string> {
  const text = readFileSync(resolve(root, 'openapi/apex-api.v1.yaml'), 'utf8');
  const lines = text.split(/\r?\n/); const out = new Set<string>(); let path: string | null = null;
  for (const line of lines) {
    const pathMatch = line.match(/^  (\/api\/[^:]+):\s*$/); if (pathMatch) { path = pathMatch[1]; continue; }
    const methodMatch = line.match(/^    (get|post|put|patch|delete|options|head):\s*$/); if (path && methodMatch) out.add(`${methodMatch[1].toUpperCase()} ${path}`);
  }
  return out;
}
function build() {
  const openapi = discoverOpenApiOperations(); const routes = discoverRuntimeRoutes();
  for (const route of routes) route.openapi = openapi.has(`${route.method} ${normalizePath(route.path)}`);
  const runtimeKeys = new Set(routes.map((r)=>`${r.method} ${normalizePath(r.path)}`));
  const unknownOpenApi = [...openapi].filter((key)=>!runtimeKeys.has(key)).sort();
  const documented = routes.filter((r)=>r.openapi).length; const coverage = routes.length ? documented/routes.length : 1;
  const groups = new Map<string, number>();
  for (const route of routes) { const parts=route.path.split('/').filter(Boolean); const prefix=`/${parts.slice(0,2).join('/')}`; groups.set(prefix,(groups.get(prefix)||0)+1); }
  const json = { schemaVersion: 1, generatedAt: new Date().toISOString(), runtimeOperations: routes.length, openApiOperations: openapi.size, documentedRuntimeOperations: documented, coverage, minimumCoverage: minCoverage, unknownOpenApiOperations: unknownOpenApi, routes };
  const md = [
    '# APEX API Route Index — 2026-08-10','',
    `Runtime operations discovered: **${routes.length}**  `,
    `OpenAPI operations: **${openapi.size}**  `,
    `Runtime operations documented in OpenAPI: **${documented} (${(coverage*100).toFixed(1)}%)**  `,
    `CI coverage floor: **${(minCoverage*100).toFixed(1)}%**`,'',
    '> Generated from current literal Express route registrations in `server.ts`, `src/services/**/*.ts`, and `src/features/**/*.ts`. Parameter syntax is normalized from `:param` to `{param}` only for OpenAPI comparison.','',
    '## Route groups','', '| Prefix | Operations |','|---|---:|',
    ...[...groups].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([p,c])=>`| \`${p}\` | ${c} |`), '',
    '## Complete route index','', '| Method | Path | Source | OpenAPI |','|---|---|---|---|',
    ...routes.map((r)=>`| \`${r.method}\` | \`${r.path}\` | \`${r.source}:${r.line}\` | ${r.openapi?'yes':'no'} |`), '',
  ].join('\n');
  return { json, md, unknownOpenApi, coverage };
}
const built = build();
if (built.unknownOpenApi.length) { console.error(`[api-contract] OpenAPI contains ${built.unknownOpenApi.length} operation(s) absent from runtime: ${built.unknownOpenApi.join(', ')}`); process.exit(1); }
if (built.coverage < minCoverage) { console.error(`[api-contract] OpenAPI coverage ${(built.coverage*100).toFixed(1)}% is below floor ${(minCoverage*100).toFixed(1)}%.`); process.exit(1); }
if (checkOnly) {
  if (!existsSync(outJson) || !existsSync(outMd)) { console.error('[api-contract] route index missing; run npm run index:routes'); process.exit(1); }
  const current = JSON.parse(readFileSync(outJson,'utf8')); const expected = built.json as any;
  const comparable = (value:any)=>JSON.stringify(value, (k,v)=>k==='generatedAt'?undefined:v);
  if (comparable(current)!==comparable(expected) || readFileSync(outMd,'utf8').replace(/^Generated.*$/m,'')!==built.md.replace(/^Generated.*$/m,'')) {
    console.error('[api-contract] generated API route index drifted; run npm run index:routes and commit the result.'); process.exit(1);
  }
  console.log(`[api-contract] passed: ${expected.runtimeOperations} runtime routes, ${expected.documentedRuntimeOperations} documented (${(expected.coverage*100).toFixed(1)}%), no unknown OpenAPI operations.`);
} else {
  writeFileSync(outJson, JSON.stringify(built.json,null,2)+'\n'); writeFileSync(outMd,built.md);
  console.log(`[api-contract] wrote route index: ${built.json.runtimeOperations} runtime routes, ${built.json.documentedRuntimeOperations} documented (${(built.coverage*100).toFixed(1)}%).`);
}

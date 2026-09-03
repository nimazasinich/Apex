#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createRepositoryResolver, parseFileDependencies } from '../utilities/app-index/resolver.mjs';

const requireFromHere = createRequire(import.meta.url);
function resolveTypeScript() {
  const local = path.resolve('node_modules/typescript/lib/typescript.js');
  if (fs.existsSync(local)) return local;
  try {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim();
    const globalTs = path.join(globalRoot, 'typescript', 'lib', 'typescript.js');
    if (fs.existsSync(globalTs)) return globalTs;
  } catch {}
  throw new Error('typescript_runtime_unavailable');
}
const ts = requireFromHere(resolveTypeScript());
const checks = [];
const check = (name, ok, detail='') => { checks.push(Boolean(ok)); console.log(`${ok?'PASS':'FAIL'} ${name}${detail?` — ${detail}`:''}`); };

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-resolver-'));
try {
  const write = (file, content='export {};\n') => { const abs=path.join(root,file); fs.mkdirSync(path.dirname(abs),{recursive:true}); fs.writeFileSync(abs,content); };
  write('tsconfig.json', JSON.stringify({ compilerOptions:{ moduleResolution:'bundler', paths:{ '@core/*':['src/core/*'], '@utils/*':['src/utils/*'] } }, include:['src/**/*'] }, null, 2));
  write('vite.config.ts', `import path from 'node:path';\nexport default { resolve:{ alias:{ '~shared': path.resolve(__dirname, 'src/shared') } } };\n`);
  write('package.json', JSON.stringify({ imports:{ '#domain/*':'./src/domain/*' } }, null, 2));
  write('src/core/Feature.ts', `export const Feature = 1; export default 2;\n`);
  write('src/utils/helper.ts');
  write('src/shared/tool.ts');
  write('src/domain/model.ts');
  write('src/widgets/Card.ts');
  write('src/views/Home.tsx');
  write('src/views/admin/User.tsx');
  write('src/plugins/alpha.ts');
  write('src/plugins/beta.ts');
  write('src/main.ts', `
import coreDefault, { Feature } from '@core/Feature';
import '@utils/helper';
import '~shared/tool';
import '#domain/model';
import './Widgets/Card';
const views = import.meta.glob('./views/**/*.tsx');
export async function plugin(name:string){ return import(\`./plugins/\${name}.ts\`); }
export async function unknown(specifier:string){ return import(specifier); }
void views; void coreDefault; void Feature;
`);
  const allFiles = new Set([]);
  const walk=(d)=>{ for(const e of fs.readdirSync(d,{withFileTypes:true})){ const a=path.join(d,e.name); if(e.isDirectory()) walk(a); else allFiles.add(path.relative(root,a).split(path.sep).join('/')); } }; walk(root);
  const resolver = createRepositoryResolver({ root, allFiles, ts });

  const tsAlias = resolver.resolveSpecifier({ importer:'src/main.ts', specifier:'@core/Feature' });
  check('tsconfig paths alias resolves', tsAlias.target === 'src/core/Feature.ts' && tsAlias.authoritative, JSON.stringify(tsAlias));
  const viteAlias = resolver.resolveSpecifier({ importer:'src/main.ts', specifier:'~shared/tool' });
  check('Vite resolve.alias resolves', viteAlias.target === 'src/shared/tool.ts' && viteAlias.authoritative, JSON.stringify(viteAlias));
  const pkgAlias = resolver.resolveSpecifier({ importer:'src/main.ts', specifier:'#domain/model' });
  check('package imports alias resolves', pkgAlias.target === 'src/domain/model.ts' && pkgAlias.authoritative, JSON.stringify(pkgAlias));
  const caseHit = resolver.resolveSpecifier({ importer:'src/main.ts', specifier:'./Widgets/Card' });
  check('case-insensitive fallback resolves but records mismatch', caseHit.target === 'src/widgets/Card.ts' && caseHit.caseMismatch === true && caseHit.resolution === 'case-insensitive', JSON.stringify(caseHit));
  const fuzzy = resolver.resolveSpecifier({ importer:'src/main.ts', specifier:'./widgts/Card' });
  check('fuzzy basename fallback is probable-only', fuzzy.target === 'src/widgets/Card.ts' && fuzzy.probable === true && fuzzy.authoritative === false, JSON.stringify(fuzzy));
  const external = resolver.resolveSpecifier({ importer:'src/main.ts', specifier:'react' });
  check('bare package remains external', external.resolution === 'external' && external.package === 'react');

  const dep = parseFileDependencies({ absPath:path.join(root,'src/main.ts'), file:'src/main.ts', resolver, ts, allFiles });
  const targets = new Set(dep.internal.map((d)=>d.target));
  check('import.meta.glob expands literal pattern', targets.has('src/views/Home.tsx') && targets.has('src/views/admin/User.tsx'), [...targets].join(','));
  check('dynamic import template enumerates matching modules', targets.has('src/plugins/alpha.ts') && targets.has('src/plugins/beta.ts'), [...targets].join(','));
  check('non-enumerable dynamic import is retained as unresolved evidence', dep.unresolved.some((d)=>d.kind==='dynamic-import-variable' && d.reason==='dynamic-import-expression-not-statically-enumerable'));
  check('case mismatch remains visible on dependency edge', dep.internal.some((d)=>d.target==='src/widgets/Card.ts' && d.caseMismatch));
  check('resolver exposes config provenance', resolver.summary.aliases.some((a)=>a.kind==='tsconfig-paths') && resolver.summary.aliases.some((a)=>a.kind==='vite') && resolver.summary.aliases.some((a)=>a.kind==='package-imports'));
  const coreEdge = dep.internal.find((d)=>d.target==='src/core/Feature.ts');
  check('static import records imported symbol names', coreEdge?.importedNames?.includes('default') && coreEdge?.importedNames?.includes('Feature'), JSON.stringify(coreEdge));
  check('AST declaration/export facts are surfaced', dep.syntax?.declarations?.some((d)=>d.name==='plugin' && d.exported) && dep.syntax?.exports?.some((e)=>e.name==='plugin'), JSON.stringify(dep.syntax));
  write('src/broken.ts', 'export const broken = ;\n');
  allFiles.add('src/broken.ts');
  const broken = parseFileDependencies({ absPath:path.join(root,'src/broken.ts'), file:'src/broken.ts', resolver, ts, allFiles });
  check('parse diagnostics are explicit instead of silently dropped', broken.syntax?.parseError === true && broken.syntax?.parseDiagnosticCount > 0, JSON.stringify(broken.syntax));
} finally {
  fs.rmSync(root,{recursive:true,force:true});
}
const passed=checks.filter(Boolean).length;
console.log(`\nApp Index resolver contract: ${passed}/${checks.length} PASS`);
process.exit(passed===checks.length?0:1);

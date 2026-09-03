import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_RESOLVE_EXTS = ['.ts', '.tsx', '.mts', '.cts', '.mjs', '.cjs', '.js', '.jsx', '.json', '.css', '.svg'];
const SOURCE_SUBSTITUTIONS = new Map([
  ['.js', ['.ts', '.tsx', '.mts', '.cts', '.d.ts', '.js', '.jsx']],
  ['.jsx', ['.tsx', '.ts', '.jsx']],
  ['.mjs', ['.mts', '.d.mts', '.mjs']],
  ['.cjs', ['.cts', '.d.cts', '.cjs']],
]);

const posix = (p) => p.split(path.sep).join('/');
const clamp01 = (n) => Math.max(0, Math.min(1, n));

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function literalPropertyName(node, ts) {
  if (!node) return null;
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) return String(node.text);
  return null;
}

function staticPathExpression(node, { ts, root, viteConfigDir }) {
  if (!node) return null;
  if (ts.isStringLiteralLike(node)) return path.resolve(viteConfigDir, node.text);
  if (ts.isCallExpression(node)) {
    const callee = ts.isPropertyAccessExpression(node.expression)
      ? `${node.expression.expression.getText()}.${node.expression.name.text}`
      : ts.isIdentifier(node.expression) ? node.expression.text : '';
    if (callee === 'path.resolve' || callee === 'path.join' || callee === 'resolve' || callee === 'join') {
      const parts = [];
      for (const arg of node.arguments) {
        if (ts.isIdentifier(arg) && arg.text === '__dirname') parts.push(viteConfigDir);
        else if (ts.isStringLiteralLike(arg)) parts.push(arg.text);
        else return null;
      }
      return path.resolve(...parts);
    }
  }
  if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'URL' && node.arguments?.length >= 2) {
    const [first, second] = node.arguments;
    if (ts.isStringLiteralLike(first) && second.getText().replace(/\s+/g, '') === 'import.meta.url') {
      return path.resolve(viteConfigDir, first.text);
    }
  }
  return null;
}

function parseViteAliases({ root, ts, viteConfigPath }) {
  const rules = [];
  const diagnostics = [];
  if (!viteConfigPath || !fs.existsSync(viteConfigPath)) return { rules, diagnostics };
  const source = fs.readFileSync(viteConfigPath, 'utf8');
  const sf = ts.createSourceFile(viteConfigPath, source, ts.ScriptTarget.Latest, true);
  const viteConfigDir = path.dirname(viteConfigPath);

  const addRule = (find, replacement, sourceKind = 'vite.resolve.alias') => {
    if (typeof find !== 'string' || !find || !replacement) return;
    rules.push({ kind: 'vite', key: find, wildcard: find.endsWith('/*'), replacement: path.resolve(replacement), source: sourceKind });
  };

  const parseAliasObject = (obj) => {
    for (const prop of obj.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const key = literalPropertyName(prop.name, ts);
      if (!key) continue;
      const replacement = staticPathExpression(prop.initializer, { ts, root, viteConfigDir });
      if (replacement) addRule(key, replacement);
      else diagnostics.push({ type: 'vite-alias-unparsed', alias: key, expression: prop.initializer.getText(sf) });
    }
  };

  const parseAliasArray = (arr) => {
    for (const el of arr.elements) {
      if (!ts.isObjectLiteralExpression(el)) continue;
      let find = null, replacement = null;
      for (const prop of el.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const key = literalPropertyName(prop.name, ts);
        if (key === 'find' && ts.isStringLiteralLike(prop.initializer)) find = prop.initializer.text;
        if (key === 'replacement') replacement = staticPathExpression(prop.initializer, { ts, root, viteConfigDir });
      }
      if (find && replacement) addRule(find, replacement);
      else diagnostics.push({ type: 'vite-alias-unparsed', expression: el.getText(sf) });
    }
  };

  const visit = (node) => {
    if (ts.isPropertyAssignment(node) && literalPropertyName(node.name, ts) === 'alias') {
      if (ts.isObjectLiteralExpression(node.initializer)) parseAliasObject(node.initializer);
      else if (ts.isArrayLiteralExpression(node.initializer)) parseAliasArray(node.initializer);
      else diagnostics.push({ type: 'vite-alias-container-unparsed', expression: node.initializer.getText(sf) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { rules, diagnostics };
}

function parseTsconfigAliases({ root, ts, tsconfigPath }) {
  const rules = [];
  const diagnostics = [];
  if (!tsconfigPath || !fs.existsSync(tsconfigPath)) return { rules, diagnostics, baseUrl: null, baseUrlExplicit: false, moduleResolution: null };
  const read = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (read.error) {
    diagnostics.push({ type: 'tsconfig-read-error', message: ts.flattenDiagnosticMessageText(read.error.messageText, '\n') });
    return { rules, diagnostics, baseUrl: null, baseUrlExplicit: false, moduleResolution: null };
  }
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(tsconfigPath));
  for (const d of parsed.errors || []) diagnostics.push({ type: 'tsconfig-parse-error', message: ts.flattenDiagnosticMessageText(d.messageText, '\n') });
  const rawPaths = read.config?.compilerOptions?.paths || {};
  const baseUrlExplicit = Object.prototype.hasOwnProperty.call(read.config?.compilerOptions || {}, 'baseUrl');
  const baseUrl = parsed.options.baseUrl ? path.resolve(parsed.options.baseUrl) : path.dirname(tsconfigPath);
  for (const [key, values] of Object.entries(rawPaths)) {
    for (const value of Array.isArray(values) ? values : []) {
      rules.push({
        kind: 'tsconfig-paths',
        key,
        wildcard: key.includes('*'),
        replacementPattern: path.resolve(baseUrl, value),
        source: posix(path.relative(root, tsconfigPath)),
      });
    }
  }
  return { rules, diagnostics, baseUrl, baseUrlExplicit, moduleResolution: read.config?.compilerOptions?.moduleResolution || null };
}

function parsePackageImports({ root }) {
  const rules = [];
  const pkg = readJson(path.join(root, 'package.json'));
  const imports = pkg?.imports;
  if (!imports || typeof imports !== 'object') return rules;
  const localTarget = (value) => {
    if (typeof value === 'string') return value.startsWith('./') ? path.resolve(root, value) : null;
    if (value && typeof value === 'object') {
      for (const v of Object.values(value)) { const hit = localTarget(v); if (hit) return hit; }
    }
    return null;
  };
  for (const [key, value] of Object.entries(imports)) {
    const replacementPattern = localTarget(value);
    if (replacementPattern) rules.push({ kind: 'package-imports', key, wildcard: key.includes('*'), replacementPattern, source: 'package.json#imports' });
  }
  return rules;
}

function applyRule(specifier, rule) {
  if (rule.kind === 'vite') {
    const key = rule.key;
    if (specifier === key) return rule.replacement;
    if (specifier.startsWith(`${key}/`)) return path.join(rule.replacement, specifier.slice(key.length + 1));
    return null;
  }
  if (rule.wildcard) {
    const [prefix, suffix = ''] = rule.key.split('*');
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) return null;
    const capture = specifier.slice(prefix.length, specifier.length - suffix.length);
    return rule.replacementPattern.replace('*', capture);
  }
  return specifier === rule.key ? rule.replacementPattern : null;
}

function levenshtein(a, b) {
  const A = String(a).toLowerCase(), B = String(b).toLowerCase();
  if (A === B) return 0;
  if (!A.length) return B.length;
  if (!B.length) return A.length;
  const prev = Array.from({ length: B.length + 1 }, (_, i) => i);
  for (let i = 1; i <= A.length; i++) {
    let left = i, diag = i - 1;
    for (let j = 1; j <= B.length; j++) {
      const up = prev[j];
      const next = Math.min(up + 1, left + 1, diag + (A[i - 1] === B[j - 1] ? 0 : 1));
      prev[j] = next; diag = up; left = next;
    }
  }
  return prev[B.length];
}

function similarity(a, b) {
  const max = Math.max(String(a).length, String(b).length, 1);
  return 1 - levenshtein(a, b) / max;
}

function pathSuffixSimilarity(a, b) {
  const A = posix(a).toLowerCase().split('/').reverse();
  const B = posix(b).toLowerCase().split('/').reverse();
  let same = 0;
  for (let i = 0; i < Math.min(A.length, B.length); i++) {
    if (A[i] !== B[i]) break;
    same++;
  }
  return same / Math.max(A.length, B.length, 1);
}

function globToRegExp(glob, caseSensitive = true) {
  let out = '^';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') { i++; out += '(?:.*/)?'; }
        else out += '.*';
      } else out += '[^/]*';
    } else if (c === '?') out += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i + 1);
      if (end > i) {
        const choices = glob.slice(i + 1, end).split(',').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        out += `(?:${choices.join('|')})`; i = end;
      } else out += '\\{';
    } else out += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  out += '$';
  return new RegExp(out, caseSensitive ? '' : 'i');
}

function stripQueryHash(specifier) {
  const raw = String(specifier);
  const q = raw.indexOf('?');
  let out = q >= 0 ? raw.slice(0, q) : raw;
  if (!out.startsWith('#')) { const h = out.indexOf('#'); if (h >= 0) out = out.slice(0, h); }
  return out;
}

export function createRepositoryResolver({
  root,
  allFiles,
  ts,
  tsconfigPath = path.join(root, 'tsconfig.json'),
  viteConfigPath = path.join(root, 'vite.config.ts'),
  resolveExts = DEFAULT_RESOLVE_EXTS,
}) {
  const fileList = [...allFiles].map(posix).sort();
  const fileSet = new Set(fileList);
  const lowerIndex = new Map();
  for (const file of fileList) {
    const key = file.toLowerCase();
    const arr = lowerIndex.get(key) || []; arr.push(file); lowerIndex.set(key, arr);
  }
  const basenameIndex = new Map();
  for (const file of fileList) {
    const stem = path.posix.basename(file).replace(/\.(?:d\.)?[cm]?[jt]sx?$/i, '').toLowerCase();
    const arr = basenameIndex.get(stem) || []; arr.push(file); basenameIndex.set(stem, arr);
  }

  const tsconfig = parseTsconfigAliases({ root, ts, tsconfigPath });
  const vite = parseViteAliases({ root, ts, viteConfigPath });
  const packageRules = parsePackageImports({ root });
  const aliasRules = [...vite.rules, ...tsconfig.rules, ...packageRules];
  const configDiagnostics = [...tsconfig.diagnostics, ...vite.diagnostics];

  const toRepoPath = (abs) => posix(path.relative(root, abs));
  const candidatePaths = (absBase) => {
    const out = [];
    const clean = stripQueryHash(absBase);
    const ext = path.extname(clean).toLowerCase();
    const add = (p) => { if (!out.includes(p)) out.push(p); };
    add(clean);
    if (SOURCE_SUBSTITUTIONS.has(ext)) {
      const stem = clean.slice(0, -ext.length);
      for (const replacement of SOURCE_SUBSTITUTIONS.get(ext)) add(`${stem}${replacement}`);
    }
    if (!ext || !resolveExts.includes(ext)) for (const e of resolveExts) add(`${clean}${e}`);
    for (const e of resolveExts) add(path.join(clean, `index${e}`));
    return out;
  };

  const exactOrCase = (absBase, via, specifier) => {
    const ambiguous = [];
    for (const candidate of candidatePaths(absBase)) {
      const r = toRepoPath(candidate);
      if (r.startsWith('../') || path.isAbsolute(r)) continue;
      if (fileSet.has(r)) return { target: r, resolution: via, confidence: 1, authoritative: true, caseMismatch: false, specifier };
      const caseHits = lowerIndex.get(r.toLowerCase()) || [];
      if (caseHits.length === 1) return { target: caseHits[0], resolution: 'case-insensitive', via, confidence: 1, authoritative: true, caseMismatch: caseHits[0] !== r, requestedPath: r, specifier };
      if (caseHits.length > 1) ambiguous.push(...caseHits);
    }
    if (ambiguous.length) return { resolution: 'ambiguous-case', candidates: [...new Set(ambiguous)].sort(), authoritative: false, confidence: 0, specifier };
    return null;
  };

  const fuzzyFallback = (absBase, specifier) => {
    const desiredRel = toRepoPath(absBase);
    const desiredStem = path.posix.basename(desiredRel).replace(/\.(?:d\.)?[cm]?[jt]sx?$/i, '').toLowerCase();
    const pool = basenameIndex.get(desiredStem) || fileList.filter((file) => {
      const stem = path.posix.basename(file).replace(/\.(?:d\.)?[cm]?[jt]sx?$/i, '').toLowerCase();
      return similarity(desiredStem, stem) >= 0.88;
    });
    const scored = pool.map((file) => {
      const stem = path.posix.basename(file).replace(/\.(?:d\.)?[cm]?[jt]sx?$/i, '').toLowerCase();
      const basenameScore = similarity(desiredStem, stem);
      const suffixScore = pathSuffixSimilarity(path.posix.dirname(desiredRel), path.posix.dirname(file));
      return { file, confidence: clamp01(0.90 * basenameScore + 0.10 * suffixScore), basenameScore, suffixScore };
    }).sort((a, b) => b.confidence - a.confidence || a.file.localeCompare(b.file));
    if (!scored.length) return null;
    const best = scored[0], second = scored[1];
    if (best.basenameScore < 0.88 || best.confidence < 0.86 || (second && best.confidence - second.confidence < 0.06)) {
      return { resolution: 'fuzzy-ambiguous', candidates: scored.slice(0, 5), authoritative: false, confidence: best.confidence, specifier };
    }
    return { target: best.file, resolution: 'fuzzy-probable', confidence: best.confidence, authoritative: false, probable: true, candidates: scored.slice(0, 5), specifier };
  };

  const resolveSpecifier = ({ importer, specifier, kind = 'runtime-import', allowFuzzy = true }) => {
    const raw = String(specifier || '');
    const cleanSpecifier = stripQueryHash(raw);
    if (!cleanSpecifier) return { resolution: 'unresolved', reason: 'empty-specifier', authoritative: false, confidence: 0, specifier: raw };

    const filesystemAbsolute = path.isAbsolute(cleanSpecifier) || /^[A-Za-z]:[\\/]/.test(cleanSpecifier);
    if (filesystemAbsolute && ['require','dynamic-import','process-exec'].includes(kind)) {
      const abs = path.resolve(cleanSpecifier);
      const repoRel = toRepoPath(abs);
      if (!repoRel.startsWith('../') && !path.isAbsolute(repoRel)) {
        const hit = exactOrCase(abs, 'absolute-repository-path', raw);
        if (hit) return hit;
      }
      return { resolution: 'external-absolute-runtime', package: '<absolute-runtime>', authoritative: false, confidence: 1, specifier: raw, portabilityRisk: true };
    }

    if (cleanSpecifier.startsWith('/src/')) {
      const hit = exactOrCase(path.join(root, cleanSpecifier.slice(1)), 'root-src', raw);
      return hit || (allowFuzzy ? fuzzyFallback(path.join(root, cleanSpecifier.slice(1)), raw) : null) || { resolution: 'unresolved-internal', reason: 'root-src-not-found', authoritative: false, confidence: 0, specifier: raw };
    }
    if (cleanSpecifier.startsWith('/')) {
      const publicAbs = path.join(root, 'public', cleanSpecifier.slice(1));
      const rootAbs = path.join(root, cleanSpecifier.slice(1));
      const hit = exactOrCase(publicAbs, 'public-root', raw) || exactOrCase(rootAbs, 'repo-root', raw);
      return hit || { resolution: 'unresolved-absolute-resource', reason: 'root-resource-not-found', authoritative: false, confidence: 0, specifier: raw };
    }
    if (cleanSpecifier.startsWith('.')) {
      const absBase = path.resolve(root, path.posix.dirname(importer), cleanSpecifier);
      const hit = exactOrCase(absBase, 'relative', raw);
      return hit || (allowFuzzy ? fuzzyFallback(absBase, raw) : null) || { resolution: 'unresolved-internal', reason: 'relative-not-found', authoritative: false, confidence: 0, specifier: raw };
    }

    const matchedAliases = aliasRules
      .map((rule, order) => ({ rule, order, mapped: applyRule(cleanSpecifier, rule) }))
      .filter((x) => x.mapped)
      .sort((a, b) => {
        const exactA = a.rule.wildcard ? 0 : 1, exactB = b.rule.wildcard ? 0 : 1;
        if (exactA !== exactB) return exactB - exactA;
        const staticA = a.rule.key.replace('*','').length, staticB = b.rule.key.replace('*','').length;
        if (staticA !== staticB) return staticB - staticA;
        return a.order - b.order;
      });
    for (const { rule, mapped } of matchedAliases) {
      const hit = exactOrCase(mapped, rule.kind, raw);
      if (hit) return { ...hit, aliasRule: { kind: rule.kind, key: rule.key, source: rule.source } };
    }
    if (allowFuzzy && matchedAliases.length) {
      const probable = matchedAliases.map(({ rule, mapped }) => ({ rule, result: fuzzyFallback(mapped, raw) })).filter((x) => x.result?.target).sort((a,b)=>(b.result.confidence||0)-(a.result.confidence||0));
      const best = probable[0];
      if (best) return { ...best.result, aliasRule: { kind: best.rule.kind, key: best.rule.key, source: best.rule.source } };
    }
    if (matchedAliases.length) {
      return { resolution: 'unresolved-alias', reason: 'all-matching-alias-targets-not-found', aliasRules: matchedAliases.map(({rule})=>({kind:rule.kind,key:rule.key,source:rule.source})), authoritative: false, confidence: 0, specifier: raw };
    }

    // TypeScript baseUrl has precedence over node_modules when explicitly configured.
    if (tsconfig.baseUrl && tsconfig.baseUrlExplicit) {
      const hit = exactOrCase(path.resolve(tsconfig.baseUrl, cleanSpecifier), 'tsconfig-baseUrl', raw);
      if (hit) return hit;
    }
    return { resolution: 'external', package: cleanSpecifier.startsWith('@') ? cleanSpecifier.split('/').slice(0, 2).join('/') : cleanSpecifier.split('/')[0], authoritative: false, confidence: 1, specifier: raw };
  };

  const resolveGlobPatternToRepoPattern = ({ importer, pattern, base = null }) => {
    const negative = pattern.startsWith('!');
    const raw = negative ? pattern.slice(1) : pattern;
    let absPattern = null;
    if (base) {
      if (base.startsWith('.') || base.startsWith('/')) {
        const baseAbs = base.startsWith('/') ? path.join(root, base.slice(1)) : path.resolve(root, path.posix.dirname(importer), base);
        absPattern = path.resolve(baseAbs, raw);
      } else return { negative, error: 'vite-glob-base-must-be-relative-or-root-absolute' };
    } else if (raw.startsWith('.')) absPattern = path.resolve(root, path.posix.dirname(importer), raw);
    else if (raw.startsWith('/')) absPattern = path.join(root, raw.slice(1));
    else {
      for (const rule of aliasRules) {
        const mapped = applyRule(raw, rule);
        if (mapped) { absPattern = mapped; break; }
      }
      if (!absPattern) return { negative, error: 'vite-glob-unrecognized-alias-or-bare-pattern' };
    }
    const repoPattern = toRepoPath(absPattern);
    if (repoPattern.startsWith('../')) return { negative, error: 'vite-glob-outside-repository' };
    return { negative, repoPattern: posix(repoPattern) };
  };

  const expandGlob = ({ importer, patterns, base = null, caseSensitive = true }) => {
    const positives = [], negatives = [], diagnostics = [];
    for (const pattern of patterns) {
      const resolved = resolveGlobPatternToRepoPattern({ importer, pattern, base });
      if (resolved.error) { diagnostics.push({ pattern, reason: resolved.error }); continue; }
      const rx = globToRegExp(resolved.repoPattern, caseSensitive);
      (resolved.negative ? negatives : positives).push({ pattern, rx, repoPattern: resolved.repoPattern });
    }
    const matched = new Set();
    for (const file of fileList) if (positives.some((p) => p.rx.test(file))) matched.add(file);
    for (const file of [...matched]) if (negatives.some((p) => p.rx.test(file))) matched.delete(file);
    return { matches: [...matched].sort(), diagnostics, patterns: [...positives, ...negatives].map(({ rx, ...p }) => p) };
  };

  const summary = {
    tsconfig: posix(path.relative(root, tsconfigPath)),
    moduleResolution: tsconfig.moduleResolution,
    baseUrl: tsconfig.baseUrlExplicit && tsconfig.baseUrl ? (posix(path.relative(root, tsconfig.baseUrl)) || '.') : null,
    pathsBase: tsconfig.baseUrl ? (posix(path.relative(root, tsconfig.baseUrl)) || '.') : null,
    aliases: aliasRules.map((r) => ({ kind: r.kind, key: r.key, target: posix(path.relative(root, r.replacement || r.replacementPattern)) || '.', source: r.source })),
    configDiagnostics,
    caseInsensitiveFallback: true,
    fuzzyFallback: { enabled: true, authoritative: false, policy: 'probable-only; never a hard liveness proof' },
    viteGlobSupport: true,
    dynamicImportPatternSupport: true,
  };

  return { resolveSpecifier, expandGlob, summary, fileList, fileSet };
}

function lineOf(sf, node) { return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1; }
function isImportMeta(node, ts) {
  return ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword && node.name.text === 'meta';
}
function isImportMetaGlobCall(node, ts) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false;
  const pa = node.expression;
  return pa.name.text === 'glob' && isImportMeta(pa.expression, ts);
}
function parseGlobArgs(node, ts) {
  const first = node.arguments[0];
  const patterns = [];
  if (ts.isStringLiteralLike(first)) patterns.push(first.text);
  else if (ts.isArrayLiteralExpression(first) && first.elements.every((e) => ts.isStringLiteralLike(e))) patterns.push(...first.elements.map((e) => e.text));
  else return { error: 'import.meta.glob arguments must be string literals or a literal array' };
  let base = null, caseSensitive = true;
  const opts = node.arguments[1];
  if (opts && ts.isObjectLiteralExpression(opts)) {
    for (const prop of opts.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const name = literalPropertyName(prop.name, ts);
      if (name === 'base' && ts.isStringLiteralLike(prop.initializer)) base = prop.initializer.text;
      if (name === 'caseSensitive' && (prop.initializer.kind === ts.SyntaxKind.TrueKeyword || prop.initializer.kind === ts.SyntaxKind.FalseKeyword)) caseSensitive = prop.initializer.kind === ts.SyntaxKind.TrueKeyword;
    }
  }
  return { patterns, base, caseSensitive };
}

function templateToGlob(node, ts) {
  if (!ts.isTemplateExpression(node)) return null;
  let pattern = node.head.text;
  for (const span of node.templateSpans) pattern += `*${span.literal.text}`;
  return pattern;
}

function bindingNames(node, ts, out = []) {
  if (!node) return out;
  if (ts.isIdentifier(node)) out.push(node.text);
  else if (ts.isObjectBindingPattern(node) || ts.isArrayBindingPattern(node)) {
    for (const el of node.elements) if (ts.isBindingElement(el)) bindingNames(el.name, ts, out);
  }
  return out;
}

function hasModifier(node, kind) {
  return Boolean(node.modifiers?.some((m) => m.kind === kind));
}

function collectModuleSyntax(sf, ts, source) {
  const declarations = [];
  const moduleExports = [];
  const exportSeen = new Set();
  const addExport = (entry) => {
    const key = `${entry.name}:${entry.line}:${entry.localName || ''}:${entry.kind}`;
    if (!exportSeen.has(key)) { exportSeen.add(key); moduleExports.push(entry); }
  };
  const addDecl = (name, kind, node, exported = false, isDefault = false) => {
    if (!name) return;
    declarations.push({ name, kind, exported, isDefault, lineStart: lineOf(sf, node), lineEnd: sf.getLineAndCharacterOfPosition(node.end).line + 1 });
    if (exported) addExport({ name: isDefault ? 'default' : name, localName: name, kind, typeOnly: kind === 'interface' || kind === 'type', line: lineOf(sf, node) });
  };

  for (const stmt of sf.statements) {
    const exported = hasModifier(stmt, ts.SyntaxKind.ExportKeyword);
    const isDefault = hasModifier(stmt, ts.SyntaxKind.DefaultKeyword);
    if (ts.isFunctionDeclaration(stmt)) addDecl(stmt.name?.text || (isDefault ? '<anonymous-default>' : null), 'function', stmt, exported || isDefault, isDefault);
    else if (ts.isClassDeclaration(stmt)) addDecl(stmt.name?.text || (isDefault ? '<anonymous-default>' : null), 'class', stmt, exported || isDefault, isDefault);
    else if (ts.isInterfaceDeclaration(stmt)) addDecl(stmt.name.text, 'interface', stmt, exported, false);
    else if (ts.isTypeAliasDeclaration(stmt)) addDecl(stmt.name.text, 'type', stmt, exported, false);
    else if (ts.isEnumDeclaration(stmt)) addDecl(stmt.name.text, 'enum', stmt, exported, false);
    else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        for (const name of bindingNames(decl.name, ts)) addDecl(name, 'value', decl, exported, false);
      }
    } else if (ts.isExportAssignment(stmt)) {
      addExport({ name: 'default', localName: null, kind: 'default-expression', typeOnly: false, line: lineOf(sf, stmt) });
    } else if (ts.isExportDeclaration(stmt) && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      for (const el of stmt.exportClause.elements) {
        addExport({ name: el.name.text, localName: el.propertyName?.text || el.name.text, kind: stmt.moduleSpecifier ? 're-export-source' : 're-export-local', typeOnly: Boolean(stmt.isTypeOnly || el.isTypeOnly), line: lineOf(sf, el) });
      }
    }
  }

  const parseDiagnosticCount = sf.parseDiagnostics?.length || 0;
  return {
    loc: source.length ? source.split(/\r?\n/).length : 0,
    parseError: parseDiagnosticCount > 0,
    parseDiagnosticCount,
    declarations,
    exports: moduleExports,
  };
}

function importClauseNames(clause, ts) {
  if (!clause) return [];
  const names = [];
  if (clause.name) names.push('default');
  const bindings = clause.namedBindings;
  if (bindings && ts.isNamespaceImport(bindings)) names.push('*');
  if (bindings && ts.isNamedImports(bindings)) {
    for (const el of bindings.elements) names.push(el.propertyName?.text || el.name.text);
  }
  return [...new Set(names)];
}

function exportSourceNames(node, ts) {
  if (!node.exportClause) return ['*'];
  if (ts.isNamespaceExport(node.exportClause)) return ['*'];
  if (ts.isNamedExports(node.exportClause)) return [...new Set(node.exportClause.elements.map((el) => el.propertyName?.text || el.name.text))];
  return ['*'];
}

export function parseFileDependencies({ absPath, file, resolver, ts, allFiles }) {
  const internal = [], probableInternal = [], external = [], unresolved = [], diagnostics = [];
  const seen = new Set();
  let syntax = { loc: 0, parseError: false, parseDiagnosticCount: 0, declarations: [], exports: [] };
  const addResolution = ({ specifier, kind, line, allowFuzzy = true, metadata = null, importedNames = [], isTypeOnly = false }) => {
    const names = [...new Set(importedNames || [])];
    const key = `${kind}:${specifier}:${line}:${metadata?.pattern || ''}:${names.join(',')}`;
    if (seen.has(key)) return;
    seen.add(key);
    const result = resolver.resolveSpecifier({ importer: file, specifier, kind, allowFuzzy });
    const edgeMeta = { importedNames: names, isTypeOnly: Boolean(isTypeOnly) };
    if (result.target && result.authoritative) internal.push({ target: result.target, specifier, kind, line, resolution: result.resolution, confidence: result.confidence, caseMismatch: Boolean(result.caseMismatch), requestedPath: result.requestedPath || null, metadata, ...edgeMeta });
    else if (result.target && result.probable) probableInternal.push({ target: result.target, specifier, kind, line, resolution: result.resolution, confidence: result.confidence, candidates: result.candidates || [], metadata, ...edgeMeta });
    else if (result.resolution === 'external' || result.resolution === 'external-absolute-runtime') external.push({ package: result.package, specifier, kind, line, resolution: result.resolution, portabilityRisk: Boolean(result.portabilityRisk), ...edgeMeta });
    else unresolved.push({ specifier, kind, line, resolution: result.resolution, reason: result.reason || null, candidates: result.candidates || [], metadata, ...edgeMeta });
  };

  const ext = path.extname(file).toLowerCase();
  if (ext === '.html') {
    const text = fs.readFileSync(absPath, 'utf8');
    syntax = { ...syntax, loc: text.length ? text.split(/\r?\n/).length : 0 };
    for (const match of text.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
      const line = text.slice(0, match.index).split(/\r?\n/).length;
      addResolution({ specifier: match[1], kind: 'html-resource', line, allowFuzzy: false });
    }
    return { internal, probableInternal, external, unresolved, diagnostics, syntax };
  }
  if (ext === '.css') {
    const text = fs.readFileSync(absPath, 'utf8');
    syntax = { ...syntax, loc: text.length ? text.split(/\r?\n/).length : 0 };
    for (const match of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
      const line = text.slice(0, match.index).split(/\r?\n/).length;
      addResolution({ specifier: match[1], kind: 'css-resource', line, allowFuzzy: false });
    }
    return { internal, probableInternal, external, unresolved, diagnostics, syntax };
  }
  if (!/\.(?:[cm]?[jt]sx?)$/i.test(file)) return { internal, probableInternal, external, unresolved, diagnostics, syntax };

  let source;
  try { source = fs.readFileSync(absPath, 'utf8'); } catch { return { internal, probableInternal, external, unresolved, diagnostics, syntax }; }
  const sf = ts.createSourceFile(absPath, source, ts.ScriptTarget.Latest, true);
  syntax = collectModuleSyntax(sf, ts, source);
  for (const d of sf.parseDiagnostics || []) diagnostics.push({ type: 'parse-error', line: sf.getLineAndCharacterOfPosition(d.start || 0).line + 1, message: ts.flattenDiagnosticMessageText(d.messageText, '\n') });
  const execNames = new Set(['spawn', 'spawnSync', 'execFile', 'execFileSync', 'fork']);

  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const allNamedTypeOnly = Boolean(clause && !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.length && clause.namedBindings.elements.every((e) => e.isTypeOnly));
      const typeOnly = Boolean(clause?.isTypeOnly || allNamedTypeOnly);
      addResolution({ specifier: node.moduleSpecifier.text, kind: typeOnly ? 'type-import' : 'runtime-import', line: lineOf(sf, node), importedNames: importClauseNames(clause, ts), isTypeOnly: typeOnly });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      addResolution({ specifier: node.moduleSpecifier.text, kind: node.isTypeOnly ? 'type-export' : 'runtime-export', line: lineOf(sf, node), importedNames: exportSourceNames(node, ts), isTypeOnly: Boolean(node.isTypeOnly) });
    } else if (isImportMetaGlobCall(node, ts)) {
      const parsed = parseGlobArgs(node, ts);
      if (parsed.error) unresolved.push({ specifier: node.arguments[0]?.getText(sf) || '<missing>', kind: 'vite-glob-unresolved', line: lineOf(sf, node), resolution: 'dynamic-unresolved', reason: parsed.error, candidates: [], importedNames: ['*'], isTypeOnly: false });
      else {
        const expanded = resolver.expandGlob({ importer: file, patterns: parsed.patterns, base: parsed.base, caseSensitive: parsed.caseSensitive });
        for (const target of expanded.matches) internal.push({ target, specifier: parsed.patterns.join(','), kind: 'vite-glob', line: lineOf(sf, node), resolution: 'vite-glob', confidence: 1, caseMismatch: false, metadata: { patterns: parsed.patterns, base: parsed.base, caseSensitive: parsed.caseSensitive }, importedNames: ['*'], isTypeOnly: false });
        for (const d of expanded.diagnostics) unresolved.push({ specifier: d.pattern, kind: 'vite-glob-unresolved', line: lineOf(sf, node), resolution: 'dynamic-unresolved', reason: d.reason, candidates: [], importedNames: ['*'], isTypeOnly: false });
      }
    } else if (ts.isCallExpression(node) && node.arguments.length >= 1) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = node.arguments[0];
        if (ts.isStringLiteralLike(arg)) addResolution({ specifier: arg.text, kind: 'dynamic-import', line: lineOf(sf, node), importedNames: ['*'] });
        else if (ts.isTemplateExpression(arg)) {
          const pattern = templateToGlob(arg, ts);
          const ownDirBareWildcard = Boolean(pattern && /^\.\/\*[^/]*\.[A-Za-z0-9]+$/.test(pattern));
          const viteCompatible = pattern && /^(\.\.?\/|#)/.test(pattern) && /\.[A-Za-z0-9]+$/.test(pattern) && !ownDirBareWildcard;
          if (viteCompatible) {
            const expanded = resolver.expandGlob({ importer: file, patterns: [pattern], caseSensitive: true });
            if (expanded.matches.length) {
              for (const target of expanded.matches) internal.push({ target, specifier: arg.getText(sf), kind: 'dynamic-import-pattern', line: lineOf(sf, node), resolution: 'vite-dynamic-template', confidence: 1, caseMismatch: false, metadata: { pattern }, importedNames: ['*'], isTypeOnly: false });
            } else unresolved.push({ specifier: arg.getText(sf), kind: 'dynamic-import-pattern', line: lineOf(sf, node), resolution: 'dynamic-unresolved', reason: 'vite-compatible-template-matched-no-files', candidates: [], metadata: { pattern }, importedNames: ['*'], isTypeOnly: false });
          } else unresolved.push({ specifier: arg.getText(sf), kind: 'dynamic-import-variable', line: lineOf(sf, node), resolution: 'dynamic-unresolved', reason: 'dynamic-import-expression-not-statically-enumerable', candidates: [], metadata: { pattern }, importedNames: ['*'], isTypeOnly: false });
        } else unresolved.push({ specifier: arg.getText(sf), kind: 'dynamic-import-variable', line: lineOf(sf, node), resolution: 'dynamic-unresolved', reason: 'dynamic-import-expression-not-statically-enumerable', candidates: [], importedNames: ['*'], isTypeOnly: false });
      } else if (node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        addResolution({ specifier: node.arguments[0].text, kind: 'require', line: lineOf(sf, node), importedNames: ['*'] });
      }
      const callee = ts.isIdentifier(node.expression) ? node.expression.text : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : '';
      if (execNames.has(callee)) {
        const collectStrings = (n) => {
          if (ts.isStringLiteralLike(n)) {
            const txt = n.text.replaceAll('\\', '/');
            if (allFiles.has(txt)) addResolution({ specifier: `./${path.posix.relative(path.posix.dirname(file), txt)}`, kind: 'process-exec', line: lineOf(sf, n), allowFuzzy: false });
          }
          ts.forEachChild(n, collectStrings);
        };
        for (const arg of node.arguments) collectStrings(arg);
      }
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      addResolution({ specifier: node.argument.literal.text, kind: 'type-import', line: lineOf(sf, node), importedNames: ['*'], isTypeOnly: true });
    }

    if (ts.isStringLiteralLike(node) && node.text.startsWith('/') && !node.text.startsWith('//')) {
      const clean = node.text.split(/[?#]/, 1)[0];
      const target = clean.startsWith('/src/') ? clean.slice(1) : `public/${clean.slice(1)}`;
      if (allFiles.has(target)) addResolution({ specifier: clean, kind: 'public-resource', line: lineOf(sf, node), allowFuzzy: false });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { internal, probableInternal, external, unresolved, diagnostics, syntax };
}

#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const minimumFiles = 125;
const minimumTests = 701;

function walk(directory) {
  if (!statSafe(directory)?.isDirectory()) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function statSafe(path) {
  try { return statSync(path); } catch { return null; }
}

function isTestCall(node) {
  return ts.isCallExpression(node)
    && ts.isIdentifier(node.expression)
    && (node.expression.text === 'it' || node.expression.text === 'test');
}

function countTests(source, fileName) {
  const scriptKind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);
  let literalTests = 0;
  let effectiveTests = 0;
  const unresolvedDynamicDefinitions = [];

  function visit(node) {
    if (isTestCall(node)) {
      literalTests += 1;
      let multiplier = 1;
      let current = node.parent;
      let nestedInsideTest = false;

      while (current) {
        if (isTestCall(current)) {
          nestedInsideTest = true;
          break;
        }
        if (ts.isForOfStatement(current)) {
          if (ts.isArrayLiteralExpression(current.expression)) {
            multiplier *= current.expression.elements.length;
          } else {
            const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
            unresolvedDynamicDefinitions.push({
              line: position.line + 1,
              kind: 'for-of-non-literal',
            });
          }
        } else if (
          ts.isForStatement(current)
          || ts.isForInStatement(current)
          || ts.isWhileStatement(current)
          || ts.isDoStatement(current)
        ) {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          unresolvedDynamicDefinitions.push({
            line: position.line + 1,
            kind: ts.SyntaxKind[current.kind],
          });
        }
        current = current.parent;
      }

      effectiveTests += nestedInsideTest ? 1 : multiplier;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return {
    literalTests,
    effectiveTests,
    expandedTests: effectiveTests - literalTests,
    unresolvedDynamicDefinitions,
  };
}

const files = [resolve(root, 'src/tests'), resolve(root, 'tests')]
  .flatMap(walk)
  .filter((file) => /\.(?:test|spec)\.(?:ts|tsx)$/.test(file))
  .sort();

const inventory = files.map((file) => {
  const source = readFileSync(file, 'utf8');
  const counts = countTests(source, file);
  return {
    file: relative(root, file).replaceAll('\\', '/'),
    tests: counts.effectiveTests,
    literalTests: counts.literalTests,
    expandedTests: counts.expandedTests,
    unresolvedDynamicDefinitions: counts.unresolvedDynamicDefinitions,
  };
});

const testCount = inventory.reduce((sum, item) => sum + item.tests, 0);
const literalTestCount = inventory.reduce((sum, item) => sum + item.literalTests, 0);
const expandedTestCount = inventory.reduce((sum, item) => sum + item.expandedTests, 0);
const unresolvedDynamicDefinitions = inventory.flatMap((item) =>
  item.unresolvedDynamicDefinitions.map((definition) => ({ file: item.file, ...definition })),
);

const result = {
  discoveredFiles: inventory.length,
  discoveredTests: testCount,
  literalTestCalls: literalTestCount,
  staticallyExpandedTests: expandedTestCount,
  unresolvedDynamicDefinitions,
  minimumFiles,
  minimumTests,
  inventory,
};
console.log(JSON.stringify(result, null, 2));
if (
  inventory.length < minimumFiles
  || testCount < minimumTests
  || unresolvedDynamicDefinitions.length > 0
) process.exit(1);

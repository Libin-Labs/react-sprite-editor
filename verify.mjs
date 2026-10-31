import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const work = resolve('.package-check');
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run verification through the verify:package npm script.');
const runNpm = (args, cwd = process.cwd()) =>
  execFileSync(process.execPath, [npm, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
assert.equal(pkg.license, 'MIT');
assert.equal(pkg.version, '0.1.0');
assert.deepEqual(pkg.peerDependencies, { react: '^18.2.0 || ^19.0.0' });
assert.equal(Object.keys(pkg.dependencies ?? {}).length, 0);
assert.deepEqual(pkg.publishConfig, { access: 'public', registry: 'https://registry.npmjs.org/' });
assert.equal(pkg.funding.url, 'https://www.paypal.me/LibinPrasanth');
assert.equal(pkg.author.name, 'Libin Prasanth');
mkdirSync(work);
try {
  const packed = JSON.parse(
    runNpm(['pack', '--ignore-scripts', '--json', '--pack-destination', work]),
  )[0];
  const version = (name) =>
    JSON.parse(readFileSync(resolve('node_modules', name, 'package.json'), 'utf8')).version;
  writeFileSync(
    resolve(work, 'package.json'),
    JSON.stringify({
      private: true,
      type: 'module',
      dependencies: {
        [pkg.name]: `file:./${packed.filename}`,
        react: version('react'),
        '@types/react': version('@types/react'),
      },
    }),
  );
  runNpm(['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], work);
  const types = ['src/engine.ts', 'src/index.tsx'].flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(/^export (?:interface|type) (\w+)/gm)].map(
      (match) => match[1],
    ),
  );
  const probe = `import * as api from "${pkg.name}";\nimport type { ${types.join(', ')} } from "${pkg.name}";\nexport const exports = api;\nexport type AllTypes = ${types.join(' | ')};\n`;
  writeFileSync(resolve(work, 'consumer.mts'), probe);
  writeFileSync(resolve(work, 'consumer.cts'), probe);
  writeFileSync(
    resolve(work, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        target: 'ES2020',
        lib: ['ES2020', 'DOM'],
        types: [],
        skipLibCheck: false,
      },
      include: ['consumer.mts', 'consumer.cts'],
    }),
  );
  execFileSync(
    process.execPath,
    [resolve('node_modules/typescript/bin/tsc'), '-p', resolve(work, 'tsconfig.json')],
    { stdio: 'pipe' },
  );
  writeFileSync(
    resolve(work, 'probe.mjs'),
    `
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import * as esm from "${pkg.name}";
const require = createRequire(import.meta.url);
const cjs = require("${pkg.name}");
assert.deepEqual(Object.keys(esm).sort(), Object.keys(cjs).sort());
const factory = Object.keys(esm).find(name => name.startsWith("create") && esm[name].length === 0);
const value = esm[factory]();
assert.deepEqual(value, cjs[factory]());
const validator = Object.keys(esm).find(name => name.startsWith("validate"));
assert.deepEqual(esm[validator](value), cjs[validator](value));
const serializer = Object.keys(esm).find(name => /To(Css|Svg)$/.test(name));
if (serializer) assert.equal(esm[serializer](value), cjs[serializer](value));
else {
  await assert.rejects(esm.spriteToPng(value), /browser/);
  await assert.rejects(cjs.spriteToPng(value), /browser/);
}
const readme = readFileSync(new URL("./node_modules/${pkg.name}/README.md", import.meta.url), "utf8");
for (const name of Object.keys(esm)) assert.ok(readme.includes(name), "Undocumented export: " + name);
assert.ok(readFileSync(require.resolve("${pkg.name}/styles.css"), "utf8").length);
console.log("Offline tarball ESM/CJS parity, CSS, README exports, strict .mts/.cts declarations passed");
`,
  );
  process.stdout.write(
    execFileSync(process.execPath, [resolve(work, 'probe.mjs')], { encoding: 'utf8' }),
  );
} finally {
  if (process.platform === 'win32') {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Remove-Item -LiteralPath $env:LP_PACKAGE_CHECK -Recurse -Force -ErrorAction Stop',
      ],
      { env: { ...process.env, LP_PACKAGE_CHECK: work }, stdio: 'pipe' },
    );
  } else {
    rmSync(work, { recursive: true, force: true });
  }
}

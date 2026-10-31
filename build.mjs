import { copyFileSync, writeFileSync } from 'node:fs';

writeFileSync('dist/cjs/package.json', '{"type":"commonjs"}\n');
copyFileSync('src/styles.css', 'dist/styles.css');

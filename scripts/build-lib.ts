import { $ } from 'bun';
import fs from 'node:fs';
import path from 'node:path';

// 打包可发布的 server 库：lib/server/app.js + d.ts（hono / @google/genai 保持 external，由使用方安装）
await $`bun build src/server/app.ts --target node --format esm --external hono --external @google/genai --outfile lib/server/app.js`;

await $`bunx tsc --declaration --emitDeclarationOnly --rootDir src/server --outDir lib/server --jsx react-jsx --esModuleInterop --allowSyntheticDefaultImports --skipLibCheck --strict --target ESNext --module ESNext --moduleResolution bundler --lib DOM,DOM.Iterable,ESNext src/server/app.ts`;

console.log('[build:lib] lib/server 构建完成');

// 打包可发布的 client 库：lib/client/index.js + d.ts + style.css
//（react / react-dom / lucide-react 保持 external，由使用方安装）
await $`bun build src/client-lib/index.ts --target browser --format esm --external react --external react-dom --external lucide-react --outfile lib/client/index.js`;

// client 引用了 server 类型：以 src 为公共根 emit，再把 d.ts 逐文件搬进 lib/client
await $`bunx tsc --declaration --emitDeclarationOnly --rootDir src --outDir lib --jsx react-jsx --esModuleInterop --allowSyntheticDefaultImports --skipLibCheck --strict --target ESNext --module ESNext --moduleResolution bundler --lib DOM,DOM.Iterable,ESNext src/client-lib/index.ts`;
for (const f of fs.readdirSync('lib/client-lib')) {
  fs.renameSync(path.join('lib/client-lib', f), path.join('lib/client', f));
}
fs.rmdirSync('lib/client-lib');

await $`bunx @tailwindcss/cli -i src/client-lib/client.css -o lib/client/style.css`;

console.log('[build:lib] lib/client 构建完成');

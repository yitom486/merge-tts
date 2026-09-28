import { $ } from 'bun';

// 打包可发布的 server 库：lib/server/app.js + d.ts（hono / @google/genai 保持 external，由使用方安装）
await $`bun build src/server/app.ts --target node --format esm --external hono --external @google/genai --outfile lib/server/app.js`;

await $`bunx tsc --declaration --emitDeclarationOnly --rootDir src/server --outDir lib/server --jsx react-jsx --esModuleInterop --allowSyntheticDefaultImports --skipLibCheck --strict --target ESNext --module ESNext --moduleResolution bundler --lib DOM,DOM.Iterable,ESNext src/server/app.ts`;

console.log('[build:lib] lib/server 构建完成');

# CONTEXT

## 同步规则

- `template/cover/AGENTS.md` 必须时刻保持与根目录 `AGENTS.md` 内容一致。
- 每次修改根目录 `AGENTS.md` 后，须将相同内容同步到 `template/cover/AGENTS.md`。

## Actions 引用规则

- **本仓库**引用自己的 composite action：一律用相对路径，例如 `uses: ./actions/purge-cdn`。
- **外仓库**引用本仓库 action：一律用绝对路径 + `@main`，例如 `uses: umfe/res/actions/purge-cdn@main`。
- 不要使用 `@v1` 等 tag 形式；本仓库不为 action 单独打版本 tag，外仓固定 pin `@main`。

## Actions 构建规则

- `actions/` 下每个 action 的源码是 `index.ts`，编译产物是同目录的 `index.js`。
- 改动任何 `actions/*/index.ts` 后，**必须**运行 `npm run build:actions` 重新编译，再一起提交源码和产物。
- 产物 `index.js` 提交进 git（action 运行时直接 `node index.js`，不依赖 tsx/tsc）。
- 编译配置：`tsconfig.actions.json`。

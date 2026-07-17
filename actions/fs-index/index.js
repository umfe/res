/**
 * actions/fs-index/index.ts
 *
 * 仓库目录索引生成脚本（零依赖，Node 原生 ESM）。
 * 本文件是 composite action `actions/fs-index` 的 TypeScript 源码。
 * 编译产物 `index.js` 由 `npm run build:actions` 生成并提交进 git。
 *
 * 作用：扫描整个仓库工作区，在仓库根写出 fs-index.json，供前端通过固定的
 *      @<branch>/fs-index.json CDN URL 一次性拿到整棵目录树，做目录浏览 / 搜索，
 *      而不受 data.jsdelivr 包体积 / 403 限制。
 *
 * 产物结构（两个字段，语义不同故顶层与节点内命名区分）：
 *   {
 *     "allFiles": ["AGENTS.md", "template/mit/LICENSE", ...],   // 全仓文件相对路径，/ 分隔，已排序
 *     "byDir": {                                                // key = 目录相对路径，"" 表示仓库根
 *       "": { "dirs": ["actions", "template"], "files": ["AGENTS.md"] },
 *       "template": { "dirs": ["mit"], "files": ["_.json"] },
 *       "template/mit": { "dirs": [], "files": ["LICENSE"] }
 *     }
 *   }
 *   - byDir[path].dirs / .files 只含「该层直接子项」的 basename（不是深路径）。
 *   - allFiles 用于全量搜索 / 递归；byDir 用于「打开某一层」O(1) 查表。
 *
 * 前端用法示例：
 *   const idx = await (await fetch('.../fs-index.json')).json()
 *   const { dirs, files } = idx.byDir[path] ?? { dirs: [], files: [] }
 *
 * 用法：
 *   优先通过 composite action 调用：
 *     uses: ./actions/fs-index                 # 本仓库
 *     # 或 uses: umfe/res/actions/fs-index@main
 *   也可直接跑编译产物：
 *     node actions/fs-index/index.js
 *
 * 扫描根（按优先级）：
 *   ROOT = FS_INDEX_ROOT > GITHUB_WORKSPACE（Actions 内置）> process.cwd()
 *
 * 稳定性契约（重要）：
 *   所有目录名、文件名、byDir 的 key 一律排序；JSON 用固定 2 空格缩进 + 末尾换行。
 *   相同工作区内容必产出逐字节相同的文件，避免无意义的 auto-commit / purge。
 *   为此，输出文件 fs-index.json 自身**始终不纳入索引**：否则「首跑文件不存在 →
 *   写出后再跑把自己算进去」会让产物依赖磁盘旧状态，每次 push 都无谓 diff。
 *
 * 职责边界：
 *   本 action 只写文件到工作区，不做 checkout / commit / push。
 *   由调用方统一 auto-commit（连同 template/_.json 一次提交），再由 purge-cdn 刷缓存。
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
// ── 配置 ──────────────────────────────────────────────
/** 扫描根目录：优先显式环境变量，其次 Actions 内置 workspace，最后当前工作目录 */
const ROOT = process.env.FS_INDEX_ROOT || process.env.GITHUB_WORKSPACE || process.cwd();
/** 输出文件名（根层扫描时始终排除自身，保证产物不依赖磁盘上是否已有旧索引） */
const OUTPUT_NAME = 'fs-index.json';
/** 输出文件（仓库根 fs-index.json） */
const OUTPUT_FILE = path.join(ROOT, OUTPUT_NAME);
/**
 * 固定忽略的目录名（按 basename 匹配，任意层级）。
 * 只忽略与「仓库内容浏览」无关的基础设施目录；其余一律纳入（全仓索引）。
 */
const IGNORED_DIRS = new Set(['.git', 'node_modules', '.venv']);
// ── 核心 ──────────────────────────────────────────────
/**
 * 递归扫描目录，填充 allFiles 与 byDir。
 * @param absDir   当前目录绝对路径
 * @param relDir   当前目录相对 ROOT 的路径（/ 分隔，根为 ""）
 * @param allFiles 全量文件收集器（相对 ROOT 路径）
 * @param byDir    目录 → 一层内容 收集器
 */
async function scan(absDir, relDir, allFiles, byDir) {
    const entries = await fs.readdir(absDir, { withFileTypes: true });
    const dirs = [];
    const files = [];
    for (const entry of entries) {
        if (entry.isDirectory()) {
            // 跳过固定忽略目录（任意层级按名匹配）
            if (IGNORED_DIRS.has(entry.name)) {
                continue;
            }
            dirs.push(entry.name);
        }
        else if (entry.isFile()) {
            // 输出文件自身（仓库根 fs-index.json）始终不纳入索引，保证产物与
            // 磁盘上是否已存在旧索引无关，从而逐字节可复现、不产生无谓 diff。
            if (relDir === '' && entry.name === OUTPUT_NAME) {
                continue;
            }
            files.push(entry.name);
        }
        // 符号链接等其它类型忽略：仓库内容里不应出现
    }
    // 该层排序，保证输出稳定
    dirs.sort();
    files.sort();
    byDir[relDir] = { dirs, files };
    // 收集全量文件路径（相对 ROOT，/ 分隔）
    for (const name of files) {
        allFiles.push(relDir ? `${relDir}/${name}` : name);
    }
    // 递归子目录（已排序，深度优先，输出仍由最终统一排序保证稳定）
    for (const name of dirs) {
        const childAbs = path.join(absDir, name);
        const childRel = relDir ? `${relDir}/${name}` : name;
        await scan(childAbs, childRel, allFiles, byDir);
    }
}
/**
 * 构建整棵索引。根层扫描始终排除输出文件自身（fs-index.json），
 * 因此产物只取决于其它工作区内容，与磁盘上是否已存在旧索引无关，逐字节可复现。
 */
async function buildIndex() {
    const allFiles = [];
    const byDir = {};
    await scan(ROOT, '', allFiles, byDir);
    // 确保 allFiles 全局有序（跨目录也稳定）
    allFiles.sort();
    // 确保 byDir 的 key 有序，重建对象保证 JSON key 顺序稳定、diff 友好
    const sortedByDir = {};
    for (const key of Object.keys(byDir).sort()) {
        sortedByDir[key] = byDir[key];
    }
    return { allFiles, byDir: sortedByDir };
}
/**
 * 主入口：生成索引并写入 fs-index.json。
 */
async function main() {
    console.log(`扫描仓库根：${ROOT}`);
    const index = await buildIndex();
    // 固定 2 空格缩进 + 末尾换行；内容仅取决于工作区，保证可复现、避免无意义 push。
    const json = JSON.stringify(index, null, 2) + '\n';
    await fs.writeFile(OUTPUT_FILE, json, 'utf8');
    const dirCount = Object.keys(index.byDir).length;
    console.log(`生成完成：${index.allFiles.length} 个文件、${dirCount} 个目录 → ${OUTPUT_NAME}`);
}
main().catch((err) => {
    console.error('生成 fs-index 失败：', err);
    process.exit(1);
});

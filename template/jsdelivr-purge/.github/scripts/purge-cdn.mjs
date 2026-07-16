/**
 * purge-cdn.mjs
 *
 * 通用 jsDelivr 精准缓存刷新脚本（零依赖，Node 原生 ESM）。
 *
 * 作用：push 后精确 purge 本次改动文件在 jsDelivr 上的缓存，让写死的
 *      @<branch> URL 能准实时拿到最新内容，而不用等分支缓存 12h 自动过期。
 *
 * 设计目标：把本文件连同同目录的 workflow 一起塞进任意仓库的 .github/ 下，
 *          无需安装任何依赖、无需改代码即可开箱即用。
 *
 * 用法（由 workflow 调用）：
 *   node .github/scripts/purge-cdn.mjs <before_sha> <after_sha>
 *
 * 参数：
 *   before_sha  push 前的 commit SHA（首次 push 或 force push 丢失时传 "null"）
 *   after_sha   push 后的 commit SHA
 *
 * 仓库与分支的确定（按优先级）：
 *   REPO   = PURGE_REPO   > GITHUB_REPOSITORY（Actions 内置，形如 owner/repo）
 *   BRANCH = PURGE_BRANCH > GITHUB_REF_NAME（Actions 内置，当前分支名）> "main"
 *   —— 在 GitHub Actions 里天然零配置；本地/其它 CI 可用 PURGE_* 覆盖。
 *
 * 行为：
 *   1. 用 git diff 拿到本次 push 新增/修改/重命名的文件列表。
 *   2. 拼成 jsDelivr 路径，分批 POST 到 purge API。
 *   3. 单批失败只告警不中断（分支缓存 12h 自动过期兜底）。
 *
 * 边界处理：
 *   - 首次 push（before 全 0）→ 用 git 空树 hash 做 diff 基准，等于刷全部文件。
 *   - before commit 不可达（如 force push 覆盖了旧历史）→ 自动降级为刷全部文件。
 *   - 改动文件为 0 → 跳过，正常退出。
 */

import { execSync } from 'node:child_process'

// ── 配置：优先显式环境变量，其次 GitHub Actions 内置变量 ──
/** 仓库全名，形如 owner/repo */
const REPO = process.env.PURGE_REPO || process.env.GITHUB_REPOSITORY || ''
/** 分支名，jsDelivr URL 里 @<branch> 的部分 */
const BRANCH = process.env.PURGE_BRANCH || process.env.GITHUB_REF_NAME || 'main'
const PURGE_API = 'https://purge.jsdelivr.net/'
/** 每批 purge 的文件数上限 */
const BATCH_SIZE = 20
/** git 空树 hash，用于首次 push 等场景 */
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

// ── 入口 ──────────────────────────────────────────────

if (!REPO) {
	console.error(
		'无法确定仓库名：请在 GitHub Actions 中运行，或设置 PURGE_REPO 环境变量（owner/repo）。',
	)
	process.exit(1)
}

const [beforeRaw, afterSha] = process.argv.slice(2)
if (!afterSha) {
	console.error('用法: node .github/scripts/purge-cdn.mjs <before_sha> <after_sha>')
	process.exit(1)
}

console.log(`目标仓库: ${REPO}@${BRANCH}`)

const files = getChangedFiles(beforeRaw, afterSha)

if (files.length === 0) {
	console.log('没有需要 purge 的文件，跳过。')
	process.exit(0)
}

console.log(`本次改动 ${files.length} 个文件，开始 purge：`)
for (const f of files) console.log(`  ${f}`)

await purgeAll(files)
console.log('purge 完成。')

// ── 核心函数 ───────────────────────────────────────────

/**
 * 拿到本次 push 改动（新增/修改/重命名）的文件列表。
 * @param {string} before push 前 SHA（可能为 "null" / 全 0）
 * @param {string} after  push 后 SHA
 * @returns {string[]}
 */
function getChangedFiles(before, after) {
	const isNull =
		!before || before === 'null' || before === '0000000000000000000000000000000000000000'

	let base = isNull ? EMPTY_TREE : before

	// 兜底：before commit 不可达时（如 force push 覆盖了旧历史）预检一下，降级刷全部
	if (!isNull && !commitExists(base)) {
		console.warn(
			`⚠️ before commit ${base} 不可达（可能是 force push 覆盖了旧历史），降级为刷全部文件。`,
		)
		base = EMPTY_TREE
	}

	const output = execSync(`git diff --name-only --diff-filter=ACMR ${base} ${after}`, {
		encoding: 'utf-8',
	})

	return output
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean)
}

/**
 * 检查某个 git 对象是否存在于当前仓库。
 * @param {string} sha
 * @returns {boolean}
 */
function commitExists(sha) {
	try {
		execSync(`git cat-file -t ${sha}`, { stdio: 'pipe' })
		return true
	} catch {
		return false
	}
}

/**
 * 分批 purge 所有文件。
 * @param {string[]} files
 * @returns {Promise<void>}
 */
async function purgeAll(files) {
	for (let i = 0; i < files.length; i += BATCH_SIZE) {
		const batch = files.slice(i, i + BATCH_SIZE)
		const batchIndex = Math.floor(i / BATCH_SIZE) + 1

		const paths = batch.map((f) => `/gh/${REPO}@${BRANCH}/${f}`)
		const payload = JSON.stringify({ path: paths })

		console.log(`提交第 ${batchIndex} 批（${batch.length} 个文件）...`)

		try {
			const resp = await fetch(PURGE_API, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: payload,
			})

			const body = await resp.text()
			console.log(`响应状态: ${resp.status}`)
			console.log(body)

			if (!resp.ok) {
				// 输出 GitHub Actions 格式的警告标注
				console.log(
					`::warning::第 ${batchIndex} 批 purge 返回 ${resp.status}，可能被限流，12h 内分支缓存也会自动过期。`,
				)
			}
		} catch (err) {
			console.log(
				`::warning::第 ${batchIndex} 批 purge 网络错误: ${err instanceof Error ? err.message : err}`,
			)
		}
	}
}

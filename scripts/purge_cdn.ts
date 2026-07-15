/**
 * purge_cdn.ts
 *
 * GitHub Actions 专用：push 到 main 后，精确 purge 本次改动文件在 jsDelivr 的缓存。
 *
 * 用法（由 workflow 调用）：
 *   npx tsx scripts/purge_cdn.ts <before_sha> <after_sha>
 *
 * 参数：
 *   before_sha  push 前的 commit SHA（首次 push 或 force push 丢失时传 "null"）
 *   after_sha   push 后的 commit SHA
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

const REPO = 'umfe/res'
const BRANCH = 'main'
const PURGE_API = 'https://purge.jsdelivr.net/'
/** 每批 purge 的文件数上限 */
const BATCH_SIZE = 20
/** git 空树 hash，用于首次 push 等场景 */
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

// ── 入口 ──────────────────────────────────────────────

const [beforeRaw, afterSha] = process.argv.slice(2)
if (!afterSha) {
	console.error('用法: npx tsx scripts/purge_cdn.ts <before_sha> <after_sha>')
	process.exit(1)
}

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

/** 拿到本次 push 改动（新增/修改/重命名）的文件列表 */
function getChangedFiles(before: string, after: string): string[] {
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

/** 检查某个 git 对象是否存在于当前仓库 */
function commitExists(sha: string): boolean {
	try {
		execSync(`git cat-file -t ${sha}`, { stdio: 'pipe' })
		return true
	} catch {
		return false
	}
}

/** 分批 purge 所有文件 */
async function purgeAll(files: string[]): Promise<void> {
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

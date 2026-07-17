/**
 * actions/purge-cdn/index.ts
 *
 * 通用 jsDelivr 精准缓存刷新脚本（零依赖，Node 原生 ESM）。
 * 本文件是 composite action `actions/purge-cdn` 的 TypeScript 源码。
 * 编译产物 `index.js` 由 `npm run build:actions` 生成并提交进 git。
 *
 * 作用：push 后精确 purge 本次改动文件在 jsDelivr 上的缓存，让写死的
 *      @<branch> URL 能准实时拿到最新内容，而不用等分支缓存 12h 自动过期。
 *
 * 用法：
 *   优先通过 composite action 调用（推荐，before/after 均可选）：
 *     uses: ./actions/purge-cdn          # 本仓库
 *     # 或 uses: umfe/res/actions/purge-cdn@main
 *     # 默认：before=github.event.before，after=当前 HEAD（含 auto-commit 后 tip）
 *
 *   也可直接跑编译产物（本地/其它 CI）：
 *     node actions/purge-cdn/index.js [before_sha] [after_sha]
 *     # before 省略/null/全0 → 空树；after 省略 → 当前 HEAD
 *
 * 参数（均可选）：
 *   before_sha  diff 起点。push 事件下一般为 github.event.before。
 *               空 / "null" / 全 0 / 对象不可达 → 空树，等于相对 after 全量 purge。
 *   after_sha   diff 终点。省略时用 git rev-parse HEAD（不是 github.sha）。
 *
 * 仓库与分支的确定（按优先级）：
 *   REPO   = PURGE_REPO   > GITHUB_REPOSITORY（Actions 内置，形如 owner/repo）
 *   BRANCH = PURGE_BRANCH > GITHUB_REF_NAME（Actions 内置，当前分支名）> "main"
 *   —— 在 GitHub Actions 里天然零配置；本地/其它 CI 可用 PURGE_* 覆盖。
 *
 * 顺序契约（重要）：
 *   GITHUB_TOKEN 自动 commit 不会再触发 workflow。若本 job 会生成并提交文件，
 *   必须在「commit 之后」调用本 action；after 默认已是当前 HEAD。
 *
 * 行为：
 *   1. 用 git diff 拿到 before..after 新增/修改/重命名的文件列表。
 *   2. 拼成 jsDelivr 路径，分批 POST 到 purge API。
 *   3. 单批失败只告警不中断（分支缓存 12h 自动过期兜底）。
 *
 * 边界处理：
 *   - 首次 push（before 全 0）→ 空树基准，≈ 全量 purge。
 *   - before 不可达（force push 等）→ 降级空树，≈ 全量 purge。
 *   - 非 push 触发且未显式传 before（event.before 为空）→ 同上，≈ 全量 purge。
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

// before 可省略；after 可省略（默认当前 HEAD，便于覆盖同 job 内刚 commit 的 tip）
const beforeRaw = process.argv[2] || 'null'
let afterSha = process.argv[3] || ''
if (!afterSha) {
	try {
		afterSha = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim()
	} catch {
		console.error(
			'用法: node actions/purge-cdn/index.js [before_sha] [after_sha]\n' +
				'未传入 after_sha，且无法在当前目录执行 git rev-parse HEAD。',
		)
		process.exit(1)
	}
}

console.log(`目标仓库: ${REPO}@${BRANCH}`)
console.log(`diff 区间: ${beforeRaw} .. ${afterSha}`)

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
 * 拿到 before..after 改动（新增/修改/重命名）的文件列表。
 */
function getChangedFiles(before: string, after: string): string[] {
	const isNull =
		!before || before === 'null' || before === '0000000000000000000000000000000000000000'

	let base = isNull ? EMPTY_TREE : before

	// 无可靠 before（非 push / 首次 push 全 0 / 未传）→ 空树，等于相对 after 全量
	if (isNull) {
		console.warn('⚠️ before 为空/null/全 0，使用空树作基准（相对 after 全量 purge）。')
	}

	// 兜底：before commit 不可达时（如 force push 覆盖了旧历史、浅克隆等），
	// 先尝试补全 git 历史，仍不可达则降级为空树全量 purge。
	if (!isNull && !commitExists(base)) {
		console.warn(`⚠️ before commit ${base} 不可达，尝试补全 git 历史...`)
		tryDeepen()
	}
	if (!isNull && !commitExists(base)) {
		console.warn(
			`⚠️ before commit ${base} 仍不可达（可能是 force push 覆盖了旧历史），降级为刷全部文件。`,
		)
		base = EMPTY_TREE
	}

	const output = execSync(`git diff --name-only --diff-filter=ACMR ${base} ${after}`, {
		encoding: 'utf-8',
	})

	return output
		.split('\n')
		.map((l: string) => l.trim())
		.filter(Boolean)
}

/**
 * 检查某个 git 对象是否存在于当前仓库。
 */
function commitExists(sha: string): boolean {
	try {
		execSync(`git cat-file -t ${sha}`, { stdio: 'pipe' })
		return true
	} catch {
		return false
	}
}

/**
 * 尝试补全 git 历史（调用方浅克隆时 before 可能不可达）。
 * 最佳实践是调用方 checkout 时 fetch-depth: 0；此处仅为兜底。
 */
function tryDeepen(): void {
	try {
		// 检查是否为浅克隆
		const isShallow = execSync('git rev-parse --is-shallow-repository', {
			encoding: 'utf-8',
		}).trim()
		if (isShallow === 'true') {
			console.log('检测到浅克隆，尝试 git fetch --unshallow ...')
			execSync('git fetch --unshallow', { stdio: 'inherit' })
		} else {
			console.log('非浅克隆，尝试 git fetch origin ...')
			execSync('git fetch --no-tags origin', { stdio: 'inherit' })
		}
	} catch {
		console.warn('⚠️ git fetch 补全历史失败，将降级为空树全量 purge。')
	}
}

/**
 * 分批 purge 所有文件。
 */
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

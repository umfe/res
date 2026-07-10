/**
 * gen_manifest.ts
 *
 * 模板清单生成脚本。
 *
 * 功能：扫描 template/ 目录下的所有“直接子文件夹”，把每个“非空文件夹”
 * 当作清单里的一个条目（item），条目名（key）即文件夹名（slug）。
 * 每个条目的 files 是该文件夹内所有文件的相对路径（相对于 template/{slug}），
 * 递归收集子目录里的文件，且包含隐藏文件/隐藏目录（如 .vscode/、.editorconfig）。
 * 结果写入 template/_.json。
 *
 * 约定说明：
 *   - 只有“文件夹”才可能成为条目；template/ 下的散落文件（如 _.json 本身）会被忽略。
 *   - “非空”指该文件夹递归下至少含一个文件；只有空子目录、没有任何文件的不计入。
 *   - files 路径统一用正斜杠 `/`，与 CDN URL 拼接保持一致（不受运行平台影响）。
 *   - 生成结果按 key、files 排序，保证每次输出稳定、diff 友好。
 *
 * 运行方式：
 *   npx tsx scripts/gen_manifest.ts
 * 也可用 npm 脚本：npm run genmanifest
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 当前脚本文件所在目录（scripts/），用于推导项目根目录
const __dirname = path.dirname(fileURLToPath(import.meta.url))
// 项目根目录（scripts/ 的上一级）
const ROOT_DIR = path.resolve(__dirname, '..')
// 模板根目录
const TEMPLATE_DIR = path.join(ROOT_DIR, 'template')
// 输出的清单文件路径（template/_.json）
const OUTPUT_FILE = path.join(TEMPLATE_DIR, '_.json')

/** 清单里单个 item 的结构 */
interface ManifestItem {
	files: string[]
}

/** _.json 的整体结构 */
interface Manifest {
	items: Record<string, ManifestItem>
}

/**
 * 递归收集某个目录下的所有文件相对路径。
 * @param dir 待扫描目录的绝对路径
 * @param baseDir 计算相对路径的基准目录（即条目根 template/{slug}）
 * @returns 相对 baseDir 的文件路径数组，统一使用正斜杠分隔
 */
async function collectFiles(dir: string, baseDir: string): Promise<string[]> {
	const result: string[] = []
	// withFileTypes 一次性拿到条目类型，避免对每个条目再 stat 一次
	const entries = await fs.readdir(dir, { withFileTypes: true })

	for (const entry of entries) {
		const abs = path.join(dir, entry.name)
		if (entry.isDirectory()) {
			// 子目录：递归收集（含隐藏目录）
			const nested = await collectFiles(abs, baseDir)
			result.push(...nested)
		} else if (entry.isFile()) {
			// 文件：计算相对 baseDir 的路径，并规整为正斜杠
			const rel = path.relative(baseDir, abs).split(path.sep).join('/')
			result.push(rel)
		}
		// 其它类型（符号链接等）忽略，模板资源里不应出现
	}

	return result
}

/**
 * 扫描 template/ 下所有直接子文件夹，生成清单。
 * @returns 规整后的 Manifest
 */
async function buildManifest(): Promise<Manifest> {
	const items: Record<string, ManifestItem> = {}

	// 读取 template/ 的直接子项
	const entries = await fs.readdir(TEMPLATE_DIR, { withFileTypes: true })

	for (const entry of entries) {
		// 只处理文件夹；散落文件（含 _.json 本身）跳过
		if (!entry.isDirectory()) {
			continue
		}

		const slug = entry.name
		const itemDir = path.join(TEMPLATE_DIR, slug)
		// 递归收集该条目下所有文件
		const files = await collectFiles(itemDir, itemDir)

		// 非空文件夹（至少含一个文件）才计入结果
		if (files.length === 0) {
			console.log(`[跳过] ${slug}/（空文件夹，无文件）`)
			continue
		}

		// 排序，保证输出稳定
		files.sort()
		items[slug] = { files }
		console.log(`[条目] ${slug}/（${files.length} 个文件）`)
	}

	// 按 key 排序后重建 items，保证输出稳定
	const sortedItems: Record<string, ManifestItem> = {}
	for (const key of Object.keys(items).sort()) {
		sortedItems[key] = items[key]
	}

	return { items: sortedItems }
}

/**
 * 主入口：生成清单并写入 template/_.json。
 */
async function main(): Promise<void> {
	console.log(`开始扫描模板目录：${TEMPLATE_DIR}`)
	const manifest = await buildManifest()

	// 末尾补一个换行，符合常见文本文件习惯
	const json = JSON.stringify(manifest, null, 2) + '\n'
	await fs.writeFile(OUTPUT_FILE, json, 'utf8')

	const count = Object.keys(manifest.items).length
	console.log(`\n生成完成：${count} 个条目 → ${OUTPUT_FILE}`)
}

// 启动，捕获顶层异常
main().catch((err) => {
	console.error('脚本执行失败：', err)
	process.exit(1)
})

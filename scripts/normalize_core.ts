/**
 * normalize_core.ts
 *
 * 图片规范化脚本（单文件，含核心逻辑 + 命令行入口）。
 *
 * 功能：扫描指定源目录下的所有图片（含动画格式，动画取第一帧），
 * 统一转换为 PNG 格式；对于近似正方形（宽高比 ≤ 1.1）的图片，
 * 缩放为 512×512（使用 nearest 最近邻插值，保留像素风格）；
 * 最终结果压缩到 200KB 以内。
 *
 * 原文件处理策略：
 *   - 非动画图片：原文件“移动”到备份目录（源目录里只留新 png）。
 *   - 动画图片（gif/动画webp/apng）：原文件“保留”在源目录，仅“复制”一份到
 *     备份目录；同名 png 不存在时才生成 png（首帧）。
 *
 * 运行方式（通过命令行参数指定处理哪个目录）：
 *   npx tsx scripts/normalize_core.ts x       → 处理 x/，备份到 trash/lastx/
 *   npx tsx scripts/normalize_core.ts pics    → 处理 pics/，备份到 trash/lastpics/
 * 也可用 npm 脚本：npm run normalizex / npm run normalizepics
 * 传入其他参数将报错并退出。
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp, { type Sharp } from 'sharp'

// ===== 处理参数常量 =====
// 目标边长：近似正方形的图片会被缩放到 512×512
const TARGET_SIZE = 512
// 宽高比阈值：max(w/h, h/w) ≤ 1.1 视为“近似正方形”，需要缩放
const ASPECT_RATIO_THRESHOLD = 1.1
// 结果文件大小上限：200KB（字节）
const MAX_SIZE = 200 * 1024
// 支持处理的图片后缀（含动画格式 gif/webp/apng，sharp 默认取第一帧）
// 覆盖 sharp 预编译版可靠读取的常见位图格式：
//   - 常规：png/jpg/jpeg/bmp/tiff/tif
//   - 动画：gif/webp/apng（取第一帧）
//   - 现代格式：avif、heic/heif（苹果照片常见）
// 说明：jxl 需自定义 libvips 编译、预编译版读不了；svg 为矢量图语义不同——均不纳入
const IMAGE_EXTS = new Set([
	'.png',
	'.jpg',
	'.jpeg',
	'.bmp',
	'.tiff',
	'.tif',
	'.gif',
	'.webp',
	'.apng',
	'.avif',
	'.heic',
	'.heif',
])

/**
 * 快照指定目录下的所有文件名列表。
 * 一次性读取，之后只处理这份快照——避免运行过程中新生成的 png 被二次处理。
 * @param dir 目标目录的绝对路径
 * @returns 文件名数组（不含路径，仅文件名）
 */
async function snapshotFiles(dir: string): Promise<string[]> {
	// 读取目录下所有条目（含文件与子目录）
	const entries = await fs.readdir(dir, { withFileTypes: true })
	// 仅保留普通文件，过滤掉子目录
	return entries.filter((e) => e.isFile()).map((e) => e.name)
}

/**
 * 判断某个文件是否应当跳过（不处理）。
 * @param srcDir 源目录绝对路径
 * @param fileName 文件名
 * @param snapshot 启动时的文件名快照集合（用于判断同名 png 是否已存在）
 * @returns 若应跳过返回 true，否则返回 false
 */
async function shouldSkip(
	srcDir: string,
	fileName: string,
	snapshot: Set<string>,
): Promise<boolean> {
	// 取小写后缀名用于判断
	const ext = path.extname(fileName).toLowerCase()
	// 非支持的图片格式一律跳过
	if (!IMAGE_EXTS.has(ext)) return true

	// 不含后缀的基础名（用于拼接同名 png）
	const baseName = path.basename(fileName, path.extname(fileName))

	if (ext === '.png') {
		// 对于已是 png 的文件：读取其尺寸与体积，
		// 只有当它已经是 512×512 且体积 ≤ 200KB 时才跳过（无需再处理）
		const filePath = path.join(srcDir, fileName)
		try {
			// 读取图片元数据获取宽高
			const meta = await sharp(filePath).metadata()
			// 读取文件体积
			const stat = await fs.stat(filePath)
			// 同时满足尺寸达标与体积达标才跳过
			if (
				meta.width === TARGET_SIZE &&
				meta.height === TARGET_SIZE &&
				stat.size <= MAX_SIZE
			) {
				return true
			}
		} catch {
			// 读取失败（损坏或非法图片）则不跳过，交由后续处理逻辑报错
			return false
		}
		// png 但尺寸或体积不达标 → 需要处理
		return false
	}

	// 对于非 png 文件：若同名 .png 已存在于快照中，
	// 则跳过本文件（让那个 png 自行走处理流程），避免重复产出与相互覆盖
	if (snapshot.has(`${baseName}.png`)) return true

	// 其余非 png 文件 → 需要处理
	return false
}

/**
 * 将图片 buffer 压缩为 PNG，并尽力控制在 MAX_SIZE（200KB）以内。
 * 策略：先尝试无损压缩，若超标再转调色板量化并逐步降低质量。
 * @param pipeline 已配置好（含可能的 resize）的 sharp 处理管线
 * @returns 最终选定的 PNG buffer，以及是否触发了“无法达标”的警告
 */
async function compressToTarget(pipeline: Sharp): Promise<{ buffer: Buffer; warned: boolean }> {
	// 记录所有尝试中体积最小的 buffer，用于极端情况下兜底
	let smallest: Buffer | null = null

	// 生成并评估一个候选 buffer 的内部辅助函数
	const tryBuffer = async (buf: Buffer): Promise<Buffer | null> => {
		// 更新“最小 buffer”记录
		if (smallest === null || buf.length < smallest.length) smallest = buf
		// 达标（≤200KB）则返回该 buffer，否则返回 null 表示继续尝试
		return buf.length <= MAX_SIZE ? buf : null
	}

	// 第一步：无损压缩（最高压缩等级 + 最大 CPU effort），画质最佳
	const lossless = await pipeline.clone().png({ compressionLevel: 9, effort: 10 }).toBuffer()
	// 无损若已达标，直接采用
	const losslessOk = await tryBuffer(lossless)
	if (losslessOk) return { buffer: losslessOk, warned: false }

	// 第二步：无损仍超标 → 转调色板量化，从高质量到低质量逐步尝试
	// 质量档位，从高到低递减，取第一个达标的结果（画质优先）
	const qualitySteps = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10]
	for (const quality of qualitySteps) {
		// 以调色板模式输出，quality 越低颜色越少、体积越小
		const buf = await pipeline.clone().png({ palette: true, quality, effort: 10 }).toBuffer()
		// 达标则立即采用
		const ok = await tryBuffer(buf)
		if (ok) return { buffer: ok, warned: false }
	}

	// 第三步：极端情况——所有档位都无法压到 200KB 以内
	// 输出警告，并返回所有尝试中体积最小的 buffer 作为兜底结果
	// （smallest 在第一步无损压缩时必然已被赋值，此处一定非 null）
	return { buffer: smallest!, warned: true }
}

/**
 * 处理单个图片文件：转 PNG、按需缩放、压缩，并备份原文件后写出结果。
 * @param srcDir 源目录绝对路径
 * @param trashDir 备份目录绝对路径
 * @param fileName 待处理的文件名
 */
async function processOne(srcDir: string, trashDir: string, fileName: string): Promise<void> {
	// 原文件完整路径
	const srcPath = path.join(srcDir, fileName)
	// 不含后缀的基础名
	const baseName = path.basename(fileName, path.extname(fileName))
	// 目标输出路径（同名 .png）
	const destPath = path.join(srcDir, `${baseName}.png`)

	// 创建 sharp 管线（不传 animated，动画格式默认只取第一帧）
	let pipeline = sharp(srcPath)
	// 读取原图元数据以获取宽高
	const meta = await pipeline.metadata()
	// 宽高任一缺失则视为无法处理，抛错跳出
	if (!meta.width || !meta.height) {
		throw new Error(`无法读取图片尺寸: ${fileName}`)
	}

	// 判断是否为“带动画的图片”：sharp 用 meta.pages 表示帧数/页数，
	// 帧数 > 1 才是真动画（可覆盖 gif、动画 webp、apng；静态 webp/apng 的 pages 为 1）。
	// 动画文件后续走“保留原文件 + 复制备份”分支，而非“移动原文件”。
	const isAnimated = (meta.pages ?? 1) > 1

	// 计算宽高比的较大值：max(w/h, h/w)，用于判断是否近似正方形
	const ratio = Math.max(meta.width / meta.height, meta.height / meta.width)
	// 标记本次是否执行了缩放（用于日志）
	let resized = false
	// 近似正方形（比值 ≤ 阈值）→ 缩放到 512×512，使用 nearest 最近邻插值
	if (ratio <= ASPECT_RATIO_THRESHOLD) {
		pipeline = pipeline.resize(TARGET_SIZE, TARGET_SIZE, { kernel: 'nearest' })
		resized = true
	}
	// 否则（过于长方形）不缩放，仅做格式转换与压缩

	// 执行压缩，得到最终 PNG buffer
	const { buffer, warned } = await compressToTarget(pipeline)

	// 备份路径：备份目录下同名同后缀
	const trashPath = path.join(trashDir, fileName)

	if (isAnimated) {
		// 动画图片：不移走原文件，只把原文件“复制”一份到备份目录作备份，
		// 原动画文件继续保留在源目录里（与新生成的 png 并存）。
		// 注意：能进到 processOne 说明同名 png 尚不存在（shouldSkip 已保证），
		// 因此这里直接生成 png 即可，不会覆盖已有 png。
		await fs.copyFile(srcPath, trashPath)
	} else {
		// 非动画图片：沿用原逻辑——把原文件“移动”到备份目录，
		// rename 在同盘符下等价于移动；若目标已存在会被覆盖。
		await fs.rename(srcPath, trashPath)
	}

	// 写出最终的 PNG 结果到源目录（若同名已存在会被覆盖）
	await fs.writeFile(destPath, buffer)

	// 组装并打印本文件的处理日志
	const sizeKB = (buffer.length / 1024).toFixed(1)
	// 动作描述里额外标注是否为动画（保留原文件）
	const animTag = isAnimated ? '，动画取首帧·保留原文件' : ''
	const action = (resized ? '缩放512+转PNG' : '转PNG') + animTag
	if (warned) {
		// 极端情况：无法压到 200KB 以内，输出警告
		console.warn(
			`[警告] ${fileName} → ${baseName}.png（${action}，压缩后 ${sizeKB}KB，超过200KB上限，已保存最小结果）`,
		)
	} else {
		// 正常情况日志
		console.log(`[完成] ${fileName} → ${baseName}.png（${action}，${sizeKB}KB）`)
	}
}

/**
 * 规范化指定目录下的所有图片。
 * @param srcDir 待处理的源目录绝对路径（如 x/、pics/）
 * @param trashDir 原文件备份目录绝对路径（如 trash/lastx/、trash/lastpics/）
 */
async function normalizeDir(srcDir: string, trashDir: string): Promise<void> {
	// 确保备份目录存在（递归创建）
	await fs.mkdir(trashDir, { recursive: true })

	// 一次性快照源目录文件列表
	const files = await snapshotFiles(srcDir)
	// 转为集合，便于 O(1) 判断同名 png 是否存在
	const snapshot = new Set(files)

	// 统计计数器
	let processed = 0
	let skipped = 0

	// 逐个文件处理（串行，避免同时占用过多内存/句柄）
	for (const fileName of files) {
		// 先判断是否跳过
		if (await shouldSkip(srcDir, fileName, snapshot)) {
			skipped++
			console.log(`[跳过] ${fileName}`)
			continue
		}
		// 处理单个文件；单个失败不影响后续文件
		try {
			await processOne(srcDir, trashDir, fileName)
			processed++
		} catch (err) {
			// 记录该文件的处理错误并继续
			console.error(`[错误] ${fileName}: ${(err as Error).message}`)
		}
	}

	// 输出汇总
	console.log(`\n处理完成：转换 ${processed} 个，跳过 ${skipped} 个。`)
}

// ===== 命令行入口 =====

// 当前脚本文件所在目录（scripts/），用于推导项目根目录
const __dirname = path.dirname(fileURLToPath(import.meta.url))
// 项目根目录（scripts/ 的上一级）
const ROOT_DIR = path.resolve(__dirname, '..')

// 允许处理的目标：参数名 → { 源目录名, 备份目录名 }
// 仅 x / pics 两个合法值，其余参数视为无效。
// 这里只存相对目录名，与 ROOT_DIR / 'trash' 的拼接统一放到 cli() 里做，避免重复。
const TARGETS: Record<string, { srcName: string; trashName: string }> = {
	// x：处理 x/，备份到 trash/lastx/
	x: { srcName: 'x', trashName: 'lastx' },
	// pics：处理 pics/，备份到 trash/lastpics/
	pics: { srcName: 'pics', trashName: 'lastpics' },
}

/**
 * 命令行主入口：解析第一个参数，决定处理哪个目录。
 */
async function cli(): Promise<void> {
	// 取第一个命令行参数（process.argv[2]），去除首尾空白
	const target = (process.argv[2] ?? '').trim()

	// 查表：参数必须是 TARGETS 里的合法键（x / pics），否则报错退出
	const conf = TARGETS[target]
	if (!conf) {
		// 无效参数：打印用法提示并以非零码退出
		console.error(
			`无效参数：${target ? `"${target}"` : '(空)'}。` +
				`\n用法：tsx scripts/normalize_core.ts <x|pics>` +
				`\n可用目标：${Object.keys(TARGETS).join(' / ')}`,
		)
		process.exit(1)
	}

	// 参数合法：在此处统一拼接绝对路径（源目录在根下，备份目录固定在 trash/ 下）
	const srcDir = path.join(ROOT_DIR, conf.srcName)
	const trashDir = path.join(ROOT_DIR, 'trash', conf.trashName)

	// 执行对应目录的规范化
	console.log(`开始处理目标：${target}（源目录 ${srcDir}）`)
	await normalizeDir(srcDir, trashDir)
}

// 启动命令行入口，捕获顶层异常
cli().catch((err) => {
	console.error('脚本执行失败：', err)
	process.exit(1)
})

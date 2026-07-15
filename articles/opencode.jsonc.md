### OpenCode 完整配置模板 (JSONC)

```jsonc
{
	"$schema": "https://opencode.ai/config.json",

	// ==================== 全局设置 ====================

	// 主模型，格式: 提供商ID/模型ID
	// 可选，不设置则使用上次使用的模型或自动选择
	// "model": "cpa/gpt-5.5",

	// 小模型，用于轻量任务（如生成标题）
	// 可选，不设置则自动选便宜的或回退到主模型
	// "small_model": "cpa/gpt-5.5",

	// 是否自动更新 OpenCode
	// 可选值: true, false, "notify"
	// 默认: true
	// "autoupdate": true,

	// 默认 agent
	// 可选值: "build", "plan", 或自定义 agent 名称
	// 默认: "build"
	// "default_agent": "build",

	// 会话分享设置
	// 可选值: "manual"（手动）, "auto"（自动）, "disabled"（禁用）
	// 默认: "manual"
	// "share": "manual",

	// 快照功能，用于撤销/恢复操作
	// 可选值: true, false
	// 默认: true
	// 注意: 大型项目禁用可提升性能
	// "snapshot": true,

	// 代码格式化器
	// 可选值: true（启用内置）, false（禁用）, 或对象配置覆盖
	// 默认: false（禁用）
	// "formatter": true,

	// LSP 服务器
	// 可选值: true（启用内置）, false（禁用）, 或对象配置覆盖
	// 默认: false（禁用）
	// "lsp": true,

	// 上下文压缩
	// 可选，所有子字段均可选
	// "compaction": {
	//   "auto": true,       // 自动压缩上下文，默认: true
	//   "prune": false,     // 删除旧工具输出以节省 token，默认: false
	//   "reserved": 10000   // 压缩时保留的 token 缓冲区
	// },

	// 文件监视器忽略规则
	// 可选
	// "watcher": {
	//   "ignore": ["node_modules/**", "dist/**", ".git/**"]
	// },

	// 自定义指令文件路径（支持 glob 模式）
	// 可选
	// "instructions": ["CONTRIBUTING.md", "docs/guidelines.md"],

	// 禁用的提供商列表（即使有凭据也不加载）
	// 可选
	// "disabled_providers": ["openai"],

	// 启用的提供商白名单（设置后只使用这些，其余忽略）
	// 可选
	// "enabled_providers": ["cpa"],

	// Shell 配置
	// 可选，不写则自动检测（Windows: pwsh/cmd, macOS/Linux: zsh/bash）
	// "shell": "pwsh",

	// ==================== 权限设置 ====================
	// 可选，不写则默认全部 allow
	// 每个工具可设: "allow", "ask", "deny"
	// "permission": {
	//   "bash": "ask",
	//   "write": "ask",
	//   "edit": "allow",
	//   "read": "allow"
	// },

	// ==================== 服务器设置 ====================
	// 用于 opencode serve / opencode web 命令
	// 可选
	// "server": {
	//   "port": 4096,            // 监听端口
	//   "hostname": "127.0.0.1", // 监听地址
	//   "mdns": false,           // mDNS 服务发现
	//   "cors": []               // CORS 允许的来源
	// },

	// ==================== 图片附件设置 ====================
	// 可选
	// "attachment": {
	//   "image": {
	//     "auto_resize": true,       // 自动缩放超大图片，默认: true
	//     "max_width": 2000,         // 最大宽度(px)，默认: 2000
	//     "max_height": 2000,        // 最大高度(px)，默认: 2000
	//     "max_base64_bytes": 5242880 // 最大 base64 大小(字节)，默认: 5MB
	//   }
	// },

	// ==================== 工具输出截断 ====================
	// 可选
	// "tool_output": {
	//   "max_lines": 2000,  // 最大行数，默认: 2000
	//   "max_bytes": 51200  // 最大字节数，默认: 51200
	// },

	// ==================== Agent 配置 ====================
	// 可选
	// "agent": {
	//   "my-agent": {
	//     "description": "描述",
	//     "model": "cpa/gpt-5.5",
	//     "prompt": "你是...",
	//     "mode": "subagent",  // "subagent" | "primary" | "all"
	//     "steps": 50,         // 最大迭代步数
	//     "permission": { "write": "ask" }
	//   }
	// },

	// ==================== 自定义命令 ====================
	// 可选
	// "command": {
	//   "test": {
	//     "template": "Run the full test suite.",
	//     "description": "Run tests",
	//     "agent": "build",
	//     "model": "cpa/gpt-5.5"
	//   }
	// },

	// ==================== 插件 ====================
	// 可选
	// "plugin": ["opencode-helicone-session"],

	// ==================== MCP 服务器 ====================
	// 可选
	// "mcp": {
	//   "my-mcp": {
	//     "type": "local",
	//     "command": ["node", "server.js"],
	//     "enabled": true
	//   }
	// },

	// ==================== 实验性功能 ====================
	// 可选
	// "experimental": {
	//   "policies": [
	//     { "effect": "deny", "action": "provider.use", "resource": "openai" }
	//   ]
	// },

	// ==================== 提供商配置 ====================
	"provider": {
		"cpa": {
			// npm: AI SDK 包名
			// 必填（自定义提供商）
			// 可选值:
			//   "@ai-sdk/openai-compatible" — /v1/chat/completions
			//   "@ai-sdk/openai" — /v1/responses
			//   "@ai-sdk/anthropic" — Claude Messages API
			//   "@ai-sdk/google" — Gemini API
			"npm": "@ai-sdk/openai-compatible",

			// name: UI 显示名称
			// 可选，不写则显示提供商ID
			// "name": "My CPA Proxy",

			// whitelist: 只显示这些模型，可选，不写显示全部
			// "whitelist": ["gpt-5.5"],

			// blacklist: 隐藏这些模型，可选，不写不隐藏
			// "blacklist": [],

			"options": {
				// baseURL: API 端点
				// 必填（自定义提供商），不带尾部斜杠
				"baseURL": "http://localhost:8317/v1",

				// apiKey: 密钥，支持 {env:VAR} 语法
				// 可选，不写则用 /connect 存的或无认证
				// "apiKey": "{env:CPA_API_KEY}",

				// headers: 每个请求附带的自定义头
				// 可选，不写则不附加
				// "headers": { "X-Custom": "value" },

				// timeout: 完整请求超时(ms)
				// 可选，默认 300000(5分钟)，设为 false 禁用
				// "timeout": 300000,

				// headerTimeout: 等待响应头超时(ms)
				// 可选，默认由 SDK 决定，设为 false 禁用
				// "headerTimeout": 30000,

				// chunkTimeout: 流式 SSE chunk 间最大等待(ms)
				// 可选，不写则无限制，超时中止请求
				// "chunkTimeout": 15000,

				// setCacheKey: 是否设置 promptCacheKey
				// 可选，默认 false
				// "setCacheKey": false
			},

			"models": {
				"gpt-5.5": {
					// id: 发给上游的实际模型ID
					// 可选，不写则用 key 本身
					// "id": "actual-upstream-model-id",
					// name: 显示名
					// 可选，不写显示模型ID
					// "name": "GPT 5.5",
					// family: 模型家族标识
					// 可选
					// "family": "openai",
					// release_date: 发布日期
					// 可选
					// "release_date": "2026-06-01",
					// attachment: 是否支持图片/文件附件
					// 可选，默认由 SDK 判断
					// "attachment": true,
					// reasoning: 是否支持推理/思考
					// 可选，默认由 SDK 判断
					// "reasoning": true,
					// temperature: 是否支持 temperature 参数
					// 可选，默认 true
					// "temperature": true,
					// tool_call: 是否支持工具调用
					// 可选，默认由 SDK 判断，false 则 OpenCode 不发工具
					// "tool_call": true,
					// cost: 价格(每百万token, 美元)
					// 可选，不写则不显示花费
					// "cost": {
					//   "input": 5.0,      // 写cost时必填
					//   "output": 30.0,    // 写cost时必填
					//   "cache_read": 0.5, // 可选
					//   "cache_write": 5.0 // 可选
					// },
					// limit: token 限制
					// 可选，不写则 OpenCode 无法管理上下文窗口（强烈建议填）
					// 如果写了 limit，则 context 和 output 是必填子字段
					// "limit": {
					//   "context": 272000, // 上下文窗口大小(token)，写limit时必填
					//   "input": 272000,   // 可选: 单独设输入限制，不写等于 context
					//   "output": 32768    // 最大输出token数，写limit时必填
					// },
					// modalities: 输入输出模态
					// 可选，不写默认 text
					// 可选值: "text", "audio", "image", "video", "pdf"
					// "modalities": {
					//   "input": ["text", "image"],
					//   "output": ["text"]
					// },
					// experimental: 标记实验性
					// 可选，默认 false
					// "experimental": false,
					// status: 模型状态
					// 可选值: "alpha" | "beta" | "deprecated" | "active"
					// 不写视为 active
					// "status": "active",
					// interleaved: 推理内容是否交错在响应中
					// 可选，值: true 或 { "field": "reasoning"|"reasoning_content"|"reasoning_details" }
					// "interleaved": true,
					// provider: 模型级别覆盖 SDK 包（同一提供商下某模型走不同协议时用）
					// 可选
					// "provider": {
					//   "npm": "@ai-sdk/openai",
					//   "api": "responses"
					// },
					// options: 模型默认参数
					// 可选
					// "options": {
					//   // reasoningEffort: 思考强度
					//   // 可选值: "none" | "low" | "medium" | "high" | "xhigh"
					//   "reasoningEffort": "high",
					//
					//   // textVerbosity: 文本详细程度
					//   // 可选值: "low" | "medium" | "high"
					//   // "textVerbosity": "low",
					//
					//   // reasoningSummary: 推理摘要
					//   // 可选值: "auto" | "concise" | "detailed" | "disabled"
					//   // "reasoningSummary": "auto",
					//
					//   // include: 额外包含的响应字段
					//   // "include": ["reasoning.encrypted_content"],
					//
					//   // thinking (Anthropic格式，仅 @ai-sdk/anthropic 时用):
					//   // "thinking": { "type": "enabled", "budgetTokens": 16000 }
					// },
					// headers: 模型级别自定义请求头
					// 可选
					// "headers": { "X-Model-Header": "value" },
					// variants: 模型变体，通过 variant_cycle 快捷键切换
					// 可选
					// "variants": {
					//   "high": { "reasoningEffort": "high" },
					//   "medium": { "reasoningEffort": "medium" },
					//   "low": { "reasoningEffort": "low" },
					//   "disabled-example": { "reasoningEffort": "none", "disabled": true }
					// }
				},
			},
		},
	},
}
```

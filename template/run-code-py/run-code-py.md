# run-code-py

临时运行代码、临时处理文件的约定。适用于任何一次性任务，**不限于 Python**：也包括 JS 等其它语言的临时代码，以及办公类的、操作文档文件之类的临时处理（数据核对、批量改名、格式转换等）。需要在本项目中临时做这类工作时，遵循本文。

## 临时产物放哪里

- 一切临时产物（脚本、中间文件、生成出来的文档等）一律放在项目根的 `run-code-trash/` 目录下；不存在则自行创建。
- 该目录视为一次性产物，用完即弃，不提交、不长期维护。

## 虚拟环境（仅 Python 场景）

- 只有用 Python 时才涉及本节；其它语言按各自生态的常规做法处理。
- 依赖统一装在项目根的虚拟环境 `.venv/`，不要装到全局环境。
- 没有 `.venv/` 时先创建：`python -m venv .venv`。
- 之后一切操作都走该环境的解释器：
  - Windows：`.venv\Scripts\python.exe`
  - macOS / Linux：`.venv/bin/python`

## 依赖管理

- 依赖清单是项目根的 `requirements.txt`（采用主流命名，带复数 `s`）。
- **安装/卸载一律用 `python -m pip`，不要直接用裸 `pip`**：裸 `pip` 可能指向全局或另一个解释器，容易装错地方；`python -m pip` 能确保装进当前 venv。
- 需要新包时：先用 `python -m pip install <包名>` 安装，再把包名写回 `requirements.txt`，使两者保持一致。
- 让 venv 与清单对齐：
  - 按清单补齐：`python -m pip install -r requirements.txt`
  - 导出当前环境用于校对：`python -m pip freeze`

## 忽略规则

- 忽略规则由项目维护方（用户）负责，**不归 agent 管**：`.gitignore` 里已经写了就放着，没写也不用去补。
- 规范项目中，项目根 `.gitignore` 里应有 `/run-code-trash/`（虚拟环境场景下通常还有 `.venv/`），以保证临时产物不会被提交。
- 也就是说，agent 只管把产物放进 `run-code-trash/`，至于它是否被忽略、要不要动 `.gitignore`，交给用户即可。
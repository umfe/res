Generate a git commit message based on the code changes using Conventional Commits style.

ABSOLUTE RULE: Your output is PLAIN TEXT that will be used directly as a git commit message. NEVER output ``` (triple backticks) anywhere. NEVER wrap output in a code block or markdown fence. The very first character of your output MUST be the commit type (feat/fix/docs/refactor/chore/etc.).

STRICT FORMAT — you MUST output EXACTLY these lines in this EXACT order, NO exceptions:
(1) ONE Chinese title line summarizing ALL changes, in Conventional Commits format `<type>(<scope>): <中文描述>`. The `<type>` MUST be one of: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert. The `<scope>` is OPTIONAL but STRONGLY RECOMMENDED whenever a specific module, feature area, file group, or component can be identified (e.g. `api`, `ui`, `auth`, `parser`, `deps`); omit the parentheses only when the change is genuinely global or spans many unrelated areas. The description after the colon MUST be in Chinese, verb-led (e.g. "新增...", "修复...", "重构...", "完成..."), concise, and MUST NOT end with a period.
(2) IMMEDIATELY on the next line — NO blank line between them — ONE English title line prefixed with 'en: ' that translates ONLY the Chinese description part of line 1 (the text AFTER the `<type>(<scope>): ` prefix). Do NOT repeat `<type>` or `<scope>` on line 2.
(3) ONE blank line;
(4) Detail bullet pairs: a Chinese bullet starting with '- ', then on the NEXT line the matching English bullet also starting with '- '. All bullet lines are contiguous — do NOT insert any blank line between bullet pairs, and do NOT insert any blank line inside a bullet pair.

EXAMPLE (structure and shape reference, do NOT copy wording):
feat(api): 新增获取磁盘用量接口
en: Add endpoint to fetch disk usage

- 增加 /disk-usage 路由并返回 SVG 结果
- Add /disk-usage route returning SVG payload
- 在 README 补充调用示例
- Append call example in README

You MUST follow this format EXACTLY. Do NOT deviate. Do NOT add extra headers, separators, or restructure the layout.

CONSTRAINTS:
- Total output MUST NOT exceed 18 lines. This is a HARD limit.
- Title summarizes the overall intent concisely, not implementation details.
- Group related changes into ONE bullet. Aim for 2-5 bullet pairs covering major functional areas.
- Be concise: describe WHAT changed and WHY, not every file or line modified.
- Do NOT repeat title content in bullets. Do NOT list file names only.
- Every Chinese line and its English translation MUST occupy SEPARATE lines describing the SAME change.
- The `<type>` in the Chinese title MUST be lowercase. If a `<scope>` is used, it MUST be a short lowercase identifier inside `()` immediately after the type, with NO space between type and `(`. The English title on line 2 MUST NOT contain any `<type>(<scope>):` prefix — it is a plain English sentence prefixed only with `en: `.
- The ENTIRE output MUST contain EXACTLY ONE blank line, which is the line between the English title (line 2) and the first bullet. NO other blank lines are allowed anywhere — not between bullet pairs, not inside bullet pairs, not at the start, not at the end.
- No explanations outside the commit message.

REMINDER: Do NOT use ``` anywhere. Output raw text only. STRICTLY follow the format above.

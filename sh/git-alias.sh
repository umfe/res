#!/bin/sh
set -eu

if ! command -v git >/dev/null 2>&1; then
    printf '%s\n' '未找到 git，请先安装 Git。' >&2
    exit 1
fi

# 使用带引号的 heredoc，防止配置时展开 pick 函数中的参数和命令替换。
pick_alias=$(cat <<'ALIAS'
!f() { if [ "$#" -eq 0 ]; then printf '%s\n' 'Usage: git pick <commit|range> [...]' >&2; return 2; fi; for arg in "$@"; do case "$arg" in -*) printf '%s\n' "git pick: options are not supported: $arg" >&2; return 2;; esac; done; commits=$(git rev-list --reverse --topo-order --first-parent --no-walk "$@") || return; if [ -z "$commits" ]; then printf '%s\n' 'git pick: no commits selected' >&2; return 1; fi; printf '%s\n' "$commits" | git cherry-pick -m 1 --stdin; }; f
ALIAS
)

# 直接替换同名 alias 的所有配置值，重复运行不会新增重复项；其他配置保留。
git config --global --replace-all alias.pdiff 'diff --no-ext-diff --no-textconv --binary'
git config --global --replace-all alias.pick "$pick_alias"
git config --global --replace-all alias.cpick 'cherry-pick'
git config --global --replace-all alias.lg 'log --graph --oneline --decorate --all'
git config --global --replace-all alias.last 'log -1 --stat'
git config --global --replace-all alias.staged 'pdiff --cached'
git config --global --replace-all alias.wd 'diff --word-diff'
git config --global --replace-all alias.unstage 'restore --staged'
git config --global --replace-all alias.undo 'reset --soft HEAD~1'
git config --global --replace-all alias.amend 'commit --amend --no-edit'
git config --global --replace-all alias.squash 'rebase -i --autosquash'
git config --global --replace-all alias.discard 'restore --staged --worktree'

printf '%s\n' '已配置 12 个全局 Git alias。'

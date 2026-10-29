#!/usr/bin/env bash
# Install the ToAPIs skills and add the ToAPIs MCP server to Codex or Claude Code (macOS and Linux; on Windows use
# install.ps1). Never reads or writes API keys: sign-in happens afterwards in the browser.
#
#   bash scripts/install.sh --client codex|claude-code --site com|cn [--locale <code>] [--dry-run] [--force]
#
# Or without a clone; the repository archive is then downloaded to a temporary directory (TOAPIS_SKILLS_ARCHIVE
# overrides its URL, for mirrors and tests):
#
#   curl -fsSL https://raw.githubusercontent.com/toapis/skills/main/scripts/install.sh | bash -s -- --client codex --site com
#
# Everything that can be checked is checked first: if a step would fail, or would replace an existing skill or ToAPIs
# server without --force, nothing is changed. If a write still fails midway, fix the cause and run it again; finished
# steps then report unchanged. Replaced skills are moved to ~/.toapis-backup/<UTC time>/; the Codex config is backed
# up next to itself by toapis-setup.mjs.
set -euo pipefail

usage='usage: install.sh --client codex|claude-code --site com|cn [--locale <code>] [--dry-run] [--force]'
fail() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}

# BASH_SOURCE is empty when the script is read from a pipe.
self=${BASH_SOURCE[0]:-}

# Everything runs inside main, which bash reads completely before running it. From a pipe (curl | bash), this keeps a
# child process that reads stdin from swallowing the rest of the script, and a truncated download never runs halfway.
main() {
  repo=''
  if [ -n "$self" ] && [ -f "$(dirname "$self")/../skills/toapis-setup/SKILL.md" ]; then
    repo=$(cd "$(dirname "$self")/.." && pwd)
  fi
  client=''
  site=''
  locale=''
  dry_run=0
  force=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --client | --site | --locale)
        [ $# -ge 2 ] || fail "$usage"
        case "$1" in
          --client) client=$2 ;;
          --site) site=$2 ;;
          --locale) locale=$2 ;;
        esac
        shift 2
        ;;
      --dry-run) dry_run=1 && shift ;;
      --force) force=1 && shift ;;
      *) fail "$usage" ;;
    esac
  done

  case "$client" in
    codex) skills_dir="$HOME/.agents/skills" ;;
    claude-code) skills_dir="$HOME/.claude/skills" ;;
    *) fail "$usage" ;;
  esac
  case "$site" in
    com) url='https://api.toapis.com/mcp' ;;
    cn) url='https://api.toapis.cn/mcp' ;;
    *) fail "$usage" ;;
  esac
  if [ -n "$locale" ] && ! [[ "$locale" =~ ^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$ ]]; then
    fail "invalid locale: $locale"
  fi

  # 0. Without a full copy of the repository next to this script, download the repository archive.
  if [ -z "$repo" ]; then
    archive=${TOAPIS_SKILLS_ARCHIVE:-https://github.com/toapis/skills/archive/refs/heads/main.tar.gz}
    case "$archive" in
      /*) archive="file://$archive" ;;
    esac
    command -v curl > /dev/null 2>&1 || fail 'curl is needed to download the ToAPIs skills'
    download_dir=$(mktemp -d "${TMPDIR:-/tmp}/toapis-skills.XXXXXX")
    trap 'rm -rf "$download_dir"' EXIT
    echo "downloading $archive"
    curl -fsSL "$archive" -o "$download_dir/skills.tar.gz" || fail "cannot download $archive"
    tar -xzf "$download_dir/skills.tar.gz" -C "$download_dir" || fail "cannot extract $archive"
    # The archive holds one top folder, skills-main for this branch on GitHub; mirrors may name it differently.
    repo=$(find "$download_dir" -mindepth 1 -maxdepth 1 -type d)
    if [ -z "$repo" ] || [ "$(printf '%s\n' "$repo" | wc -l)" -ne 1 ]; then
      fail "unexpected layout of $archive: expected one top folder"
    fi
  fi

  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  backup_root="$HOME/.toapis-backup/$stamp"

  # 1. Check the skills.
  skills='toapis-setup toapis-media'
  skill_actions=''
  for name in $skills; do
    src="$repo/skills/$name"
    dest="$skills_dir/$name"
    [ -f "$src/SKILL.md" ] || fail "missing $src; run this script from a full copy of https://github.com/toapis/skills"
    if [ -e "$dest" ] || [ -L "$dest" ]; then
      if diff -rq "$src" "$dest" > /dev/null 2>&1; then
        action=unchanged
      elif [ "$force" = 1 ]; then
        action=replace
      else
        fail "$dest already exists and differs from this copy. Rerun with --force to replace it (the old copy is moved to $backup_root)."
      fi
    else
      action=add
    fi
    skill_actions="$skill_actions $name:$action"
    printf 'skill %s: %s (%s)\n' "$name" "$action" "$dest"
  done

  # 2. Check the MCP server.
  setup_script="$repo/skills/toapis-setup/scripts/toapis-setup.mjs"
  setup_args="codex --site $site"
  [ -n "$locale" ] && setup_args="$setup_args --locale $locale"
  if [ "$client" = codex ]; then
    if ! command -v node > /dev/null 2>&1 || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)'; then
      block="[mcp_servers.toapis]
  url = \"$url\""
      [ -n "$locale" ] && block="$block
  http_headers = { \"X-Locale\" = \"$locale\" }"
      fail "Node.js 20 or newer is needed to edit the Codex config. Install it, or add this section to ${CODEX_HOME:-$HOME/.codex}/config.toml yourself:
  $block"
    fi
    # setup_args holds only validated words, so word splitting is intended here.
    # shellcheck disable=SC2086
    preview=$(node "$setup_script" $setup_args --dry-run) || true
    case "$preview" in
      *'"action":"replaced"'*)
        [ "$force" = 1 ] || fail "the Codex config already has a different toapis server. Rerun with --force to replace it (a backup is kept). $preview"
        mcp_action=replace
        ;;
      *'"action":"added"'*) mcp_action=add ;;
      *'"action":"unchanged"'*) mcp_action=unchanged ;;
      *) fail "cannot update the Codex config: ${preview:-toapis-setup.mjs printed nothing}" ;;
    esac
  else
    command -v claude > /dev/null 2>&1 || fail 'the Claude Code CLI (claude) was not found. Install or update Claude Code first.'
    if claude mcp get toapis < /dev/null > /dev/null 2>&1; then
      [ "$force" = 1 ] || fail 'Claude Code already has an MCP server named toapis. Check it with "claude mcp get toapis", then rerun with --force to replace it.'
      mcp_action=replace
    else
      mcp_action=add
    fi
  fi
  printf 'mcp server toapis: %s (%s)\n' "$mcp_action" "$url"

  if [ "$dry_run" = 1 ]; then
    echo 'dry run: nothing was changed'
    exit 0
  fi

  # 3. Apply.
  for entry in $skill_actions; do
    name=${entry%%:*}
    action=${entry#*:}
    dest="$skills_dir/$name"
    case "$action" in
      replace)
        mkdir -p "$backup_root"
        mv "$dest" "$backup_root/$name"
        cp -R "$repo/skills/$name" "$dest"
        echo "moved the old $name to $backup_root/$name"
        ;;
      add)
        mkdir -p "$skills_dir"
        cp -R "$repo/skills/$name" "$dest"
        ;;
    esac
  done

  if [ "$client" = codex ]; then
    if [ "$mcp_action" != unchanged ]; then
      # shellcheck disable=SC2086
      result=$(node "$setup_script" $setup_args) || fail "cannot update the Codex config: $result"
      echo "$result"
    fi
    echo 'Done. Sign in to ToAPIs:'
    echo '- Codex CLI: run "codex mcp login toapis".'
    echo '- Codex desktop app: open Settings > MCP servers, restart the servers if asked, and click Authenticate next to toapis.'
  else
    if [ "$mcp_action" = replace ]; then
      claude mcp remove toapis --scope user < /dev/null > /dev/null || fail 'cannot remove the existing toapis server; it may not be in the user scope. Remove it yourself, then rerun.'
    fi
    if [ -n "$locale" ]; then
      claude mcp add --transport http --scope user toapis "$url" --header "X-Locale: $locale" < /dev/null
    else
      claude mcp add --transport http --scope user toapis "$url" < /dev/null
    fi
    echo 'Done. Sign in to ToAPIs: start Claude Code, run /mcp, select toapis and authenticate.'
  fi
  echo 'Then start a new session and ask the agent to check your ToAPIs balance.'
}

main "$@"

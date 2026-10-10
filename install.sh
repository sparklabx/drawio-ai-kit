#!/bin/sh
# drawio-ai-kit installer. Usage (pipe this file to sh):
#   curl -fsSL https://raw.githubusercontent.com/sparklabx/drawio-ai-kit/refs/heads/v2/install.sh | sh
# Installs drawio-ai-kit@latest globally with Bun (preferred) or npm, links the drawio-ai command into
# ~/.local/bin (or $BIN_DIR / --bin-dir), then registers the agent skill.
# Installs from the npm registry only. Removes old installs first (--no-clean to keep them).
# No sudo, never installs a runtime. Re-run to upgrade.
set -eu

# printf, not cat: keeps the script free of external commands
usage() {
  printf '%s\n' 'Usage: install.sh [options]
  --version <v>     install drawio-ai-kit@<v> (env: DRAWIO_AI_VERSION; default: latest, built from v2)
  --bin-dir <dir>   where to put the drawio-ai command (env: BIN_DIR; default: ~/.local/bin)
  --runtime <r>     bun|npm (default: bun if present, else npm)
  --agent <name>    register the skill for this agent (repeatable)
  --no-skill        install the CLI only
  --no-clean        keep existing installs (default: remove old CLI copies and skills first)
  --dry-run        print the commands, run nothing
  -h, --help        show this help'
}

die() { printf 'install.sh: %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

version=${DRAWIO_AI_VERSION:-}
bin_dir=${BIN_DIR:-$HOME/.local/bin}
runtime=
agents=
skill=1
clean=1
dry=0

while [ $# -gt 0 ]; do
  case $1 in
    --version) [ $# -ge 2 ] || die "--version needs a value"; version=$2; shift ;;
    --version=*) version=${1#*=} ;;
    --bin-dir) [ $# -ge 2 ] || die "--bin-dir needs a value"; bin_dir=$2; shift ;;
    --bin-dir=*) bin_dir=${1#*=} ;;
    --runtime) [ $# -ge 2 ] || die "--runtime needs a value"; runtime=$2; shift ;;
    --runtime=*) runtime=${1#*=} ;;
    --agent) [ $# -ge 2 ] || die "--agent needs a value"; agents="$agents --agent $2"; shift ;;
    --agent=*) agents="$agents --agent ${1#*=}" ;;
    --no-skill) skill=0 ;;
    --no-clean) clean=0 ;;
    --dry-run) dry=1 ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die "unknown option: $1" ;;
  esac
  shift
done

case $runtime in
  "") if have bun; then runtime=bun; elif have npm; then runtime=npm; fi ;;
  bun|npm) have "$runtime" || die "--runtime $runtime requested but '$runtime' is not on PATH" ;;
  *) die "--runtime must be bun or npm" ;;
esac

[ -n "$runtime" ] || die "neither Bun nor Node.js found. Install one first (this script never installs a runtime):
  Bun:  https://bun.sh      (Linux/macOS/Windows)
  Node: https://nodejs.org  (Node >=20.6)"

# Node >=20.6 (module.register). node_ok=0 when node is missing or older.
node_ok=0
if have node; then
  nv=$(node -v); nv=${nv#v}   # e.g. v22.1.0
  nmaj=${nv%%.*}; nmin=${nv#*.}; nmin=${nmin%%.*}
  case $nmaj$nmin in ''|*[!0-9]*) nmaj=; esac
  if [ -n "$nmaj" ] && { [ "$nmaj" -gt 20 ] || { [ "$nmaj" -eq 20 ] && [ "$nmin" -ge 6 ]; }; }; then node_ok=1; fi
fi

if [ "$runtime" = npm ]; then
  have node || die "node not found. Install Node >=20.6 from https://nodejs.org"
  [ -n "${nmaj:-}" ] || die "cannot parse node version"
  [ "$node_ok" = 1 ] || die "Node >=20.6 required (found v$nv). Upgrade Node, or install Bun: https://bun.sh"
fi

pkg=drawio-ai-kit@${version:-latest}

# Print then run a command line. Word splitting is intentional: no argument contains spaces.
run() {
  printf '+ %s\n' "$*"
  [ "$dry" = 1 ] || "$@"
}

skillcmd="skill install -g -y$agents"

# Clean old installs first so exactly one copy remains: a global CLI from either package manager
# (incl. old git installs, same package name), the bun wrapper, old skills and the pre-1.0 MCP entry.
if [ "$clean" = 1 ]; then
  if [ -e "$bin_dir/drawio-ai" ] || [ -L "$bin_dir/drawio-ai" ]; then run rm -f "$bin_dir/drawio-ai"; fi
  if have npm && npm ls -g --depth=0 drawio-ai-kit >/dev/null 2>&1; then run npm uninstall -g drawio-ai-kit; fi
  if have bun; then
    gb=$(bun pm bin -g 2>/dev/null || true)
    if [ -n "$gb" ] && [ -d "$gb/../install/global/node_modules/drawio-ai-kit" ]; then run bun remove -g drawio-ai-kit; fi
    if [ -n "$gb" ] && [ -f "$gb/drawio-ai" ]; then run rm -f "$gb/drawio-ai"; fi
  fi
  if [ "$skill" = 1 ]; then
    if [ "$runtime" = bun ]; then sk="bunx skills"; else sk="npx -y skills"; fi
    # shellcheck disable=SC2086
    run $sk remove -g -y drawio drawio-aws drawio-azure drawio-gcp drawio-databricks drawio-bpmn drawio-cloud-architect drawio-aws-architect \
      || printf 'warning: could not remove old skills; continuing\n' >&2
    # Pre-1.0 installers wrote skill dirs/symlinks the skills CLI does not track. Fixed legacy names only.
    for d in .agents/skills .claude/skills .gemini/skills .gemini/antigravity-cli/skills .cursor/skills .codex/skills; do
      for n in drawio-aws-architect drawio-cloud-architect drawio-bpmn drawio-aws drawio-azure drawio-gcp drawio-databricks; do
        if [ -e "$HOME/$d/$n" ] || [ -L "$HOME/$d/$n" ]; then run rm -rf "$HOME/$d/$n"; fi
      done
    done
  fi
  # Pre-1.0 MCP server (deleted in 1.0); a stale entry points at a missing file.
  if have claude && claude mcp get drawio-ai-kit >/dev/null 2>&1; then
    run claude mcp remove drawio-ai-kit --scope user || true
  fi
fi

if [ "$runtime" = bun ]; then run bun add -g "$pkg"; else run npm i -g "$pkg"; fi

# Link the CLI into $bin_dir (default ~/.local/bin): one predictable path, whatever the package
# manager's own global bin dir is. Bun-only machine (or node older than 20.6): dist/cli.mjs has a
# `#!/usr/bin/env node` shebang (Windows-safe), so write a wrapper that runs it under bun instead.
if [ "$runtime" = bun ]; then
  gb=$(bun pm bin -g 2>/dev/null || true)
  groot=${gb:+$gb/../install/global/node_modules}
else
  groot=$(npm root -g 2>/dev/null || true)
fi
cli_js=${groot:-<global node_modules>}/drawio-ai-kit/dist/cli.mjs
cli=$bin_dir/drawio-ai
if [ "$dry" = 1 ]; then
  printf '+ mkdir -p %s\n' "$bin_dir"
  if [ "$runtime" = bun ] && [ "$node_ok" = 0 ]; then printf '+ write bun wrapper %s -> %s\n' "$cli" "$cli_js"
  else printf '+ ln -sf %s %s\n' "$cli_js" "$cli"; fi
else
  if [ -z "$groot" ] || [ ! -f "$cli_js" ]; then die "installed, but could not find the package (looked for $cli_js)"; fi
  mkdir -p "$bin_dir"
  rm -f "$cli"
  if [ "$runtime" = bun ] && [ "$node_ok" = 0 ]; then
    printf '#!/bin/sh\nexec bun "%s" "$@"\n' "$cli_js" > "$cli"
    chmod +x "$cli"
    printf 'No node >=20.6 found: %s runs the CLI under bun.\n' "$cli"
  else
    ln -s "$cli_js" "$cli"
  fi
  # shellcheck disable=SC2016 # literal $PATH is printed for the user to copy
  case ":$PATH:" in
    *":$bin_dir:"*) ;;
    *) printf '\nNote: %s is not on your PATH. Add it, e.g.:\n  export PATH="%s:$PATH"\n\n' "$bin_dir" "$bin_dir" ;;
  esac
fi

# shellcheck disable=SC2086
[ "$skill" = 0 ] || run "$cli" $skillcmd
run "$cli" root
[ "$dry" = 1 ] || printf 'drawio-ai-kit installed.\n'

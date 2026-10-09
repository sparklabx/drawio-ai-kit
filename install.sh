#!/bin/sh
# drawio-ai-kit installer. Usage (pipe this file to sh):
#   curl -fsSL https://raw.githubusercontent.com/sparklabx/drawio-ai-kit/main/install.sh | sh
# Installs the CLI globally with Bun (preferred) or npm, then registers the agent skill.
# No sudo, never installs a runtime. Re-run to upgrade.
set -eu

# printf, not cat: keeps the script free of external commands
usage() {
  printf '%s\n' 'Usage: install.sh [options]
  --version <v>     install drawio-ai-kit@<v> (env: DRAWIO_AI_VERSION; default: latest)
  --runtime <r>     bun|npm (default: bun if present, else npm)
  --agent <name>    register the skill for this agent (repeatable)
  --no-skill        install the CLI only
  --dry-run         print the commands, run nothing
  -h, --help        show this help'
}

die() { printf 'install.sh: %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

version=${DRAWIO_AI_VERSION:-}
runtime=
agents=
skill=1
dry=0

while [ $# -gt 0 ]; do
  case $1 in
    --version) [ $# -ge 2 ] || die "--version needs a value"; version=$2; shift ;;
    --version=*) version=${1#*=} ;;
    --runtime) [ $# -ge 2 ] || die "--runtime needs a value"; runtime=$2; shift ;;
    --runtime=*) runtime=${1#*=} ;;
    --agent) [ $# -ge 2 ] || die "--agent needs a value"; agents="$agents --agent $2"; shift ;;
    --agent=*) agents="$agents --agent ${1#*=}" ;;
    --no-skill) skill=0 ;;
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
  Node: https://nodejs.org  (Node >=20)"

if [ "$runtime" = npm ]; then
  have node || die "node not found. Install Node >=20 from https://nodejs.org"
  nv=$(node -v)   # e.g. v22.1.0
  nv=${nv#v}; nv=${nv%%.*}
  case $nv in ''|*[!0-9]*) die "cannot parse node version" ;; esac
  [ "$nv" -ge 20 ] || die "Node >=20 required (found v$nv). Upgrade Node, or install Bun: https://bun.sh"
fi

pkg=drawio-ai-kit${version:+@$version}

# Print then run a command line. Word splitting is intentional: no argument contains spaces.
run() {
  printf '+ %s\n' "$*"
  [ "$dry" = 1 ] || "$@"
}

skillcmd="skill install -g -y$agents"

if [ "$runtime" = bun ]; then run bun add -g "$pkg"; else run npm i -g "$pkg"; fi

if [ "$dry" = 1 ]; then
  # shellcheck disable=SC2086 # word list is deliberate
  [ "$skill" = 0 ] || run drawio-ai $skillcmd
  run drawio-ai root
  exit 0
fi

# Find the global bin dir so the CLI runs even if it is not on PATH yet.
if [ "$runtime" = bun ]; then
  gbin=$(bun pm bin -g 2>/dev/null || true)
else
  gbin=$(npm prefix -g 2>/dev/null || true)
  [ -z "$gbin" ] || gbin=$gbin/bin
fi

if have drawio-ai; then
  cli=drawio-ai
elif [ -n "$gbin" ] && [ -x "$gbin/drawio-ai" ]; then
  cli=$gbin/drawio-ai
  printf '\nNote: %s is not on your PATH. Add it, e.g.:\n  export PATH="%s:$PATH"\n\n' "$gbin" "$gbin"
else
  die "install finished but drawio-ai was not found. Check your global bin dir (${gbin:-unknown}) and PATH."
fi

# shellcheck disable=SC2086
[ "$skill" = 0 ] || run "$cli" $skillcmd
run "$cli" root >/dev/null
printf 'drawio-ai-kit installed.\n'

// install.mjs — impure orchestrator + entry point for the multi-agent installer
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import {
  MCP_NAME,
  CANONICAL_DIR,
  SKILL_NAME,
  MCP_SERVER_MJS,
  AGENT_REGISTRY,
  mcpPayload,
  claudeCodeAddCommand,
  resolveSource,
  detectAgents,
  mergeJsonServers,
  mergeTomlServers,
} from "./installer.mjs";

export async function orchestrate(io, opts = {}) {
  const { dryRun = false, mode, agents: optAgents } = opts;
  const actions = [];

  // 1. Prereq gate: Node >= 18
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 18) {
    io.log(`Error: Node ${process.versions.node} is too old; need >= 18.`);
    return { ok: false, reason: "node-too-old" };
  }

  // 2. Source resolution
  const hasMcpServer = io.exists("src/mcp-server.mjs");
  const pkg = io.readPkg ? io.readPkg() : { name: "" };
  const isClone = hasMcpServer && pkg.name === "drawio-ai-kit";
  const source = resolveSource(isClone);

  // 3. Detect agents (skipped when forced — keeps --dry-run --agents spawn-free)
  const present = optAgents ? [] : detectAgents(io.probe || { cmd: () => false, path: () => false });

  // 3b. No agents guard — bail before any prompt
  if (present.length === 0 && !optAgents) {
    io.log("No supported agents detected.");
    return { ok: false, reason: "no-agents" };
  }

  // 3c. Resolve backend mode (interactive only when not dry-run)
  let resolvedMode = mode;
  if (!resolvedMode && dryRun) resolvedMode = "mcp";
  else if (!resolvedMode && !dryRun) {
    const answer = await io.prompt("Backend mode", [
      { id: "mcp", label: "MCP (live tool-calling)" },
      { id: "cli", label: "CLI (fallback, no MCP config)" },
    ]);
    resolvedMode = Array.isArray(answer) ? answer[0] : (answer || "mcp");
  }

  // 4. Multi-select targets
  let selected;
  if (optAgents) {
    selected = optAgents;
  } else if (dryRun) {
    // dry-run is non-interactive: select all detected agents
    selected = present.map((a) => a.id);
  } else {
    const answer = await io.prompt("Select agents", present);
    selected = Array.isArray(answer) ? answer : [answer];
  }

  // fail-fast wrapper: bail loudly on non-zero exit instead of wiring MCP to a path
  // that skills never created (Bug A — exec exit code was silently ignored).
  const must = async (label, cmd, args, opts) => {
    const r = await io.exec(cmd, args, opts);
    if (r.code !== 0) {
      io.log(`✗ ${label} failed (exit ${r.code})${r.stderr ? `: ${r.stderr.trim()}` : ""}`);
      return false;
    }
    actions.push(opts?.cwd ? { cmd, args, cwd: opts.cwd } : { cmd, args });
    return true;
  };

  // 5. Place: global `skills add` stages the skill at CANONICAL_DIR and symlinks it into
  // every detected agent. Source MUST precede flags (yargs parsing) and `-a` MUST be omitted
  // — `-a <agents>` forces per-agent --copy and skips CANONICAL_DIR staging, which leaves MCP
  // pointed at a non-existent path.
  const nodeBin = process.execPath;
  const canonicalExists = io.exists(CANONICAL_DIR);
  const placeArgs = canonicalExists
    ? ["skills", "update", SKILL_NAME, "-g", "-y"]
    : ["skills", "add", source, "-g", "-y"];
  if (!(await must("place (skills)", "npx", placeArgs))) return { ok: false, reason: "place-failed" };

  // 6. npm install in canonical dir (skills copies sources but installs no node_modules)
  if (!(await must("install (npm)", "npm", ["install", "--silent"], { cwd: CANONICAL_DIR })))
    return { ok: false, reason: "install-failed" };

  // 7. Wire MCP (if resolvedMode !== 'cli')
  if (resolvedMode !== "cli") {
    const agentMap = new Map(AGENT_REGISTRY.map((a) => [a.id, a]));
    const payload = mcpPayload(nodeBin, CANONICAL_DIR);
    for (const agent of selected) {
      const info = agentMap.get(agent);
      if (agent === "claude-code") {
        // idempotent: clear any prior registration before re-adding (failure tolerated)
        await io.exec("claude", ["mcp", "remove", MCP_NAME, "--scope", "user"]);
        actions.push({ cmd: "claude", args: ["mcp", "remove", MCP_NAME, "--scope", "user"] });
        const claudeCmd = claudeCodeAddCommand(MCP_NAME, nodeBin, CANONICAL_DIR);
        if (!(await must("claude mcp add", claudeCmd.cmd, claudeCmd.args))) return { ok: false, reason: "wire-failed" };
      } else if (info?.kind === "json-mcp" && info.configPath) {
        const text = await io.readFile(info.configPath);
        const result = mergeJsonServers(text, MCP_NAME, payload);
        if (result.status === "recovered") {
          await io.writeFile(`${info.configPath}.bak`, text);
          io.log(`⚠ ${info.configPath} was malformed JSON — original backed up to ${info.configPath}.bak before rewriting.`);
        }
        await io.writeFile(info.configPath, result.text);
        actions.push({ write: info.configPath });
      } else if (info?.kind === "toml-mcp" && info.configPath) {
        const text = await io.readFile(info.configPath);
        const result = mergeTomlServers(text, MCP_NAME, payload);
        await io.writeFile(info.configPath, result.text);
        actions.push({ write: info.configPath });
      }
    }
  }

  // 8. Restart guidance — MCP servers & Skills load only at agent startup
  const restartLabels = selected.map((id) => {
    const info = AGENT_REGISTRY.find((a) => a.id === id);
    return info ? info.label : id;
  });
  const loaded = resolvedMode === "cli" ? "Skill" : "Skill + MCP server";
  io.log(`\n✓ Done. Restart: ${restartLabels.join(", ")} — the ${loaded} loads only at agent startup.`);
  return { ok: true, actions };
}

// --- io builder (exported so the dry-run side-effect-free contract is testable) ---
export function buildIo({ dryRun = false, agents } = {}) {
  return {
    exec: (cmd, execArgs, opts) =>
      new Promise((resolve) => {
        if (dryRun) {
          resolve({ code: 0, stdout: "", stderr: "" });
          return;
        }
        execFile(cmd, execArgs, { cwd: opts?.cwd, timeout: 120_000 }, (err, stdout, stderr) => {
          resolve({ code: err ? err.code ?? 1 : 0, stdout: stdout || "", stderr: stderr || "" });
        });
      }),
    readFile: (p) => fs.promises.readFile(p, "utf-8").catch(() => ""),
    writeFile: async (p, content) => {
      if (dryRun) return Promise.resolve();
      await fs.promises.mkdir(path.dirname(p), { recursive: true });
      return fs.promises.writeFile(p, content, "utf-8");
    },
    exists: (p) => fs.existsSync(p),
    readPkg: () => {
      try {
        return JSON.parse(fs.readFileSync("package.json", "utf-8"));
      } catch {
        return { name: "" };
      }
    },
    prompt: async (question, choices) => {
      if (choices.length === 1) return choices[0].id;
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const labels = choices.map((c, i) => `${i + 1}. ${c.label}`).join("\n");
      console.log(`\n${question}:\n${labels}`);
      const answer = await rl.question("\nEnter number(s) or comma-separated ids: ");
      rl.close();
      const picked = answer.trim().split(",").map((s) => s.trim());
      if (picked.length === 1 && /^\d+$/.test(picked[0])) {
        const idx = Number(picked[0]) - 1;
        if (idx >= 0 && idx < choices.length) return choices[idx].id;
      }
      return picked;
    },
    log: (msg) => console.log(msg),
    // In dry-run with no forced agents, pretend every agent is present so the
    // preview shows full wiring without spawning `which`/`where`.
    probe: (dryRun && !agents)
      ? { cmd: () => true, path: () => true }
      : {
          cmd: (name) => {
            try {
              execFileSync(process.platform === "win32" ? "where" : "which", [name], { stdio: "ignore" });
              return true;
            } catch {
              return false;
            }
          },
          path: (p) => fs.existsSync(p),
        },
  };
}

// --- Entry point ---
async function main() {
  const args = process.argv.slice(2);
  let dryRun = false;
  let mode;
  let agents;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") dryRun = true;
    else if (args[i] === "--mode") mode = args[++i];
    else if (args[i] === "--agents") agents = args[++i].split(",");
  }

  const io = buildIo({ dryRun, agents });
  const result = await orchestrate(io, { dryRun, mode, agents });
  if (!result.ok) {
    process.exit(1);
  }

  if (dryRun) {
    console.log("\nDry run — would execute:\n");
    for (const a of result.actions) {
      if (a.write) {
        console.log(`  write → ${a.write}`);
      } else {
        const cwd = a.cwd ? ` (cwd: ${a.cwd})` : "";
        console.log(`  ${a.cmd} ${(a.args || []).join(" ")}${cwd}`);
      }
    }
  }
}


// Only run main when executed directly (not when imported for testing)
if (process.argv[1] && new URL(process.argv[1], `file://${process.cwd()}/`).href === import.meta.url) {
  await main();
}

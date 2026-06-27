// install.mjs — impure orchestrator + entry point for the multi-agent installer
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import { createInterface } from "node:readline/promises";
import {
  MCP_NAME,
  CANONICAL_DIR,
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

  // 3. Detect agents
  const present = detectAgents(io.probe || { cmd: () => false, path: () => false });

  // 3b. No agents guard
  if (present.length === 0 && !optAgents) {
    io.log("No supported agents detected.");
    return { ok: false, reason: "no-agents" };
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

  // 5. Place: npx skills add
  const nodeBin = process.execPath;
  await io.exec("npx", ["skills", "add", "-g", "-a", selected.join(","), source]);
  actions.push({ cmd: "npx", args: ["skills", "add", "-g", "-a", selected.join(","), source] });

  // 6. npm install in canonical dir
  await io.exec("npm", ["install", "--silent"], { cwd: CANONICAL_DIR });
  actions.push({ cmd: "npm", args: ["install", "--silent"], cwd: CANONICAL_DIR });

  // 7. Wire MCP (if mode !== 'cli')
  if (mode !== "cli") {
    const agentMap = new Map(AGENT_REGISTRY.map((a) => [a.id, a]));
    const payload = mcpPayload(nodeBin, CANONICAL_DIR);
    for (const agent of selected) {
      const info = agentMap.get(agent);
      if (agent === "claude-code") {
        const claudeCmd = claudeCodeAddCommand(MCP_NAME, nodeBin, CANONICAL_DIR);
        await io.exec(claudeCmd.cmd, claudeCmd.args);
        actions.push({ cmd: claudeCmd.cmd, args: claudeCmd.args });
      } else if (info?.kind === "json-mcp" && info.configPath) {
        const text = await io.readFile(info.configPath);
        const result = mergeJsonServers(text, MCP_NAME, payload);
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

  return { ok: true, actions };
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

  const io = {
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
    writeFile: (p, content) => {
      if (dryRun) return Promise.resolve();
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
    probe: {
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


  // In dry-run mode, override probe so all registered agents appear present
  // (preview full wiring without requiring the actual binaries on PATH)
  if (dryRun && !agents) {
    io.probe = { cmd: () => true, path: () => true };
  }

  const result = await orchestrate(io, { dryRun, mode, agents });
  if (!result.ok) {
    process.exit(1);
  }

  if (dryRun) {
    console.log("\nDry run — would execute:\n");
    for (const a of result.actions) {
      const cwd = a.cwd ? ` (cwd: ${a.cwd})` : "";
      console.log(`  ${a.cmd} ${a.args.join(" ")}${cwd}`);
    }
  }
}


// Only run main when executed directly (not when imported for testing)
if (process.argv[1] && new URL(process.argv[1], `file://${process.cwd()}/`).href === import.meta.url) {
  await main();
}

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import {
  buildAgentRegistry,
  mergeJsonServers,
  mergeTomlServers,
  MCP_NAME,
  CANONICAL_DIR,
  MCP_SERVER_MJS,
  mcpPayload,
  claudeCodeAddCommand,
  resolveSource,
  detectAgents,
} from "../src/installer.mjs";
import { orchestrate } from "../src/install.mjs";

test("mcpPayload builds { command, args } pointing at src/mcp-server.mjs in canonical dir", () => {
  const nodeBin = "/usr/bin/node";
  const result = mcpPayload(nodeBin, CANONICAL_DIR);
  assert.equal(result.command, nodeBin);
  assert.deepEqual(result.args, [path.join(CANONICAL_DIR, MCP_SERVER_MJS)]);
});

test("claudeCodeAddCommand argv is ['mcp','add',name,'--scope','user','--',node,mjs]", () => {
  const nodeBin = "/usr/bin/node";
  const result = claudeCodeAddCommand(MCP_NAME, nodeBin, CANONICAL_DIR);
  assert.equal(result.cmd, "claude");
  assert.deepEqual(result.args, [
    "mcp", "add", MCP_NAME, "--scope", "user", "--",
    nodeBin, path.join(CANONICAL_DIR, MCP_SERVER_MJS),
  ]);
});

test("resolveSource returns '.' in a clone, slug otherwise", () => {
  assert.equal(resolveSource(true), ".");
  assert.equal(resolveSource(false), "sparklabx/drawio-ai-kit");
});

test("detectAgents returns Claude Code when claude is present, empty otherwise", () => {
  const fakeHome = path.join(os.tmpdir(), "drawio-no-config-here");
  const registry = buildAgentRegistry(fakeHome);
  const present = detectAgents({ cmd: (n) => n === "claude", path: () => false }, registry);
  assert.equal(present.length, 1);
  assert.equal(present[0].id, "claude-code");
  assert.equal(present[0].kind, "claude-cli");

  const absent = detectAgents({ cmd: () => false, path: () => false }, registry);
  assert.equal(absent.length, 0);
});

test("dry-run orchestrate records 3 expected Claude Code MCP actions, no writes, no real exec", async () => {
  const fakeHome = path.join(os.tmpdir(), `drawio-test-${process.pid}`);
  const nodeBin = process.execPath;
  const mjsPath = path.join(CANONICAL_DIR, MCP_SERVER_MJS);
  const actions = [];
  const writes = [];

  const io = {
    exec: async (cmd, args, opts) => {
      actions.push({ cmd, args, cwd: opts?.cwd });
      return { code: 0, stdout: "", stderr: "" };
    },
    readFile: async () => "",
    writeFile: async (p, content) => writes.push({ p, content }),
    exists: (p) => p === "src/mcp-server.mjs",
    prompt: async () => "claude-code",
    log: () => {},
    readPkg: () => ({ name: "drawio-ai-kit" }),
  };

  const result = await orchestrate(io, { dryRun: true, mode: "mcp", agents: ["claude-code"] });

  assert.equal(result.ok, true);
  assert.equal(actions.length, 3);

  // 1) npx skills add -g -a claude-code .
  assert.equal(actions[0].cmd, "npx");
  assert.deepEqual(actions[0].args.slice(0, 4), ["skills", "add", "-g", "-a"]);
  assert.ok(actions[0].args[4].includes("claude-code"), "skills add targets claude-code");

  // 2) npm install --silent in canonical dir
  assert.equal(actions[1].cmd, "npm");
  assert.deepEqual(actions[1].args, ["install", "--silent"]);
  assert.equal(actions[1].cwd, CANONICAL_DIR);

  // 3) claude mcp add drawio-ai-kit --scope user -- <node> <mjs>
  assert.equal(actions[2].cmd, "claude");
  assert.deepEqual(actions[2].args, [
    "mcp", "add", MCP_NAME, "--scope", "user", "--", nodeBin, mjsPath,
  ]);

  // No writes, no real fs touches
  assert.equal(writes.length, 0, "dry-run must not write config files");
});

test("orchestrate returns {ok:false,reason:'no-agents'} when no agents detected and none forced", async () => {
  const logs = [];
  const io = {
    exec: async () => ({ code: 0, stdout: "", stderr: "" }),
    readFile: async () => "",
    writeFile: async () => {},
    exists: () => true,
    prompt: async () => { throw new Error("prompt should not be called"); },
    log: (msg) => logs.push(msg),
    readPkg: () => ({ name: "drawio-ai-kit" }),
    probe: { cmd: () => false, path: () => false },
  };

  const result = await orchestrate(io, {});
  assert.equal(result.ok, false);
  assert.equal(result.reason, "no-agents");
  assert.ok(logs.some((m) => m.includes("No supported agents detected")));
});

test("dry-run with no optAgents selects all detected agents, never calls prompt", async () => {
  const actions = [];
  const prompted = { called: false };
  const io = {
    exec: async (cmd, args, opts) => {
      actions.push({ cmd, args, cwd: opts?.cwd });
      return { code: 0, stdout: "", stderr: "" };
    },
    readFile: async () => "",
    writeFile: async () => {},
    exists: () => true,
    prompt: async () => { prompted.called = true; throw new Error("prompt must not be called in dry-run"); },
    log: () => {},
    readPkg: () => ({ name: "drawio-ai-kit" }),
    probe: { cmd: (name) => name === "claude", path: () => false },
  };

  const result = await orchestrate(io, { dryRun: true, mode: "mcp" });
  assert.equal(result.ok, true);
  assert.equal(prompted.called, false, "dry-run must not call prompt");
  assert.ok(actions.length >= 3, "should have at least the 3 expected actions");
  // skills add should include claude-code
  assert.ok(actions[0].args[4].includes("claude-code"), "dry-run auto-selects claude-code");
});

// --- #5: mergeJsonServers ---

test("mergeJsonServers adds name into {}, status 'created'", () => {
  const result = mergeJsonServers("{}", "drawio-ai-kit", { command: "/usr/bin/node", args: ["/path/to/mcp.mjs"] });
  assert.equal(result.status, "created");
  const parsed = JSON.parse(result.text);
  assert.deepEqual(parsed.mcpServers["drawio-ai-kit"], { command: "/usr/bin/node", args: ["/path/to/mcp.mjs"] });
});

test("mergeJsonServers preserves existing mcpServers.other and top-level keys", () => {
  const input = JSON.stringify({ mcpServers: { other: { command: "x", args: ["y"] } }, topLevel: true });
  const result = mergeJsonServers(input, "drawio-ai-kit", { command: "n", args: ["m"] });
  const parsed = JSON.parse(result.text);
  assert.deepEqual(parsed.mcpServers.other, { command: "x", args: ["y"] });
  assert.equal(parsed.topLevel, true);
  assert.ok(parsed.mcpServers["drawio-ai-kit"]);
});

test("mergeJsonServers re-merging identical payload yields same bytes, no duplication", () => {
  const payload = { command: "/usr/bin/node", args: ["/path/to/mcp.mjs"] };
  const r1 = mergeJsonServers("{}", "drawio-ai-kit", payload);
  const r2 = mergeJsonServers(r1.text, "drawio-ai-kit", payload);
  assert.equal(r1.text, r2.text);
  assert.equal(r2.status, "updated");
});

test("mergeJsonServers updating existing name overwrites command/args cleanly", () => {
  const r1 = mergeJsonServers("{}", "drawio-ai-kit", { command: "/old/node", args: ["/old/mcp.mjs"] });
  const r2 = mergeJsonServers(r1.text, "drawio-ai-kit", { command: "/new/node", args: ["/new/mcp.mjs"] });
  const parsed = JSON.parse(r2.text);
  assert.equal(parsed.mcpServers["drawio-ai-kit"].command, "/new/node");
  assert.deepEqual(parsed.mcpServers["drawio-ai-kit"].args, ["/new/mcp.mjs"]);
});

test("mergeJsonServers recovers malformed text, status 'recovered'", () => {
  const result = mergeJsonServers("{not json", "drawio-ai-kit", { command: "n", args: ["m"] });
  assert.equal(result.status, "recovered");
  const parsed = JSON.parse(result.text);
  assert.ok(parsed.mcpServers["drawio-ai-kit"]);
});

test("mergeJsonServers treats empty/whitespace as {}", () => {
  const result = mergeJsonServers("   ", "drawio-ai-kit", { command: "n", args: ["m"] });
  assert.equal(result.status, "created");
  const parsed = JSON.parse(result.text);
  assert.ok(parsed.mcpServers["drawio-ai-kit"]);
});

test("dry-run orchestrate wires json-mcp agents with mergeJsonServers, records writes", async () => {
  const fakeHome = path.join(os.tmpdir(), `drawio-json-test-${process.pid}`);
  const registry = buildAgentRegistry(fakeHome);
  const writes = [];
  const actions = [];
  const nodeBin = process.execPath;
  const mjsPath = path.join(CANONICAL_DIR, MCP_SERVER_MJS);

  const io = {
    exec: async (cmd, args, opts) => { actions.push({ cmd, args, cwd: opts?.cwd }); return { code: 0, stdout: "", stderr: "" }; },
    readFile: async () => "",
    writeFile: async (p, content) => writes.push({ p, content }),
    exists: () => true,
    prompt: async () => "claude-desktop",
    log: () => {},
    readPkg: () => ({ name: "drawio-ai-kit" }),
  };

  const result = await orchestrate(io, { dryRun: true, mode: "mcp", agents: ["claude-desktop"] });
  assert.equal(result.ok, true);

  // Should have: skills add, npm install, 1 json write
  assert.equal(writes.length, 1, "should record 1 json config write");
  const write = writes[0];
  assert.ok(write.p.includes("claude_desktop_config.json"), "writes claude desktop config");
  const parsed = JSON.parse(write.content);
  assert.deepEqual(parsed.mcpServers["drawio-ai-kit"], { command: nodeBin, args: [mjsPath] });
});

// --- #6: mergeTomlServers ---

test("mergeTomlServers appends table into empty text", () => {
  const result = mergeTomlServers("", "drawio-ai-kit", { command: "/usr/bin/node", args: ["/path/mcp.mjs"] });
  assert.equal(result.status, "created");
  assert.ok(result.text.includes("[mcp_servers.drawio-ai-kit]"), "has table header");
  assert.ok(result.text.includes('command = "/usr/bin/node"'), "has command");
  assert.ok(result.text.includes('args = ["/path/mcp.mjs"]'), "has args");
});

test("mergeTomlServers replaces existing block idempotently", () => {
  const payload = { command: "/usr/bin/node", args: ["/path/mcp.mjs"] };
  const r1 = mergeTomlServers("", "drawio-ai-kit", payload);
  const r2 = mergeTomlServers(r1.text, "drawio-ai-kit", payload);
  assert.equal(r1.text, r2.text, "re-merge yields identical bytes");
  assert.equal(r2.status, "updated");
});

test("mergeTomlServers preserves other tables and top-level keys", () => {
  const input = 'key = "val"\n[mcp_servers.other]\ncommand = "x"\nargs = ["y"]\n';
  const result = mergeTomlServers(input, "drawio-ai-kit", { command: "n", args: ["m"] });
  assert.ok(result.text.includes('key = "val"'), "preserves top-level key");
  assert.ok(result.text.includes("[mcp_servers.other]"), "preserves other table");
  assert.ok(result.text.includes('command = "x"'), "preserves other table content");
  assert.ok(result.text.includes("[mcp_servers.drawio-ai-kit]"), "has new table");
});

test("mergeTomlServers output is valid TOML (key presence + args array)", () => {
  const result = mergeTomlServers("", "drawio-ai-kit", { command: "n", args: ["a", "b"] });
  const lines = result.text.split("\n");
  assert.ok(lines.some((l) => l.startsWith("command = ")), "has command key");
  // args should parse as TOML array: ["a", "b"]
  const argsMatch = result.text.match(/args = \[.*\]/);
  assert.ok(argsMatch, "has args array");
  assert.ok(argsMatch[0].includes('"a"') && argsMatch[0].includes('"b"'), "args contain values");
});

test("mergeTomlServers appends with blank-line separator when other tables exist", () => {
  const input = '[mcp_servers.other]\ncommand = "x"\n';
  const result = mergeTomlServers(input, "drawio-ai-kit", { command: "n", args: ["m"] });
  assert.ok(result.text.includes("\n\n[mcp_servers.drawio-ai-kit]"), "blank line before new table");
});

// --- #6 continued: orchestrate toml-mcp wiring ---

test("dry-run orchestrate wires toml-mcp agent (codex), records TOML write", async () => {
  const writes = [];
  const actions = [];
  const nodeBin = process.execPath;
  const mjsPath = path.join(CANONICAL_DIR, MCP_SERVER_MJS);

  const io = {
    exec: async (cmd, args, opts) => { actions.push({ cmd, args, cwd: opts?.cwd }); return { code: 0, stdout: "", stderr: "" }; },
    readFile: async () => "",
    writeFile: async (p, content) => writes.push({ p, content }),
    exists: () => true,
    prompt: async () => "codex",
    log: () => {},
    readPkg: () => ({ name: "drawio-ai-kit" }),
  };

  const result = await orchestrate(io, { dryRun: true, mode: "mcp", agents: ["codex"] });
  assert.equal(result.ok, true);

  assert.equal(writes.length, 1, "should record 1 toml config write");
  const write = writes[0];
  assert.ok(write.p.includes("config.toml"), "writes codex config.toml");
  assert.ok(write.content.includes("[mcp_servers.drawio-ai-kit]"), "has TOML table header");
  assert.ok(write.content.includes(`command = "${nodeBin}"`), "has command");
  assert.ok(write.content.includes(mjsPath), "has mjs path in args");
});

// --- #8: CLI mode toggle ---

test("dry-run CLI mode: zero MCP writes, placement + install still present", async () => {
  const writes = [];
  const execs = [];

  const io = {
    exec: async (cmd, args, opts) => { execs.push({ cmd, args, cwd: opts?.cwd }); return { code: 0, stdout: "", stderr: "" }; },
    readFile: async () => "",
    writeFile: async (p, content) => writes.push({ p, content }),
    exists: () => true,
    prompt: async () => "claude-code",
    log: () => {},
    readPkg: () => ({ name: "drawio-ai-kit" }),
  };

  const result = await orchestrate(io, { dryRun: true, mode: "cli", agents: ["claude-code"] });
  assert.equal(result.ok, true);
  assert.equal(writes.length, 0, "CLI mode should have zero MCP writes");

  // Placement + install still present
  assert.ok(execs.some((e) => e.args?.includes("skills") && e.args?.includes("add")), "has skills add");
  assert.ok(execs.some((e) => e.cmd === "npm"), "has npm install");

  // NO claude mcp add, NO json/toml writes
  assert.ok(!execs.some((e) => e.cmd === "claude"), "CLI mode should NOT run claude mcp add");
});

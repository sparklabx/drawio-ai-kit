import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import {
  buildAgentRegistry,
  mergeJsonServers,
  mergeTomlServers,
  MCP_NAME,
  CANONICAL_DIR,
  SKILL_NAME,
  MCP_SERVER_MJS,
  mcpPayload,
  claudeCodeAddCommand,
  resolveSource,
  detectAgents,
} from "../src/installer.mjs";
import { orchestrate, buildIo } from "../src/install.mjs";

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

test("dry-run orchestrate records Claude Code MCP path (place+install+remove+add), no writes", async () => {
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
  // Claude Code MCP path: npx add → npm install → claude mcp remove → claude mcp add

  // 1) npx skills add <source> -g -y  (source precedes flags; -a is omitted — it forces
  //    per-agent --copy and defeats CANONICAL_DIR staging, leaving MCP pointed nowhere)
  assert.equal(actions[0].cmd, "npx");
  assert.deepEqual(actions[0].args.slice(0, 2), ["skills", "add"]);
  assert.ok(actions[0].args.includes("-g"), "global flag present");
  assert.ok(!actions[0].args.includes("-a"), "-a must be omitted (defeats canonical staging)");

  // 2) npm install --silent in canonical dir
  assert.equal(actions[1].cmd, "npm");
  assert.deepEqual(actions[1].args, ["install", "--silent"]);
  assert.equal(actions[1].cwd, CANONICAL_DIR);

  // 3) claude mcp remove (idempotent) then claude mcp add drawio-ai-kit --scope user -- <node> <mjs>
  const claudeSubs = actions.filter((a) => a.cmd === "claude").map((a) => a.args[1]);
  assert.ok(claudeSubs.indexOf("remove") < claudeSubs.indexOf("add"), "remove before add");
  const addCmd = actions.find((a) => a.cmd === "claude" && a.args[1] === "add");
  assert.deepEqual(addCmd.args, [
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
    exists: (p) => p === "src/mcp-server.mjs",
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
  // place is global add (no -a); detected claude-code got MCP-wired; prompt never called
  assert.ok(actions[0].args.includes("-g") && !actions[0].args.includes("-a"), "global add, no -a");
  assert.ok(actions.some((a) => a.cmd === "claude"), "detected claude-code got MCP-wired");
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

test("mergeTomlServers emits command key + args array", () => {
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
    exists: (p) => p === "src/mcp-server.mjs",
    prompt: async () => "claude-code",
    log: () => {},
    readPkg: () => ({ name: "drawio-ai-kit" }),
  };

  const result = await orchestrate(io, { dryRun: true, mode: "cli", agents: ["claude-desktop"] });
  assert.equal(result.ok, true);
  assert.equal(writes.length, 0, "CLI mode should have zero MCP writes");

  // Placement + install still present
  assert.ok(execs.some((e) => e.args?.includes("skills") && e.args?.includes("add")), "has skills add");
  assert.ok(execs.some((e) => e.cmd === "npm"), "has npm install");

  // NO claude mcp add, NO json/toml writes
  assert.ok(!execs.some((e) => e.cmd === "claude"), "CLI mode should NOT run claude mcp add");
});

// --- Fix A: printer crash on write actions ---

test("dry-run json-mcp action has {write} shape, no .cmd/.args that would crash printer", async () => {
  const io = {
    exec: async () => ({ code: 0, stdout: "", stderr: "" }),
    readFile: async () => "",
    writeFile: async () => {},
    exists: () => true,
    prompt: async () => "claude-desktop",
    log: () => {},
    readPkg: () => ({ name: "drawio-ai-kit" }),
  };

  const result = await orchestrate(io, { dryRun: true, mode: "mcp", agents: ["claude-desktop"] });
  assert.equal(result.ok, true);

  const writeAction = result.actions.find((a) => a.write);
  assert.ok(writeAction, "should have at least one write action");
  assert.equal(writeAction.cmd, undefined, "write action must not have .cmd");
  assert.equal(writeAction.args, undefined, "write action must not have .args");
  assert.ok(typeof writeAction.write === "string", "write action must have .write as string");

  // Simulate the printer loop — must not crash
  let printed = "";
  for (const a of result.actions) {
    if (a.write) printed += `write → ${a.write}\n`;
    else printed += `${a.cmd} ${(a.args || []).join(" ")}\n`;
  }
  assert.ok(printed.includes("write →"), "printer produces write→ line");
});

// --- #8 continued: interactive mode prompt ---

test("non-dry-run with mode unset prompts for backend mode", async () => {
  let prompted = false;
  let promptQuestion = "";
  const io = {
    exec: async () => ({ code: 0, stdout: "", stderr: "" }),
    readFile: async () => "",
    writeFile: async () => {},
    exists: () => true,
    prompt: async (q, choices) => { prompted = true; promptQuestion = q; return "mcp"; },
    log: () => {},
    readPkg: () => ({ name: "drawio-ai-kit" }),
  };

  await orchestrate(io, { dryRun: false, agents: ["claude-code"] });
  assert.equal(prompted, true, "should prompt for backend mode when mode unset and not dryRun");
  assert.ok(promptQuestion.includes("Backend mode"), "prompt question should mention Backend mode");
});

test("dry-run with mode unset does NOT prompt, defaults to mcp", async () => {
  let prompted = false;
  const io = {
    exec: async () => ({ code: 0, stdout: "", stderr: "" }),
    readFile: async () => "",
    writeFile: async () => {},
    exists: () => true,
    prompt: async (q, choices) => { prompted = true; return "claude-code"; },
    log: () => {},
    readPkg: () => ({ name: "drawio-ai-kit" }),
  };

  const result = await orchestrate(io, { dryRun: true, agents: ["claude-code"] });
  assert.equal(result.ok, true);
  // Should have prompted for agents (not backend mode) and taken mcp path
  assert.equal(prompted, false, "dry-run should NOT prompt for backend mode");
  // claude-code selected → claude mcp add should be in actions (mcp mode default)
  assert.ok(result.actions.some((a) => a.cmd === "claude"), "dry-run defaults to mcp mode");
});

// --- #9: idempotent re-runs + restart guidance ---

test("#9 place step runs 'npx skills update' when canonical dir already exists", async () => {
  const execs = [];
  const io = {
    exec: async (cmd, args, opts) => { execs.push({ cmd, args, cwd: opts?.cwd }); return { code: 0, stdout: "", stderr: "" }; },
    readFile: async () => "", writeFile: async () => {},
    exists: (p) => p === "src/mcp-server.mjs" || p === CANONICAL_DIR,
    prompt: async () => { throw new Error("no prompt in dry-run"); },
    log: () => {}, readPkg: () => ({ name: "drawio-ai-kit" }),
  };
  await orchestrate(io, { dryRun: true, mode: "mcp", agents: ["claude-code"] });
  const place = execs.find((e) => e.cmd === "npx");
  assert.deepEqual(place.args, ["skills", "update", SKILL_NAME, "-g", "-y"], "canonical present → skills update -g");
});

test("#9 place step runs 'npx skills add' on first install (canonical absent)", async () => {
  const execs = [];
  const io = {
    exec: async (cmd, args, opts) => { execs.push({ cmd, args, cwd: opts?.cwd }); return { code: 0, stdout: "", stderr: "" }; },
    readFile: async () => "", writeFile: async () => {},
    exists: (p) => p === "src/mcp-server.mjs",
    prompt: async () => { throw new Error("no prompt"); },
    log: () => {}, readPkg: () => ({ name: "drawio-ai-kit" }),
  };
  await orchestrate(io, { dryRun: true, mode: "mcp", agents: ["claude-code"] });
  const place = execs.find((e) => e.cmd === "npx");
  assert.deepEqual(place.args.slice(0, 2), ["skills", "add"]);
  assert.ok(place.args.includes("-g") && !place.args.includes("-a"), "global add, source-first, no -a");
});

test("#9 claude-code runs 'claude mcp remove' before 'add'", async () => {
  const execs = [];
  const io = {
    exec: async (cmd, args, opts) => { execs.push({ cmd, args: args || [], cwd: opts?.cwd }); return { code: 0, stdout: "", stderr: "" }; },
    readFile: async () => "", writeFile: async () => {},
    exists: (p) => p === "src/mcp-server.mjs",
    prompt: async () => { throw new Error("no prompt"); },
    log: () => {}, readPkg: () => ({ name: "drawio-ai-kit" }),
  };
  await orchestrate(io, { dryRun: true, mode: "mcp", agents: ["claude-code"] });
  const sub = execs.filter((e) => e.cmd === "claude").map((e) => e.args[1]);
  assert.ok(sub.includes("remove"), "runs claude mcp remove");
  assert.ok(sub.includes("add"), "runs claude mcp add");
  assert.ok(sub.indexOf("remove") < sub.indexOf("add"), "remove before add");
});

test("#9 logs a restart guidance notice on success", async () => {
  const logs = [];
  const io = {
    exec: async () => ({ code: 0, stdout: "", stderr: "" }),
    readFile: async () => "", writeFile: async () => {},
    exists: (p) => p === "src/mcp-server.mjs",
    prompt: async () => { throw new Error("no prompt"); },
    log: (m) => logs.push(m), readPkg: () => ({ name: "drawio-ai-kit" }),
  };
  await orchestrate(io, { dryRun: true, mode: "mcp", agents: ["claude-code"] });
  assert.ok(logs.some((m) => /restart/i.test(m)), "should log a restart notice");
});

test("#9 re-running is idempotent: 2nd run writes byte-identical config, no duplicate table", async () => {
  const store = new Map();
  const mkIo = () => ({
    exec: async () => ({ code: 0, stdout: "", stderr: "" }),
    readFile: async (p) => store.get(p) ?? "",
    writeFile: async (p, c) => { store.set(p, c); },
    exists: (p) => p === "src/mcp-server.mjs",
    prompt: async () => { throw new Error("no prompt"); },
    log: () => {}, readPkg: () => ({ name: "drawio-ai-kit" }),
  });
  const opts = { dryRun: true, mode: "mcp", agents: ["codex"] };
  await orchestrate(mkIo(), opts);
  const first = [...store.values()].join("");
  await orchestrate(mkIo(), opts);
  const second = [...store.values()].join("");
  assert.equal(first, second, "re-run must not drift");
  const tables = (second.match(/\[mcp_servers\.drawio-ai-kit\]/g) || []).length;
  assert.equal(tables, 1, "exactly one drawio-ai-kit table after re-run");
});

// --- review fixes: B1 (recover backup), I2 (buildIo dry-run), N4 (remove-failure) ---

test("B1: malformed JSON config is backed up (.bak) and logged before rewrite", async () => {
  const writes = [];
  const logs = [];
  const malformed = "{ not valid json ,";
  const io = {
    exec: async () => ({ code: 0, stdout: "", stderr: "" }),
    readFile: async () => malformed,
    writeFile: async (p, c) => writes.push({ p, c }),
    exists: (p) => p === "src/mcp-server.mjs",
    prompt: async () => { throw new Error("no prompt"); },
    log: (m) => logs.push(m), readPkg: () => ({ name: "drawio-ai-kit" }),
  };
  await orchestrate(io, { dryRun: true, mode: "mcp", agents: ["claude-desktop"] });
  const bak = writes.find((w) => w.p.endsWith(".bak"));
  assert.ok(bak, "writes a .bak backup");
  assert.equal(bak.c, malformed, ".bak preserves the original malformed content");
  assert.ok(logs.some((m) => /malformed JSON.*backed up/.test(m)), "logs the recovery");
  const rewritten = writes.find((w) => !w.p.endsWith(".bak"));
  assert.ok(JSON.parse(rewritten.c).mcpServers["drawio-ai-kit"], "rewritten config has our server");
});

test("I2: buildIo dry-run io is side-effect-free (exec short-circuits, writeFile no-ops, probe overridden)", async () => {
  const io = buildIo({ dryRun: true });
  // exec must NOT spawn a real binary — a nonexistent cmd resolves code:0 only if short-circuited
  const r = await io.exec("drawio-nonexistent-cmd-xyz", ["--flag"]);
  assert.equal(r.code, 0, "dry-run exec short-circuits without spawning");
  // writeFile must not touch disk
  const tmp = path.join(os.tmpdir(), `drawio-buildio-${process.pid}.json`);
  await io.writeFile(tmp, "should-not-be-written");
  assert.equal(fs.existsSync(tmp), false, "dry-run writeFile is a no-op");
  // probe overridden to report all agents present (no `which` spawn)
  assert.equal(io.probe.cmd("anything"), true);
  assert.equal(io.probe.path("anything"), true);
});

test("N4: claude mcp remove failure is tolerated (add still runs, result ok)", async () => {
  const execs = [];
  const io = {
    exec: async (cmd, args, opts) => {
      const code = (cmd === "claude" && args[1] === "remove") ? 1 : 0;
      execs.push({ cmd, args: args || [], code });
      return { code, stdout: "", stderr: "" };
    },
    readFile: async () => "", writeFile: async () => {},
    exists: (p) => p === "src/mcp-server.mjs",
    prompt: async () => { throw new Error("no prompt"); },
    log: () => {}, readPkg: () => ({ name: "drawio-ai-kit" }),
  };
  const result = await orchestrate(io, { dryRun: true, mode: "mcp", agents: ["claude-code"] });
  assert.equal(result.ok, true, "remove failure must not abort");
  const subs = execs.filter((e) => e.cmd === "claude").map((e) => e.args[1]);
  assert.ok(subs.includes("remove") && subs.includes("add"), "both remove and add ran");
});

// --- Bug A: orchestrate must fail fast on non-zero exit (was silently ignored → MCP wired to nowhere) ---

test("Bug A: skills add failure (exit 1) aborts before npm install + wiring", async () => {
  const execs = [];
  const io = {
    exec: async (cmd, args, opts) => { execs.push({ cmd, args, cwd: opts?.cwd }); return { code: 1, stdout: "", stderr: "boom" }; },
    readFile: async () => "", writeFile: async () => {},
    exists: (p) => p === "src/mcp-server.mjs",
    prompt: async () => { throw new Error("no prompt"); },
    log: () => {}, readPkg: () => ({ name: "drawio-ai-kit" }),
  };
  const result = await orchestrate(io, { dryRun: true, mode: "mcp", agents: ["claude-code"] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "place-failed");
  assert.ok(execs.some((e) => e.cmd === "npx"), "place attempted");
  assert.ok(!execs.some((e) => e.cmd === "npm"), "npm install must not run after place failure");
  assert.ok(!execs.some((e) => e.cmd === "claude"), "MCP wiring must not run after place failure");
});

test("Bug A: npm install failure (exit 1) aborts before wiring", async () => {
  const execs = [];
  const io = {
    exec: async (cmd, args, opts) => {
      execs.push({ cmd, args, cwd: opts?.cwd });
      const code = cmd === "npm" ? 1 : 0;
      return { code, stdout: "", stderr: cmd === "npm" ? "npm err" : "" };
    },
    readFile: async () => "", writeFile: async () => {},
    exists: (p) => p === "src/mcp-server.mjs",
    prompt: async () => { throw new Error("no prompt"); },
    log: () => {}, readPkg: () => ({ name: "drawio-ai-kit" }),
  };
  const result = await orchestrate(io, { dryRun: true, mode: "mcp", agents: ["claude-code"] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "install-failed");
  assert.ok(execs.some((e) => e.cmd === "npx"), "place succeeded");
  assert.ok(execs.some((e) => e.cmd === "npm"), "npm install attempted");
  assert.ok(!execs.some((e) => e.cmd === "claude"), "wiring must not run after install failure");
});

// --- Bug B: writeFile must create parent dirs (skills does not pre-create ~/.cursor etc.) ---

test("Bug B: buildIo writeFile creates nested parent dirs before writing", async () => {
  const io = buildIo({ dryRun: false });
  const nested = path.join(os.tmpdir(), `drawio-bugb-${process.pid}`, "deep", "nest", "mcp.json");
  await io.writeFile(nested, '{"hello":1}');
  assert.equal(fs.existsSync(nested), true, "nested file written");
  assert.deepEqual(JSON.parse(fs.readFileSync(nested, "utf-8")), { hello: 1 });
  fs.rmSync(path.dirname(path.dirname(path.dirname(nested))), { recursive: true, force: true });
});

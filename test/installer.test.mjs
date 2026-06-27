import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import {
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
  const present = detectAgents({ cmd: () => true, path: () => false });
  assert.equal(present.length, 1);
  assert.equal(present[0].id, "claude-code");
  assert.equal(present[0].kind, "claude-cli");

  const absent = detectAgents({ cmd: () => false, path: () => false });
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

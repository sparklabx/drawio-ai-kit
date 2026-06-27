// installer.mjs — pure tested writers/resolvers/detector for the multi-agent installer
import os from "node:os";
import path from "node:path";

export const MCP_NAME = "drawio-ai-kit";
export const SKILL_NAME = "drawio-aws-architect";
export const CANONICAL_DIR = path.join(os.homedir(), ".agents", "skills", "drawio-aws-architect");
export const MCP_SERVER_MJS = "src/mcp-server.mjs";

export function mcpPayload(nodeBin, canonicalDir) {
  return { command: nodeBin, args: [path.join(canonicalDir, MCP_SERVER_MJS)] };
}

export function claudeCodeAddCommand(name, nodeBin, canonicalDir) {
  return {
    cmd: "claude",
    args: ["mcp", "add", name, "--scope", "user", "--", nodeBin, path.join(canonicalDir, MCP_SERVER_MJS)],
  };
}

export function resolveSource(isClone) {
  return isClone ? "." : "sparklabx/drawio-ai-kit";
}

const DEFAULT_HOME = os.homedir();

export function buildAgentRegistry(home = DEFAULT_HOME) {
  return [
    { id: "claude-code", label: "Claude Code", kind: "claude-cli", present: (probe) => probe.cmd("claude") },
    { id: "claude-desktop", label: "Claude Desktop", kind: "json-mcp", configPath: path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"), present: (probe, cp) => probe.path(cp) },
    { id: "gemini-cli", label: "Gemini CLI", kind: "json-mcp", configPath: path.join(home, ".gemini", "settings.json"), present: (probe, cp) => probe.path(cp) || probe.cmd("gemini") },
    { id: "cursor", label: "Cursor", kind: "json-mcp", configPath: path.join(home, ".cursor", "mcp.json"), present: (probe, cp) => probe.path(cp) || probe.cmd("cursor") },
  ];
}

export const AGENT_REGISTRY = buildAgentRegistry();

export function detectAgents(probe, registry = AGENT_REGISTRY) {
  return registry.filter((a) => a.present(probe, a.configPath)).map(({ id, label, kind, configPath }) => ({ id, label, kind, configPath }));
}


export function mergeJsonServers(text, name, payload) {
  let obj = {};
  let recovered = false;
  const trimmed = (text ?? "").trim();
  if (trimmed === "") {
    // empty/whitespace → {}
  } else {
    try { obj = JSON.parse(trimmed); } catch { obj = {}; recovered = true; }
  }
  if (!obj.mcpServers) obj.mcpServers = {};
  const isNew = !obj.mcpServers[name];
  obj.mcpServers[name] = payload;
  const status = recovered ? "recovered" : isNew ? "created" : "updated";
  return { text: JSON.stringify(obj, null, 2), status };
}

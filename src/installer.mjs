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

export const AGENT_REGISTRY = [
  { id: "claude-code", label: "Claude Code", kind: "claude-cli", present: (probe) => probe.cmd("claude") },
];

export function detectAgents(probe) {
  return AGENT_REGISTRY.filter((a) => a.present(probe)).map(({ id, label, kind }) => ({ id, label, kind }));
}

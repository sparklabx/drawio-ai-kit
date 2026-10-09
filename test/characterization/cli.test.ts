// Golden snapshots of every CLI command (stdout JSON/text + exit code), run against dist/cli.mjs.
// Search *ranking* lives in search.test.ts (it is expected to move when search is reimplemented).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { ROOT, fakeDrawio, makeTmp, normalizeKitImport, parseOut, runCli, sha256, snapshotFile } from "./_helpers.ts";

const match = snapshotFile("cli");
const tmp = makeTmp("charac-cli");
const run = (args: string[], opts: Record<string, any> = {}) => runCli(args, { tmp, ...opts });
const result = (r: any) => ({ status: r.status, stdout: parseOut(r.stdout), stderr: r.stderr });

const GOOD_XML = (() => {
  // a known-good diagram, produced by the kit itself (vpc example via scaffold)
  const s = run(["scaffold", "aws/build_vpc.mjs", "-o", join(tmp, "good", "build_vpc.mjs")]);
  assert.equal(s.status, 0, s.stderr);
  spawnSync(process.execPath, [join(tmp, "good", "build_vpc.mjs")], { cwd: tmp, env: { PATH: join(tmp, "emptybin") } });
  return readFileSync(join(tmp, "good", "vpc_multiaz_kit.drawio"), "utf8");
})();
const BAD_XML = `<mxfile><diagram name="P" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>` +
  `<mxCell id="a" value="A" style="shape=mxgraph.aws4.nonexistent_thing;" vertex="1" parent="1"><mxGeometry x="10" y="10" width="78" height="78" as="geometry"/></mxCell>` +
  `<mxCell id="a" value="dup" vertex="1" parent="1"><mxGeometry x="10" y="10" width="78" height="78" as="geometry"/></mxCell>` +
  `<mxCell id="e1" edge="1" source="a" target="zzz" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>` +
  `</root></mxGraphModel></diagram></mxfile>`;
const body = (xml: string) => xml.match(/<diagram[^>]*>([\s\S]*?)<\/diagram>/)![1];
const MULTI_XML = `<mxfile><diagram name="Good" id="g">${body(GOOD_XML)}</diagram><diagram name="Bad" id="b">${body(BAD_XML)}</diagram></mxfile>`;
const file = (name: string, xml: string) => { const p = join(tmp, name); writeFileSync(p, xml); return p; };
const good = file("good.drawio", GOOD_XML);
const bad = file("bad.drawio", BAD_XML);
const multi = file("multi.drawio", MULTI_XML);

test("cli: usage / unknown command / missing-arg exits", () => {
  match("usage.none", result(run([])));
  match("usage.unknown", result(run(["bogus"])));
  for (const c of ["search", "validate", "audit", "suggest-layout", "suggest", "logo", "render"])
    match(`missing-arg.${c}`, result(run([c])));
  match("skill.no-install", result(run(["skill"])));
  match("style.missing", result(run(["style", "nope_not_here"])));
  match("principles.bad-mode", result(run(["principles", "--mode", "xx"])));
});

test("cli: root / style / categories / types", () => {
  match("root", result(run(["root"])));
  match("style.s3", result(run(["style", "s3"])));
  match("style.group_vpc", result(run(["style", "group_vpc"])));
  match("categories", result(run(["categories"])));
  match("types", result(run(["types"])));
});

test("cli: validate good / bad / strict / verbose / multi-tab", () => {
  match("validate.good", result(run(["validate", good])));
  match("validate.good.verbose", result(run(["validate", good, "--verbose"])));
  match("validate.good.strict", result(run(["validate", good, "--strict"])));
  match("validate.bad", result(run(["validate", bad])));
  match("validate.bad.strict", result(run(["validate", bad, "--strict"])));
  match("validate.multi", result(run(["validate", multi])));
});

test("cli: audit / suggest-layout", () => {
  match("audit.good", result(run(["audit", good])));
  match("audit.bad", result(run(["audit", bad])));
  match("suggest-layout.good", result(run(["suggest-layout", good])));
  match("suggest.bad", result(run(["suggest", bad])));
});

test("cli: workflow / principles text equals the skill docs it serves", () => {
  // The prose is docs (may be edited); the CLI contract is "serve these files, joined like this".
  const ref = (f: string) => readFileSync(join(ROOT, "skills", "drawio", "references", f), "utf8");
  const wf = run(["workflow"]);
  assert.equal(wf.status, 0);
  assert.equal(wf.stdout, readFileSync(join(ROOT, "skills", "drawio", "workflows", "build.md"), "utf8") + "\n");
  const SEP = "\n\n---\n\n";
  const expectBody = {
    aws: [ref("principles.md"), ref("aws-architecture.md"), ref("diagram-types.md"), ref("style-guide.md")].join(SEP),
    azure: [ref("azure-architecture.md"), ref("principles.md"), ref("diagram-types.md"), ref("style-guide.md")].join(SEP),
    gcp: [ref("gcp-architecture.md"), ref("principles.md"), ref("diagram-types.md"), ref("style-guide.md")].join(SEP),
    databricks: [ref("databricks-architecture.md"), ref("principles.md"), ref("diagram-types.md"), ref("style-guide.md")].join(SEP),
    bpmn: ref("bpmn.md") + "\n\n---\n\n## Shared layout principles (apply to BPMN too)\n" + ref("principles.md"),
  };
  const marker = "\n\n## Icon groups available in the catalog\n";
  const def = run(["principles"]);
  for (const mode of Object.keys(expectBody)) {
    const r = run(["principles", "--mode", mode]);
    assert.equal(r.status, 0, mode);
    assert.ok(r.stdout.startsWith(expectBody[mode as keyof typeof expectBody] + marker), `principles --mode ${mode} body`);
    // the category trailer is computed by code — snapshot it exactly
    match(`principles.${mode}.categories`, r.stdout.slice(expectBody[mode as keyof typeof expectBody].length + marker.length));
    if (mode === "aws") assert.equal(def.stdout, r.stdout, "default mode is aws");
  }
});

test("cli: scaffold --list / template / --name / not-found", () => {
  const list = run(["scaffold", "--list"]);
  // sorted: readdirSync order is OS/runtime dependent (node sorts on macOS APFS, bun returns raw order)
  match("scaffold.list", { status: list.status, lines: list.stdout.split("\n").filter(Boolean).sort() });
  match("scaffold.no-arg-equals-list", run(["scaffold"]).stdout === list.stdout);
  match("scaffold.not-found.bare", result(run(["scaffold", "build_nope.mjs"])));
  match("scaffold.not-found.path", result(run(["scaffold", "aws/build_nope.mjs"])));

  const o = join(tmp, "sc", "build_serverless.mjs");
  const r = run(["scaffold", "build_serverless.mjs", "-o", o]);
  match("scaffold.serverless.result", result(r));
  const src = normalizeKitImport(readFileSync(o, "utf8").split(ROOT).join("<ROOT>"));
  // structural facts that must survive any change of import style
  match("scaffold.serverless.structure", {
    kitImports: [...src.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]),
    hasSelfCheckTail: src.includes("Self-check tail (added by `drawio-ai scaffold`)"),
    hasValidateTail: src.includes('__exec("drawio-ai", ["validate"'),
    writes: [...src.matchAll(/new URL\("(\.\/[^"]+\.drawio)"/g)].map((m) => m[1]),
  });
  // exact normalized source (EXPECTED to change if scaffold switches to one bare-package import)
  match("scaffold.serverless.source.sha256", sha256(src));

  const n = join(tmp, "sc2", "x.mjs");
  const rn = run(["scaffold", "aws/build_vpc.mjs", "--name", "shop", "-o", n]);
  match("scaffold.vpc.named.result", result(rn));
  match("scaffold.vpc.named.writes", [...readFileSync(n, "utf8").matchAll(/new URL\("(\.\/[^"]+\.drawio)"/g)].map((m) => m[1]));

  // default output path = cwd/<template file name>
  const cwd = join(tmp, "cwd");
  mkdirSync(cwd);
  match("scaffold.default-out", result(runCli(["scaffold", "gcp/build_gcp_vpc.mjs"], { tmp, cwd })));
});

test("cli: render (fake draw.io binary) / --check / no drawio", () => {
  const { bin, argvFile } = fakeDrawio(tmp);
  const env = { DRAWIO_CLI: bin };
  const png = join(tmp, "out.png");
  match("render.default", result(run(["render", good, "-o", png], { env })));
  match("render.default.argv", readFileSync(argvFile, "utf8").split(tmp).join("<TMP>").split("\n"));
  match("render.check", result(run(["render", good, "--check", "-o", png], { env })));
  match("render.check.argv", readFileSync(argvFile, "utf8").split(tmp).join("<TMP>").split("\n"));
  match("render.check.bad", result(run(["render", bad, "--check", "-o", png], { env })));
  match("render.scale-page", result(run(["render", good, "--scale", "2", "--page", "3", "-o", png], { env })));
  match("render.scale-page.argv", readFileSync(argvFile, "utf8").split(tmp).join("<TMP>").split("\n"));
  match("render.implicit-out", result(run(["render", good], { env })));
});

test("cli: logo (python3 vendor script)", (t) => {
  const py = spawnSync("/bin/sh", ["-c", "command -v python3"], { encoding: "utf8" }).stdout.trim();
  if (!py) return t.skip("python3 not installed");
  const env = { PATH: dirname(py) };
  match("logo.openai", result(run(["logo", "openai"], { env })));
  match("logo.openai.mono", result(run(["logo", "openai", "--variant", "mono"], { env })));
});

// Multi-account IAM / cross-account access — type "hierarchy". Layout engine: NO hardcoded coords.
// An organization fans out to member accounts; a user signs in to the management account and
// assumes a cross-account role into the workload accounts.
import { writeFileSync } from "node:fs";
import { Diagram } from "../../src/builder.ts";
import { group, frame, icon, box, phantom, renderTree } from "../../src/layout-engine.ts";

const d = new Diagram("hierarchy");

const tree = phantom("root", "", { dir: "row", gap: 120, align: "top", header: 0, pad: 10 }, [
  phantom("orgside", "", { dir: "col", gap: 50, align: "center", header: 0 }, [
    icon("org", "organizations", "Example.com (AWS Organization)"),
    phantom("accts", "", { dir: "row", gap: 50, header: 0 }, [
      icon("dev", "organizations_account", "Dev / Test Account"),
      icon("prod", "organizations_account", "Production Account"),
    ]),
  ]),
  phantom("userside", "", { dir: "col", gap: 50, align: "center", header: 0 }, [
    box("user", "User", { w: 120, h: 56, fill: "#DAE8FC", stroke: "#6C8EBF", bold: true }),
    icon("mgmt", "organizations_management_account", "Management / Billing Account"),
  ]),
]);

renderTree(d, tree, [40, 90]);
d.title("Multi-account IAM — type: hierarchy (organization + cross-account assume-role)");

d.link("org", "dev", "", { dir: "TB", role: "fanout" });
d.link("org", "prod", "", { dir: "TB", role: "fanout" });
d.link("user", "mgmt", "IAM credentials", { dir: "TB" });
d.link("mgmt", "dev", "assume cross-account role", { dash: true });
d.link("mgmt", "prod", "assume cross-account role", { dash: true });

const res = d.validate();
console.log("VALIDATE:", JSON.stringify({ ok: res.ok, errors: res.errors, warnings: res.warnings, advice: res.audit.advice }));
writeFileSync(new URL("../../out/iam_accounts_kit.drawio", import.meta.url), d.mxfile("Multi-account IAM (hierarchy)"));

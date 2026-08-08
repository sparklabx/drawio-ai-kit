import assert from "node:assert/strict";
import test from "node:test";

import { validateAwsHierarchy } from "../src/core.mjs";

const group = (id, name, parent) =>
  `<mxCell id="${id}" value="${id}" style="shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.${name};" vertex="1" parent="${parent}"><mxGeometry x="0" y="0" width="600" height="400" as="geometry"/></mxCell>`;
const service = (id, name, parent) =>
  `<mxCell id="${id}" value="${id}" style="shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.${name};aspect=fixed;" vertex="1" parent="${parent}"><mxGeometry x="20" y="20" width="48" height="48" as="geometry"/></mxCell>`;
const root = (cells) => `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`;

test("accepts AWS services nested through Cloud, Account, and Region", () => {
  const xml = root([
    group("cloud", "group_aws_cloud_alt", "1"),
    group("account", "group_account", "cloud"),
    group("region", "group_region", "account"),
    service("bucket", "s3", "region"),
  ].join(""));

  assert.deepEqual(validateAwsHierarchy(xml), []);
});

test("warns when an AWS service is missing Cloud, Account, or Region parents", () => {
  const warnings = validateAwsHierarchy(root(service("fn", "lambda", "1")));

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /AWS Cloud → AWS Account → AWS Region/);
});

test("requires the black AWS Cloud container", () => {
  const warnings = validateAwsHierarchy(root([
    group("cloud", "group_aws_cloud", "1"),
    group("account", "group_account", "cloud"),
    group("region", "group_region", "account"),
    service("bucket", "s3", "region"),
  ].join(""))).join("\n");

  assert.match(warnings, /black AWS Cloud container group_aws_cloud_alt/);
  assert.match(warnings, /bucket.*AWS Cloud/);
});

test("accepts the full Security Group parent chain", () => {
  const xml = root([
    group("cloud", "group_aws_cloud_alt", "1"),
    group("account", "group_account", "cloud"),
    group("region", "group_region", "account"),
    group("vpc", "group_vpc", "region"),
    group("az", "group_availability_zone", "vpc"),
    group("subnet", "group_subnet", "az"),
    group("sg", "group_security_group", "subnet"),
    service("fn", "lambda", "sg"),
  ].join(""));

  assert.deepEqual(validateAwsHierarchy(xml), []);
});

test("warns when network containers skip required parents", () => {
  const xml = root([
    group("cloud", "group_aws_cloud_alt", "1"),
    group("account", "group_account", "cloud"),
    group("region", "group_region", "account"),
    group("vpc", "group_vpc", "region"),
    group("subnet", "group_subnet", "vpc"),
    group("sg", "group_security_group", "subnet"),
  ].join(""));
  const warnings = validateAwsHierarchy(xml).join("\n");

  assert.match(warnings, /subnet.*Availability Zone/i);
  assert.match(warnings, /sg.*Availability Zone/i);
});

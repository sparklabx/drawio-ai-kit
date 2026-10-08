# Workflow: diagram from an IaC repo (Terraform / Terramate)

Raw `.tf` files are mostly boilerplate. Reading them floods your context and makes you
guess resources that do not exist. Make an inventory first, then draw **only** from it.

## 1. Make the inventory

Run what applies (skip a command if the tool is not installed):

```bash
grep -rn '^resource\|^module\|^data' --include='*.tf' .   # every resource and module, one per line
terraform graph 2>/dev/null | grep -- '->' | head -200    # real dependency edges (needs terraform init)
terramate list --run-order 2>/dev/null                    # stack order (Terramate repos only)
```

## 2. Turn it into a list

Write a short list before drawing:

- **Containers**: accounts / projects / subscriptions, regions, VPCs/VNets, subnets.
- **Services**: one line per resource type that matters (skip IAM policies, random ids, outputs, locals).
- **Edges**: only from `terraform graph`, or from a resource clearly referencing another
  (e.g. `subnet_id = aws_subnet.private.id`).

## 3. Draw

Go back to `SKILL.md` Step 2 with this list as the request.

Rule: **anything not in the inventory does not go in the diagram.** If something is
needed to make sense (e.g. "Internet"), draw it as a plain `box` and mention it as an assumption.

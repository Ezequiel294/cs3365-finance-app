# Implementation notes

## Scope decisions

- The diagrams are authoritative. Backlog stories with no sequence diagram are omitted, including bank account balances, household sharing, device locking, push alerts, export/delete, bank APIs, and investment net worth that includes bank balances.
- `CUSTOM` budgets use the provided inclusive `startDate` and `endDate`. Weekly periods use the user's configured week start. This fills in a boundary detail not specified by the diagrams.
- Near-duplicate matching uses the documented same-day behavior for statements. The broader cross-source window was not numerically defined, so it remains a service-level extension point rather than guessing a window.
- The supplied redacted emails cannot pass live DKIM verification because their bodies were changed. Golden tests parse the templates directly; production ingest must verify a required DKIM domain before parsing.

## Deployment constraints

- The `FinanceAppB3Web` CDK construct removes `DistributionIdParameter` and `InvalidationPolicy`, and deletes the nextjs Lambda environment reference, because the constrained account cannot create SSM parameters.
- Raw import objects are private, encrypted with S3-managed encryption, and expire after 30 days. Bucket CORS starts with localhost development only; after the first web deployment, add the emitted CloudFront origin to the allow-list through a scoped infrastructure update if browser uploads require the deployed origin.
- No BCCR token or other secret is in code, environment files, test fixtures, or logs. Parameter names only are passed to Lambda.

## Validation record

Run `npm run typecheck`, `npm test`, `npm run build`, then the AWS-prefixed `npx cdk synth`. Inspect the output before deployment and confirm no `AWS::SSM::Parameter` appears in synthesized templates.

# One-Shot Runs

Each attempt branch (`attempt1`, `attempt2`, `attempt3`) is one round of code generation from
the diagrams merged into `main` at that point. Every round runs two agents, each with a
different model, from fresh context.

| Path | Contents |
|---|---|
| `agent-a/`, `agent-b/` | Identical copies of `docs/one-pagers/`, `docs/diagrams/`, and (from iteration 2) `docs/samples/`. Each agent builds the whole app inside its own directory. |
| `one-shot/prompt-agent-a.md`, `one-shot/prompt-agent-b.md` | The prompt given to each agent. They are identical except for the directory name and the stack prefix. |

## Running a round

1. Confirm the agent credentials work:
   `env AWS_CONFIG_FILE=/Users/keisynf/.finance-aws/config AWS_SHARED_CREDENTIALS_FILE=/Users/keisynf/.finance-aws/credentials AWS_PROFILE=finance-agent aws sts get-caller-identity`
   (in the Kiro sandbox, add `HOME=/Users/keisynf/.finance-aws` in front of `aws`; use
   absolute paths, because `HOME=$HOME/... AWS_CONFIG_FILE=$HOME/...` expands the second
   `$HOME` to the new value).
2. Make sure no build output from an earlier round is left in `agent-a/` or `agent-b/`
   (`node_modules/`, `cdk.out/`, `.next/` are ignored by git, so switching branches leaves
   them behind). Each directory must contain only the copied inputs.
3. Start agent A in a **new session** with its working directory set to `agent-a/`, and send
   the full text of `prompt-agent-a.md` as the first message. Do the same for agent B with
   `agent-b/` and `prompt-agent-b.md`. The two can run at the same time.
4. Do not answer questions or give hints during the run. If an agent stops early, reply only
   "Continue without asking. Record any assumption in IMPLEMENTATION_NOTES.md."
5. Record for the report: the agent and model, start and end time, and whether a nudge was
   needed.
6. Commit each agent's directory separately.

The runs must happen on Keisy's machine, because the prompt relies on the `finance-agent`
profile in `~/.finance-aws`.

## Starting the next round

1. Change the diagrams on a branch, open a PR into `main`, and merge it.
2. On the next attempt branch, merge `main`, then copy `docs/one-pagers/`,
   `docs/diagrams/`, and `docs/samples/` into fresh `agent-a/` and `agent-b/` directories.
3. Copy the prompts and change the iteration number and stack prefixes (`FinanceAppA3`,
   `FinanceAppB3`, and so on).

## Cleaning up

Destroy a round's stacks when they are no longer needed, with the same environment
variables: `npx cdk destroy --all` from that agent's directory. Tables with
`RemovalPolicy.RETAIN` stay behind and must be deleted from the DynamoDB console.

Deleting a web stack fails while `FinanceCdkExecutionPolicy` lacks
`application-autoscaling:*` (the cdk-nextjs cache table cannot be deregistered), and S3
refuses to delete a bucket that still holds objects. Empty the static-assets bucket first,
and retain the cache table on the retry if its deletion fails.

## Prompt changes per iteration

| Iteration | Change | Why |
|---|---|---|
| 2 | Inputs gain `samples/` and `bank-formats.md`; item 6 asks for the four real templates with golden tests | The design now specifies the BAC and Banco Nacional formats |
| 2 | Item 7 names Yahoo Finance and the optional Twelve Data key; SSM grants include `/FinanceApp/prices/*` | The design now chooses the price providers |
| 2 | Warning that `NextjsGlobalFunctions` creates an SSM parameter the deploy policy cannot create | Agent B's web stack failed on it in iteration 1 and got stuck in `DELETE_FAILED` |
| 2 | Long-running commands go to the background; no second deploy while one runs | Both iteration 1 agents had a deploy cut off by their tool's time limit |
| 2 | Absolute credential paths | `HOME=$HOME/... AWS_CONFIG_FILE=$HOME/...` broke agent B's `aws` CLI in iteration 1 |
| 2 | No `cdk destroy`; report a failed stack's status and error | Agent B left a failed stack and misreported its cause |
| 3 | The `NextjsGlobalFunctions` warning now gives the escape-hatch code that removes the SSM parameter, its policy, and its environment variable, and asks for a `cdk synth` check before the first deploy | Agent B's web stack failed on the same parameter again in iteration 2, because it deployed before removing it and its later fix left the references behind |

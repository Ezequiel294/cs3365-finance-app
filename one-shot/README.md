# One-Shot Runs

Each attempt branch (`attempt1`, `attempt2`, `attempt3`) is one round of code generation from
the diagrams merged into `main` at that point. Every round runs two agents, each with a
different model, from fresh context.

| Path | Contents |
|---|---|
| `agent-a/`, `agent-b/` | Identical copies of `docs/one-pagers/` and `docs/diagrams/` from `main`. Each agent builds the whole app inside its own directory. |
| `one-shot/prompt-agent-a.md`, `one-shot/prompt-agent-b.md` | The prompt given to each agent. They are identical except for the directory name and the stack prefix. |

## Running a round

1. Confirm the agent credentials work:
   `env AWS_CONFIG_FILE=$HOME/.finance-aws/config AWS_SHARED_CREDENTIALS_FILE=$HOME/.finance-aws/credentials AWS_PROFILE=finance-agent aws sts get-caller-identity`
   (in the Kiro sandbox, add `HOME=$HOME/.finance-aws` in front of `aws`).
2. Start agent A in a **new session** with its working directory set to `agent-a/`, and send
   the full text of `prompt-agent-a.md` as the first message. Do the same for agent B with
   `agent-b/` and `prompt-agent-b.md`. The two can run at the same time.
3. Do not answer questions or give hints during the run. If an agent stops early, reply only
   "Continue without asking. Record any assumption in IMPLEMENTATION_NOTES.md."
4. Record for the report: the agent and model, start and end time, and whether a nudge was
   needed.
5. Commit each agent's directory separately.

The runs must happen on Keisy's machine, because the prompt relies on the `finance-agent`
profile in `~/.finance-aws`.

## Starting the next round

1. Change the diagrams on a branch, open a PR into `main`, and merge it.
2. On the next attempt branch, merge `main`, then copy `docs/one-pagers/` and
   `docs/diagrams/` into fresh `agent-a/` and `agent-b/` directories.
3. Copy the prompts and change the iteration number and stack prefixes (`FinanceAppA2`,
   `FinanceAppB2`, and so on).

## Cleaning up

Destroy a round's stacks when they are no longer needed, with the same environment
variables: `npx cdk destroy --all` from that agent's directory. Tables with
`RemovalPolicy.RETAIN` stay behind and must be deleted from the DynamoDB console.

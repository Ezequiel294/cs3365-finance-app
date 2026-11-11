# Architecture

Personal AWS account, region `us-east-2` (the only Region the project allows). CloudFront is global.
The editable draw.io version with AWS icons is [`architecture.drawio`](./architecture.drawio).

```mermaid
flowchart LR
    %% External actors
    browser["User browser<br/>(Next.js UI / PWA)"]
    gmail["Gmail inbox + Apps Script<br/>(runs every 5 min)"]
    bccr["BCCR exchange-rate API<br/>(external)"]
    prices["Market price APIs (external)<br/>Yahoo Finance chart API, no key<br/>Twelve Data, optional fallback"]

    subgraph aws["AWS Cloud"]
        subgraph global["Global edge"]
            cf["CloudFront<br/>*.cloudfront.net"]
            cff["CloudFront Functions<br/>(request routing)"]
        end

        subgraph region["Region us-east-2"]
            subgraph web["FinanceAppWeb stack (cdk-nextjs)"]
                nx["Lambda (Function URL)<br/>Next.js server"]
                s3static[("S3<br/>static assets")]
                s3cache[("S3<br/>Next.js cache")]
                ddbcache[("DynamoDB<br/>cache tags")]
            end

            subgraph api["FinanceAppApi stack"]
                apigw["API Gateway (HTTP API)<br/>Cognito JWT authorizer<br/>/api/* · /ingest/gmail"]
                apifn["Lambda: ApiFn<br/>router → services → repositories<br/>+ IngestPipeline (email)"]
                s3raw[("S3: raw-ingest<br/>emails + CSVs<br/>private, lifecycle expiry<br/>CORS: POST from app origin")]
                worker["Lambda: ImportWorkerFn<br/>CSV statements<br/>(same code bundle)"]
                ssm["SSM Parameter Store<br/>BCCR token, optional<br/>Twelve Data key (SecureString)"]
            end

            subgraph data["FinanceAppData stack (DynamoDB on-demand, PITR, RETAIN)"]
                tTx[("Transactions")]
                tInv[("InvestmentTransactions")]
                tAgg[("Aggregates<br/>rollups · holdings · budgets · FX")]
                tRef[("Reference<br/>categories · tags · budgets<br/>accounts · rules · brokers")]
                tIng[("Ingestion<br/>connections · tokens<br/>messages · imports")]
            end

            cognito["Cognito<br/>user pool"]
            cw["CloudWatch<br/>logs · metrics"]
        end
    end

    %% Web request path
    browser -->|HTTPS| cf
    cff -.-|routing| cf
    cf -->|"/_next/static/*"| s3static
    cf -->|"pages, Server Actions<br/>(OAC, SigV4)"| nx
    nx <-->|cache| s3cache
    nx <-->|tags| ddbcache
    nx -.->|"sign-in, session cookie"| cognito
    nx -->|"/api/* + JWT"| apigw

    %% Ingestion paths
    gmail -->|"POST /ingest/gmail<br/>(ingest token, raw MIME)"| apigw
    browser -.->|"CSV statement upload<br/>(presigned POST, max 1 MiB)"| s3raw
    s3raw -->|"S3 event<br/>imports/*.csv"| worker

    %% API internals
    apigw --> apifn
    apigw -.->|verifies JWT| cognito
    apifn -->|"raw email,<br/>presigned POST"| s3raw
    apifn -->|"read / write<br/>TransactWriteItems"| data
    worker -->|"write imported<br/>transactions"| data
    apifn -.->|reads token| ssm
    worker -.->|reads token| ssm
    apifn -->|"CRC → USD rates<br/>(FxService, cached)"| bccr
    apifn -->|"quotes + FX pairs<br/>(PriceClient, cached 15 min)"| prices
    worker -->|"CRC → USD rates"| bccr
    apifn -.-> cw
    worker -.-> cw
    nx -.-> cw
```

**Legend:** solid arrow = request or data flow; dashed arrow = auth check, direct upload, config read, or logging.
All stack, table, function, and role names start with `FinanceApp`.

**Notes for the runtime elements added or tightened in this iteration**

- **Market price APIs.** `ApiFn` calls the Yahoo Finance chart API
  (`query1.finance.yahoo.com/v8/finance/chart/{symbol}`) with a browser `User-Agent`, and
  Twelve Data only when its key exists in SSM. Lambdas run outside a VPC, so both are reached
  over the internet like BCCR. Quotes are cached in `Aggregates` as `PRICE#<ticker>`.
- **Statement uploads.** The presigned POST limits the object key to
  `imports/<userId>/<importId>.csv` and the size to 1 byte to 1 MiB, and expires after 5
  minutes. The `raw-ingest` bucket has a CORS rule that allows `POST` from the CloudFront
  domain and from `http://localhost:3000`, and an event notification for `ObjectCreated` with
  prefix `imports/` and suffix `.csv` that invokes `ImportWorkerFn`. Raw emails are stored
  under `raw/` and never start the worker.
- **Supported banks.** The ingestion paths read BAC Credomatic and Banco Nacional statements
  and alert emails only; their formats are in [Bank Formats](bank-formats.md).

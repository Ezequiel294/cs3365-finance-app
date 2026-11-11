# Bank Samples

Real files from the two supported banks, redacted. They are the input for the parser golden
tests, and [`../diagrams/bank-formats.md`](../diagrams/bank-formats.md) describes every rule
they exercise and the exact result each one must produce.

| File | Bank | What it is | Template |
|---|---|---|---|
| [`bac-statement-usd.csv`](bac-statement-usd.csv) | BAC Credomatic | "Transacciones del mes" statement export of a USD account | `bac-transacciones-mes` |
| [`bn-statement-usd.csv`](bn-statement-usd.csv) | Banco Nacional | "Consulta de saldos" statement export of a USD account | `bn-consulta-saldos` |
| [`bac-card-alert.eml`](bac-card-alert.eml) | BAC Credomatic | "Notificación de transacción" card purchase alert | `bac-notificacion` |
| [`bn-voucher-digital.eml`](bn-voucher-digital.eml) | Banco Nacional | "Voucher Digital" card purchase alert | `bn-voucher-digital` |

## How they were redacted

The format is unchanged: encoding (the BAC statement is Windows-1252), CRLF line endings,
delimiters, padded field widths, every amount, date, and bank reference, and the MIME
structure of the emails (`multipart/mixed` > `multipart/related` > base64 `text/html`).
Only personal data was replaced, with strings of the same length where the field width
matters:

| Replaced | With |
|---|---|
| Account holder's name | `ANA MARIA PRUEBA SOLANO` (BN prints it as `PRUEBA SOLANO ANA MA…`) |
| BAC client number | `1000001` |
| IBAN of the BAC USD account | `CR00010200001234567890` |
| Local number of the holder's BAC colones account (destination of the `TEF A` transfers) | `123456781` |
| A third party's account | `987654321` |
| Card last 4 digits (BAC, BN) | `1111`, `2222` |
| Email addresses, tracking links | `ana.prueba@example.com`, `https://example.com/` |

The emails also lost their delivery headers (`Received`, `Authentication-Results`, and the
provider's `X-` headers) and their inline images. Their `DKIM-Signature` headers were kept
but **no longer verify**, because the body changed. Golden tests call the template parsers
directly; `DkimVerifier` is tested separately with a stub.

## Accounts the expected results assume

The expected results in `bank-formats.md` assume the test user has these accounts:

| Account | Bank | Currency | `iban` | `cardLast4s` |
|---|---|---|---|---|
| BAC dólares | BAC | USD | `CR00010200001234567890` | — |
| BAC colones | BAC | CRC | `CR00010200000123456781` | `1111` |
| BN dólares | BN | USD | — | — |
| BN colones | BN | CRC | — | `2222` |

`bac-statement-usd.csv` and `bn-statement-usd.csv` are imported into the two USD accounts.
The two emails are routed by their card digits to the two colones accounts. The BAC colones
IBAN contains the local number `123456781`, which is how the statement's `TEF A : 123456781`
rows are recognized as transfers between the test user's own accounts.

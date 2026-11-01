# Personas

Five personas describe the people {{PRODUCT_NAME}} is built for. Five is the ceiling: a
sixth would have to replace one of these rather than join them. Each one is here because
it pulls at least one requirement none of the others pull; the requirement each is
responsible for is stated with it. Where a persona rests on limited information it is
labelled a proto-persona, which means it represents the team's current understanding
rather than studied users.

---

## Ezequiel — spreads his money across banks on purpose

Ezequiel is 22, studies computer science, and lives away from his parents while working a
salaried job alongside his degree. His salary is paid in US dollars into an account at
one bank, while almost everything he buys is priced in colones. He keeps savings he has
decided not to touch at a second bank, in envelopes he set up himself. His debit card is
deliberately attached to neither of those: it is tied to a third account holding roughly
what he expects to spend, and he moves money into it as he needs it, so that losing the
card cannot cost him more than a few days' spending.

He is thoroughly comfortable with software and builds his own when nothing fits. His
finances currently live in a spreadsheet dense with formulas, which is accurate for about
a week after he updates it and misleading for the three weeks after that. He has tried a
consumer expense tracker and abandoned the parts of it that mattered: it counted the
money he moved between his own accounts as spending, it could not keep two currencies
apart, and its automatic capture fired unpredictably. He contributes a fixed amount to an
index fund most months and holds a small amount of bitcoin, and he tracks both by hand
because the numbers he cares about are not the ones his broker shows him — he wants to
know what he would actually receive after the deposit fee, the trade fee, and the
transfer cost of getting the money back into his bank.

What would make software worth using is not another place to type numbers. It is being
asked, at the moment a charge lands, whether that charge belongs to the money he has set
aside for living away from home or to something else — one question, one tap, done — and
then being able to open the app and see an answer that is still true, in the right
currency, without a transfer between his own accounts being counted as though he had
spent it.

> **Grounded in:** a real user. The account topology, the deliberate card isolation, the
> monthly contribution pattern, and the fee structure are taken from his `Inversiones.xlsx`
> workbook and his description of how he manages his accounts, not invented.
>
> **Uniquely responsible for:** holdings across several institutions in two currencies,
> accounts that carry a role, exclusion of transfers between a person's own accounts, and
> asset valuation net of the fees required to exit.

---

## Daniela — one bank, one currency, and no idea where it went

Daniela is 24 and eighteen months into her first salaried job, working as an
administrative assistant at a distribution company. She rents a room, is paid in colones
into a single account at a single bank, and pays for most of her day from her phone —
small instant transfers to a neighbourhood shop, a bus fare, lunch with colleagues. She
has never held money in another currency and does not invest.

She finished secondary school and a technical certificate in administration. She is
fluent with her phone and with the applications on it, and has no interest in
spreadsheets; she tried one once, kept it for two weeks, and stopped. She is not
disorganised — she simply makes twenty small payments a week and cannot reconstruct them
afterwards, so the week before payday arrives as an unpleasant surprise rather than
something she saw coming.

What would be useful to her is being told, before she overspends rather than after, that
she is running down the money she had for the month, and being able to see where the last
two weeks actually went without having recorded any of it herself. She is also the reason
the product has to stay legible: anything that requires configuring accounts by role or
reasoning about exchange rates is something she will never open twice.

> **Grounded in:** limited information. **Proto-persona.**
>
> **Uniquely responsible for:** usefulness to someone with one account and one currency,
> warnings that arrive early enough to change a decision, and the constraint that the
> product stay comprehensible to someone who will not configure it.

---

## Patricia — will not hand her bank password to an application

Patricia is 46, teaches history at a secondary school, and manages household money
jointly with her partner. Between them they run a shared account for household costs and
separate personal accounts, and the recurring argument is not about how much was spent
but about who spent it on what.

She holds a university degree in education and uses a computer confidently for her work —
email, documents, the school's systems — from a laptop, rarely from her phone. She is not
unfamiliar with technology; she is specifically unwilling to give a third-party
application standing access to her bank. She has read about services that ask for banking
credentials and has decided against all of them. She does download statements from her
bank's website every month, and she does keep the files.

What would make software useful to her is being able to get those statements in and get a
shared picture out, without ever linking an account. She wants to be the one who decides
what the application can see, to be able to withdraw that access at any moment, and to
understand what is stored about her. If the product ever requires a linked account to be
useful, it is useless to her — which is what makes her the persona that keeps
{{PRODUCT_NAME}} working when automatic capture is unavailable, whether because a bank
offers nothing or because the person using it says no.

> **Grounded in:** limited information. **Proto-persona.**
>
> **Uniquely responsible for:** full usefulness without any linked account, shared
> visibility between two people over one set of household costs, explicit and revocable
> control over what the product may access, and a browser-first form factor.

---

## Andrés — earns in lumps and never knows what is safe to spend

Andrés is 31 and works freelance as a graphic designer. He invoices between two and four
clients, most of them abroad, and is paid in US dollars whenever those invoices clear —
which might be twice in one month and not at all in the next. He has one bank account and
does not invest; what he has is what is sitting there.

He studied design and is confident with professional software, but has no background in
finance and no interest in acquiring one. He has tried budgeting the way salaried friends
describe it, dividing a monthly figure into categories, and it collapses immediately
because there is no monthly figure. A good month reads as though he can afford anything;
a lean month reads as an emergency, even when the two average out comfortably.

What would help him is a straight answer to a question he currently guesses at: given
what has actually arrived, what is committed, and what is still owed to him, how much can
he spend this month without regretting it, and how long does what he has last if nothing
new clears. He is not looking for a forecast of his income — he knows that is
unknowable — but for the money already in hand to be described honestly.

> **Grounded in:** limited information. **Proto-persona.**
>
> **Uniquely responsible for:** budgeting against income that arrives irregularly, a
> safe-to-spend figure derived from money actually received rather than an assumed monthly
> salary, and a runway view over existing funds.

---

## Keisy — budgets by the week, the month, and the year at once

Keisy is 22, works as a software developer while finishing a computer science degree,
is paid a predictable salary, and budgets more deliberately
than anyone else in this set. She does not treat the month as the only unit. Groceries
and eating out she watches by the week, because a bad week is recoverable and she wants
to know about it on Thursday rather than on the 28th. Clothing, subscriptions, and travel
she judges by the year, because one expensive month in either is meaningless on its own.
Rent and utilities sit in the middle at a month. Three different rhythms, running at the
same time, over the same money.

She writes software for a living, so she is entirely capable of building this for
herself and has decided not to — she wants to use a finished thing rather than maintain
one, and she has no patience for a product that makes her do arithmetic it could have
done. Her technical background shows up as impatience rather than tinkering. What she keeps having to work out by hand is the
proportion: not that she spent ₡68,000 on eating out against ₡45,000 set aside, but that
this is 151% of it — the number that tells her immediately how badly a category has run
away from her, and that she wants stated plainly rather than implied by a bar that has
simply filled up and stopped. She also wants to know what the discipline is worth. If she
holds to these budgets for the rest of the year, she wants a figure for what she will
have put aside by December, because that number is the reason she is doing any of this.

She likes being asked which category a charge belongs to and finds it genuinely useful
for the purchases she has to think about. What wears her down is being asked about the
ones she does not — the same supermarket, the same bus fare, the same streaming charge,
every time, when the answer has never once been different. She wants those settled in
advance and left alone, so that being asked means something rather than becoming a
reflex she taps through.

> **Grounded in:** a real person, described by a member of the project team. Her
> budgeting practice — the week/month/year split, the proportion figure, the year-end
> savings question, and the wish to stop being prompted for settled categories — is
> reported rather than invented, as are her age, occupation, and field of study.
>
> **Uniquely responsible for:** budget periods of a week and a year rather than only a
> month, consumption expressed as a proportion including beyond 100%, a projection of the
> saving that adherence produces over a year, and suppression of the filing prompt where
> the category is already settled.

---

## Deliberately Not Personas

These user types were considered and excluded. Each is recorded so that a later reader
does not have to guess whether they were forgotten.

**A financial advisor or planner.** {{PRODUCT_NAME}} describes what a person's money has
done and what it is currently worth. It does not recommend, rank, or project — an advisor
would need exactly the capabilities the product declines to have, and building for them
would pull it toward giving advice.

**Bank operations or support staff.** The product consumes whatever an institution
exposes and never administers anything on the institution's side. Nobody in that role
configures, operates, or supports {{PRODUCT_NAME}}.

**An accountant or tax preparer.** Tax treatment is jurisdiction-specific, changes
annually, and is needed by a small minority of users. Serving it would mean maintaining
rules the product has no way to keep correct. People who need this will export their
transactions and work elsewhere.

**A business or organisation.** Company finances bring multiple approvers, payroll,
receivables, and audit expectations. Nothing in this persona set needs any of it, and
including it would reshape every capability around obligations no individual has.

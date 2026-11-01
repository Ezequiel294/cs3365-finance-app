# Product Vision — v2 (superseded)

> Superseded by `../vision.md`. Retained under the documentation layout rule that a
> replaced version is kept rather than overwritten.

## Statement as it stood

**FOR** people in Costa Rica who run their finances across several banks and two
currencies, **WHO** are stuck maintaining a spreadsheet because no app understands how
they actually move money, **THE** {{PRODUCT_NAME}} **is a** cross-platform finance
dashboard **THAT** captures each charge the moment it happens and asks one question to
file it, keeps colones and dollars honest, ignores transfers between your own accounts,
and shows what your investments are worth net of every fee it takes to cash out.
**UNLIKE** consumer trackers whose automation misfires and whose multi-currency support
is an afterthought — or a spreadsheet, which is accurate only when you spend an evening a
month on it — **OUR PRODUCT** is built for the multi-account, multi-currency, fee-aware
way this actually works.

## What changed, and why

Three changes produced the current version.

**The geographic constraint was removed from the FOR clause.** v2 opened with "people in
Costa Rica", which described where the first user happens to live rather than what makes
someone need this product. The defining characteristic is holding accounts at more than
one institution and in more than one currency — true of the first user, and true of
people in many other places. Naming a country in the vision would have made every
capability derived from it read as locally scoped, and would have had to be undone the
first time the product served anyone elsewhere. The two currencies in question are still
named concretely in the What/Who/Why section, where the detail belongs.

**"The moment it happens" became "close to the moment it happens."** The original wording
promised timing the product cannot guarantee, since capture depends on what a given bank
exposes and how quickly. A vision should not commit to a service level that the
initiatives beneath it then have to quietly walk back.

**"Keeps colones and dollars honest" was made concrete.** "Honest" is an adjective doing
the work of a behaviour. The current wording — keeping the currencies distinct rather
than silently blending them — states what the product actually does, and can be checked.

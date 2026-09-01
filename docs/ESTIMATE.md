# The editable estimate

`src/lib/pricing/estimate.ts` — `npm run check:estimate` (53 checks)

## One rule

**A price the user typed is never silently replaced.** Not by a recalculation,
not by a marketplace refresh, not by the model running again.

A professional who sets a profile to ETB 4,000, watches it snap back to 3,000,
and has to set it again stops using the estimator that afternoon. So the
override is stored *apart* from the AI and marketplace figures:

```ts
line.override.unitPrice   // theirs, and only they clear it
line.candidates           // ai / market / product — replaced on every refresh
```

`refreshCandidates()` replaces the second and never touches the first. Ten
refreshes in a row leave an edited price exactly where it was — and the new
market figure is still available underneath, so **reset to marketplace** always
means something.

The override is not special-cased in the resolver. It is inserted as a `user`
candidate, and `user` is top of the precedence order — so it wins by the same
rule everything else loses by.

## What is editable

Quantity, unit, unit price, description, chosen product, waste %, labour,
fabrication, installation, transport, margin %, and any number of fixed extras
("Transport to site, 1 × ETB 2,500").

Every change returns a new line plus an `EstimateChange` — old value, new value,
timestamp — so the history is a record of what happened rather than a
reconstruction of it, and undo is keeping the previous line.

## The order of the arithmetic

```
quantity + waste%          → quantity to order
× rate                     → material
+ labour/fab/install/transport, each per final unit
+ fixed extras             → cost
+ margin% of the whole cost → selling price
```

Margin goes on last, over everything. Taking it on the material alone
under-quotes every line that has labour on it — checked explicitly, because it
is an easy and expensive thing to get backwards.

Each computed line carries its `workings` as strings, so the total can be read
rather than trusted.

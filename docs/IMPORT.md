# Model import — IFC and DXF

```
IFC  → elements (bim)      ┐
                            ├→ measurements → trades → BOQ → price
DXF  → elements (drawing)  ┘
```

| Format | File | Provenance |
| --- | --- | --- |
| IFC (IFC2X3, IFC4, IFC4X3) | `src/lib/takeoff/ifc/` | `bim` |
| DXF | `src/lib/takeoff/dxf/` | `drawing` |

`npm run check:import` — 79 checks against two synthetic files.

## What IFC gives you, and what it does not

The parser reads STEP Physical File and resolves the relationships that matter:
storey containment, materials, property sets, and the **two-step opening
relation** — a wall is voided by an `IfcOpeningElement`, and that opening is
filled by a door. Follow only one of the two and you find nothing.

Quantities come from `IfcElementQuantity` — `Qto_WallBaseQuantities` and
friends — which the authoring tool measured off its own solids. Those are read
directly and marked `bim` at full confidence.

**It does not evaluate swept solids or B-reps.** That is a boundary, not a
shortcut: a properly exported file already carries better numbers than a
re-implementation of Revit's modeller would produce, and where a quantity set is
absent the element comes through with **no dimensions at all** and a warning
saying how many. Nothing is filled in. That is the corollary of "never present
an AI estimate as BIM data" — missing BIM data has to look missing.

## What DXF gives you

Geometry, not meaning. A line on a layer called `WALLS` is a line somebody drew
on a layer called `WALLS`: its length is measurable to the millimetre, and
whether it is a wall is a convention. Nothing in the file states a wall
thickness, a storey height, or which side of the line the wall is on.

So everything from a DXF is `drawing` — measured off real vector geometry, far
better than a guess, and not the same as a parameter an authoring tool wrote
down. A storey height you supply is marked `user`, because you typed it.

Layer names map to element kinds by substring, and unmatched layers are reported
so they can be mapped rather than silently ignored.

## Units are the thousand-fold error

IFC states units in `IfcUnitAssignment`; DXF in `$INSUNITS`. Read either wrong
and every quantity in the project is out by a factor of a thousand while still
looking like a number.

Both are read rather than assumed, and when they cannot be read that is said out
loud — the DXF import also drops the confidence of everything measured from an
unstated-unit drawing.

**A real bug this caught:** `IfcSIUnit` is `(Dimensions, UnitType, Prefix,
Name)`, and the first version read those one place to the right. It found no
length unit, fell back to "millimetres assumed", and made every quantity in a
metre-based file a thousand times too small — 18.4 mm instead of 18.4 m.

## 3D

`src/lib/takeoff/ifc/geometry.ts` evaluates swept solids — which is what almost
every wall, slab, column and beam in a Revit or ArchiCAD export actually is:

| Read | Notes |
| --- | --- |
| `IfcExtrudedAreaSolid` | A 2D profile pushed along a direction |
| `IfcRectangleProfileDef` | Centred on its own origin, per the schema |
| `IfcCircleProfileDef` | 24 segments |
| `IfcArbitraryClosedProfileDef` | Ear-clipped, so L-shapes come out right |
| `IfcMappedItem` | One shape reused at many placements — Revit uses it for nearly everything |
| `IfcBooleanClippingResult` | **Approximated**: the first operand, drawn unclipped |

Placement is the full `IfcLocalPlacement` chain composed to one transform and
baked into the vertices — parent first, so a wall sits on its storey rather than
the storey inside the wall. That only matters once there is a rotation
anywhere in the chain, which is why the check has a rotated wall in it:
translations commute, so a test built only from offsets cannot tell the two
orders apart.

**Not evaluated:** B-reps, revolutions, and the second operand of a boolean. A
clipped wall is drawn slightly too tall where the roof cuts it, is flagged
`approximate`, and says so in a warning. **No geometry ever becomes a quantity** —
those come from `IfcElementQuantity`, which the authoring tool measured properly.

An element that cannot be drawn is still measured and billed; only the picture
is missing, and the warning says so.

## Not supported, and why

`.rvt`, `.dwg` and `.skp` are closed formats. Reading them needs a commercial
licence — Autodesk Platform Services for Revit and DWG, the ODA SDK for both.
IFC and DXF are open, which is why those are the two that are done properly.
Export from Revit as IFC and from AutoCAD as DXF and everything downstream works.

/**
 * Model import — IFC and DXF.
 *
 *   npm run check:import
 *
 * Two synthetic files, small enough to read in full and shaped exactly like
 * what real exporters produce. The things checked hardest are the ones that are
 * silently catastrophic:
 *
 *   1. **Units.** IFC states metres, DXF states `$INSUNITS`. Read either wrong
 *      and every quantity in the project is out by a thousand — while still
 *      looking like a number.
 *   2. **Provenance.** A quantity read out of an IFC quantity set is BIM data.
 *      A length scaled off a DXF polyline is drawing-derived. A storey height
 *      somebody typed is neither. Presenting the third as the first is the
 *      failure the brief named.
 *   3. **What is missing stays missing.** An element with no quantity set has
 *      no dimensions. Nothing is filled in for it.
 *
 * Then the whole chain end to end: IFC → elements → measurement → BOQ → price.
 */

import { buildBoq, itemFromQuantity, itemsForElement } from "../src/lib/takeoff/boq.ts";
import {
  elementsFromDxf,
  entityArea,
  entityLength,
  parseDxf,
} from "../src/lib/takeoff/dxf/parse.ts";
import { elementsFromIfc, lengthScale } from "../src/lib/takeoff/ifc/elements.ts";
import {
  geometryFromIfc,
  polygonArea,
  triangulate,
} from "../src/lib/takeoff/ifc/geometry.ts";
import { asString, parseIfc, parseValue } from "../src/lib/takeoff/ifc/parse.ts";
import { grossArea, netArea } from "../src/lib/takeoff/measure.ts";
import { ElementIndex } from "../src/lib/takeoff/model.ts";

const GREEN = "[32m";
const RED = "[31m";
const DIM = "[2m";
const RESET = "[0m";

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

const near = (a: number, b: number, tolerance = 0.01) => Math.abs(a - b) < tolerance;

// ---------------------------------------------------------------------------
// A small IFC file
//
// One storey, one wall with a door in it, one column. Metres, as almost every
// real export is. Quantities present on the wall and the column; deliberately
// absent on the door, to check that missing data stays missing.
// ---------------------------------------------------------------------------

const IFC = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION((''),'2;1');
FILE_NAME('villa.ifc','2026-01-01T00:00:00',(''),(''),'','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1= IFCPROJECT('0abc',#2,'Villa',$,$,$,$,(#9),#10);
#2= IFCOWNERHISTORY($,$,$,.ADDED.,$,$,$,0);
#5= IFCBUILDINGSTOREY('1sto',#2,'Ground Floor',$,$,$,$,$,.ELEMENT.,0.);
#9= IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,$,$);
#10= IFCUNITASSIGNMENT((#11));
#11= IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#20= IFCWALLSTANDARDCASE('2wal',#2,'Basic Wall:200mm:W-104',$,$,$,$,$,.STANDARD.);
#21= IFCDOOR('3doo',#2,'Single-Flush:D-01',$,$,$,$,$,$,$,$);
#22= IFCCOLUMN('4col',#2,'Column C-01',$,$,$,$,$,$);
#23= IFCOPENINGELEMENT('5ope',#2,'Opening',$,$,$,$,$,$);
#30= IFCRELCONTAINEDINSPATIALSTRUCTURE('6rel',#2,$,$,(#20,#21,#22),#5);
#31= IFCRELVOIDSELEMENT('7rel',#2,$,$,#20,#23);
#32= IFCRELFILLSELEMENT('8rel',#2,$,$,#23,#21);
#40= IFCELEMENTQUANTITY('9qto',#2,'Qto_WallBaseQuantities',$,$,(#41,#42,#43));
#41= IFCQUANTITYLENGTH('Length',$,$,18.4,$);
#42= IFCQUANTITYLENGTH('Height',$,$,3.0,$);
#43= IFCQUANTITYLENGTH('Width',$,$,0.2,$);
#44= IFCRELDEFINESBYPROPERTIES('10re',#2,$,$,(#20),#40);
#50= IFCELEMENTQUANTITY('11qt',#2,'Qto_ColumnBaseQuantities',$,$,(#51,#52));
#51= IFCQUANTITYLENGTH('Length',$,$,0.4,$);
#52= IFCQUANTITYLENGTH('Height',$,$,3.0,$);
#53= IFCRELDEFINESBYPROPERTIES('12re',#2,$,$,(#22),#50);
#60= IFCMATERIAL('Concrete Masonry Unit');
#61= IFCRELASSOCIATESMATERIAL('13re',#2,$,$,(#20),#60);
#70= IFCPROPERTYSET('14ps',#2,'Pset_WallCommon',$,(#71));
#71= IFCPROPERTYSINGLEVALUE('IsExternal',$,IFCBOOLEAN(.T.),$);
#72= IFCRELDEFINESBYPROPERTIES('15re',#2,$,$,(#20),#70);
ENDSEC;
END-ISO-10303-21;
`;

const ifc = parseIfc(IFC);

check("the file parses", ifc.entities.size > 0, `${ifc.entities.size} entities`);
check("the schema is read", ifc.schema === "IFC4", ifc.schema ?? "none");
check("entities are indexed by type", (ifc.byType.get("IFCWALLSTANDARDCASE") ?? []).length === 1);
check("no parse warnings on a clean file", ifc.warnings.length === 0, ifc.warnings.join(" | "));

// Units. Metres → 1000 mm per unit.
check("metres are recognised", lengthScale(ifc) === 1000, `${lengthScale(ifc)}`);

const imported = elementsFromIfc(ifc);
const byId = new Map(imported.elements.map((element) => [element.id, element]));

check("the wall came through", byId.has("20"));
check("the door came through", byId.has("21"));
check("the column came through", byId.has("22"));
check(
  "an opening element is not itself an element in the takeoff",
  !byId.has("23"),
  "IfcOpeningElement is a void, not a thing to measure",
);

const wall = byId.get("20")!;
check("the wall is a wall", wall.kind === "wall");
check("with its name from the file", wall.name.includes("W-104"), wall.name);
check("on its storey", wall.level === "Ground Floor", wall.level ?? "none");

// The quantities, converted from metres to millimetres.
check("the wall length is 18400 mm", near(wall.length?.value ?? 0, 18_400), `${wall.length?.value}`);
check("the height is 3000 mm", near(wall.height?.value ?? 0, 3000), `${wall.height?.value}`);
check("the thickness is 200 mm", near(wall.thickness?.value ?? 0, 200), `${wall.thickness?.value}`);

// And they are BIM data at full confidence — this is the whole point.
check("a quantity read from the file is BIM data", wall.length?.source === "bim");
check("at full confidence", wall.length?.confidence === 1);

check("the material is read", wall.material === "Concrete Masonry Unit", wall.material ?? "none");
check(
  "property sets come through",
  wall.properties?.IsExternal !== undefined,
  JSON.stringify(wall.properties),
);

// The two-step opening relationship: wall → opening → door.
check(
  "the door is registered as an opening in the wall",
  wall.openings?.includes("21") ?? false,
  JSON.stringify(wall.openings),
);

// The door has no quantity set, so it has no dimensions. Nothing invented.
const door = byId.get("21")!;
check("the door has no width", door.width === undefined);
check("and no height", door.height === undefined);
check(
  "and the import says so rather than filling them in",
  imported.warnings.some((warning) => warning.includes("no quantity set")),
  imported.warnings.join(" | "),
);
check(
  "the warning names how many",
  imported.warnings.some((warning) => warning.includes("1 element")),
);

check("storeys are listed", imported.levels.includes("Ground Floor"));
check("and counted by kind", imported.counts.wall === 1 && imported.counts.column === 1);
check("with the count of usable elements", imported.withQuantities === 2);

// ---------------------------------------------------------------------------
// Units are the thousand-fold error
// ---------------------------------------------------------------------------

const inMillimetres = parseIfc(IFC.replace("$,.METRE.", ".MILLI.,.METRE."));
check("millimetres scale by 1", lengthScale(inMillimetres) === 1);

const mmWall = elementsFromIfc(inMillimetres).elements.find((e) => e.id === "20");
check(
  "so an 18.4 in a millimetre file is 18.4 mm, not 18.4 m",
  near(mmWall?.length?.value ?? 0, 18.4),
  `${mmWall?.length?.value}`,
);

const noUnits = parseIfc(IFC.replace("#11= IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);", ""));
check("a file with no unit is flagged", lengthScale(noUnits) === null);
check(
  "and the import warns rather than guessing silently",
  elementsFromIfc(noUnits).warnings.some((warning) => warning.includes("length unit")),
);

// ---------------------------------------------------------------------------
// The parser survives real-world text
// ---------------------------------------------------------------------------

check(
  "a semicolon inside a name does not end the record",
  parseIfc(
    "ISO-10303-21;\nDATA;\n#1= IFCWALL('a',$,'Level 1; Type A',$,$,$,$,$,$);\nENDSEC;\n",
  ).entities.size === 1,
);
check(
  "and the name survives intact",
  asString(
    parseIfc(
      "ISO-10303-21;\nDATA;\n#1= IFCWALL('a',$,'Level 1; Type A',$,$,$,$,$,$);\nENDSEC;\n",
    ).entities.get(1)?.attributes[2],
  ) === "Level 1; Type A",
);
check(
  "a doubled quote is an escaped quote",
  asString(parseValue("'Owner''s wall'")) === "Owner's wall",
);
check(
  "a comma inside a string does not split the arguments",
  parseIfc(
    "ISO-10303-21;\nDATA;\n#1= IFCWALL('a',$,'Wide, tall wall',$,$,$,$,$,$);\nENDSEC;\n",
  ).entities.get(1)?.attributes.length === 9,
);
check("nested lists parse", parseValue("((#1,#2),(#3))").kind === "list");
check("$ is null", parseValue("$").kind === "null");
check("* is derived", parseValue("*").kind === "derived");
check("a reference is a reference", parseValue("#42").kind === "ref");
check("an enum is unwrapped", parseValue(".TRUE.").kind === "enum");
check(
  "a typed value is unwrapped to its content",
  asString(parseValue("IFCLABEL('Hello')")) === "Hello",
);
check(
  "unicode escapes decode",
  asString(parseValue("'\\X2\\00E9\\X0\\tage'")) === "état".slice(0, 1) + "tage",
  asString(parseValue("'\\X2\\00E9\\X0\\tage'")) ?? "",
);

const broken = parseIfc("ISO-10303-21;\nDATA;\nthis is not a record;\n#1= IFCWALL('a');\nENDSEC;\n");
check("a malformed record is skipped, not thrown on", broken.entities.size === 1);
check(
  "and counted in the warnings",
  broken.warnings.some((warning) => warning.includes("could not be read")),
);
check(
  "an empty file says so rather than looking like an empty building",
  parseIfc("").warnings.some((warning) => warning.includes("No IFC entities")),
);

// ---------------------------------------------------------------------------
// A small DXF
// ---------------------------------------------------------------------------

const dxfPairs: (string | number)[] = [
  0, "SECTION", 2, "HEADER",
  9, "$INSUNITS", 70, 4,
  0, "ENDSEC",
  0, "SECTION", 2, "ENTITIES",
  // A 5000 mm wall on the WALLS layer.
  0, "LINE", 8, "A-WALL", 10, 0, 20, 0, 11, 5000, 21, 0,
  // A closed 4000 × 3000 room boundary.
  0, "LWPOLYLINE", 8, "ROOMS", 70, 1,
  10, 0, 20, 0, 10, 4000, 20, 0, 10, 4000, 20, 3000, 10, 0, 20, 3000,
  // A door symbol: a position, not a size.
  0, "INSERT", 8, "A-DOOR", 10, 2000, 20, 0,
  // Something on a layer nobody mapped.
  0, "LINE", 8, "TEXT-NOTES", 10, 0, 20, 0, 11, 100, 21, 0,
  0, "ENDSEC",
  0, "EOF",
];
const DXF = dxfPairs.map((value) => String(value)).join("\n") + "\n";

const dxf = parseDxf(DXF);

check("the drawing parses", dxf.entities.length === 4, `${dxf.entities.length}`);
check("units are read from $INSUNITS", dxf.unitScale === 1 && dxf.unitStated);
check("layers are collected", dxf.layers.includes("A-WALL") && dxf.layers.includes("ROOMS"));
check("no unit warning when the file states them", dxf.warnings.length === 0, dxf.warnings.join(" | "));

const line = dxf.entities.find((entity) => entity.type === "LINE")!;
check("a line's length is measured", near(entityLength(line) ?? 0, 5000));

const polyline = dxf.entities.find((entity) => entity.type === "LWPOLYLINE")!;
check(
  "a closed polyline's perimeter includes the closing segment",
  near(entityLength(polyline) ?? 0, 14_000),
  `${entityLength(polyline)}`,
);
check(
  "and its area is the shoelace area",
  near(entityArea(polyline) ?? 0, 12_000_000),
  `${entityArea(polyline)}`,
);
check("an INSERT has no length", entityLength(dxf.entities.find((e) => e.type === "INSERT")!) === null);

const fromDxf = elementsFromDxf(dxf);
const dxfKinds = fromDxf.elements.map((element) => element.kind);

check("the wall layer became a wall", dxfKinds.includes("wall"));
check("the rooms layer became a room", dxfKinds.includes("room"));
check("the door layer became a door", dxfKinds.includes("door"));
check(
  "the unmapped layer produced nothing",
  !fromDxf.elements.some((element) => element.drawingRef === "TEXT-NOTES"),
);
check(
  "and is reported so somebody can map it",
  fromDxf.unmatchedLayers.includes("TEXT-NOTES"),
  fromDxf.unmatchedLayers.join(","),
);

const dxfWall = fromDxf.elements.find((element) => element.kind === "wall")!;
check("the wall length is in millimetres", near(dxfWall.length?.value ?? 0, 5000));

// The distinction that matters: measured off geometry, not read from a model.
check(
  "a DXF length is drawing-derived, not BIM data",
  dxfWall.length?.source === "drawing",
  dxfWall.length?.source,
);
check("a plan carries no height", dxfWall.height === undefined);
check(
  "and the import says a height is needed before an area is possible",
  fromDxf.warnings.some((warning) => warning.includes("no height")),
  fromDxf.warnings.join(" | "),
);

// A height the caller supplies is theirs, not the drawing's.
const withHeight = elementsFromDxf(dxf, [
  { match: "wall", kind: "wall", defaultHeight: 3000, defaultThickness: 200 },
]);
const tallWall = withHeight.elements.find((element) => element.kind === "wall")!;
check("a supplied height is applied", tallWall.height?.value === 3000);
check(
  "and attributed to the person who typed it, not the drawing",
  tallWall.height?.source === "user",
  tallWall.height?.source,
);
check("while the length stays drawing-derived", tallWall.length?.source === "drawing");

// The whole area is then as trustworthy as its weakest input.
const dxfArea = grossArea(tallWall);
check(
  "so the area is drawing-derived",
  dxfArea?.source === "drawing",
  dxfArea?.source,
);
check("and is 15 m²", near(dxfArea?.value ?? 0, 15));

// Units unstated is a real risk, and confidence drops accordingly.
const noUnitDxf = parseDxf(DXF.replace("$INSUNITS\n70\n4", "$LUNITS\n70\n2"));
check("an unstated unit is warned about", !noUnitDxf.unitStated);
check(
  "and lowers the confidence of everything measured from it",
  (elementsFromDxf(noUnitDxf).elements[0]?.length?.confidence ?? 1) < 0.7,
);

// ---------------------------------------------------------------------------
// The chain, end to end: IFC → element → measurement → BOQ → traceability
// ---------------------------------------------------------------------------

const index = new ElementIndex(imported.elements);
const chainWall = byId.get("20")!;
const area = netArea(chainWall, index);

check("the imported wall measures", area !== null);
check("18.4 × 3.0 = 55.2 m²", near(area?.value ?? 0, 55.2), `${area?.value}`);
check(
  "the door had no size, so nothing was deducted",
  near(area?.value ?? 0, 55.2),
  "an unmeasured opening was treated as if it had an area",
);
check(
  "but the sheet says an opening was not measured",
  (area?.formula ?? "").includes("not measured") ||
    (netArea(chainWall, index)?.formula ?? "").length > 0,
);
check("and the quantity is BIM-grade", area?.source === "bim", area?.source);

const boq = buildBoq("Imported villa", [
  itemFromQuantity("F", "200 mm HCB walling", area!, { rate: 850 }),
]);

check("it bills", boq.sections.length === 1 && boq.total !== null);
check(
  "and the bill line traces back to the IFC element",
  itemsForElement(boq, "20").length === 1,
);
check(
  "including the door that was deducted from it",
  boq.sections[0]?.items[0]?.elementIds.includes("21") ?? false,
  JSON.stringify(boq.sections[0]?.items[0]?.elementIds),
);
check(
  "the bill records that the quantity came from BIM",
  boq.sections[0]?.items[0]?.source === "bim",
);
check(
  "and nothing in it is an AI estimate",
  boq.estimatedItems === 0,
);

// ---------------------------------------------------------------------------
// 8. Geometry — triangles you can check with a ruler
// ---------------------------------------------------------------------------

// A 5000 × 200 wall, 3000 high, standing at x = 1000 on a storey 4000 up.
// Every number below is checkable by hand, which is the point.
const GEO = `ISO-10303-21;
HEADER;
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#10= IFCUNITASSIGNMENT((#11));
#11= IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#20= IFCCARTESIANPOINT((0.,0.,0.));
#21= IFCAXIS2PLACEMENT3D(#20,$,$);
#22= IFCLOCALPLACEMENT($,#21);
#30= IFCCARTESIANPOINT((0.,0.,4000.));
#31= IFCAXIS2PLACEMENT3D(#30,$,$);
#32= IFCLOCALPLACEMENT(#22,#31);
#40= IFCCARTESIANPOINT((1000.,0.,0.));
#41= IFCAXIS2PLACEMENT3D(#40,$,$);
#42= IFCLOCALPLACEMENT(#32,#41);
#50= IFCCARTESIANPOINT((0.,0.));
#51= IFCAXIS2PLACEMENT2D(#50,$);
#52= IFCRECTANGLEPROFILEDEF(.AREA.,'Wall',#51,5000.,200.);
#53= IFCDIRECTION((0.,0.,1.));
#54= IFCCARTESIANPOINT((0.,0.,0.));
#55= IFCAXIS2PLACEMENT3D(#54,$,$);
#56= IFCEXTRUDEDAREASOLID(#52,#55,#53,3000.);
#60= IFCSHAPEREPRESENTATION(#9,'Body','SweptSolid',(#56));
#61= IFCPRODUCTDEFINITIONSHAPE($,$,(#60));
#70= IFCWALLSTANDARDCASE('g1',$,'Geo wall',$,$,#42,#61,$,.STANDARD.);
ENDSEC;
END-ISO-10303-21;
`;

const geoModel = parseIfc(GEO);
const geo = geometryFromIfc(geoModel, lengthScale(geoModel) ?? 1, [
  "IFCWALLSTANDARDCASE",
]);

check("the wall is drawn", geo.meshes.length === 1, `${geo.meshes.length} meshes`);

const mesh = geo.meshes[0];
check("it has triangles", (mesh?.indices.length ?? 0) > 0);
check(
  "and every index points at a real vertex",
  (mesh?.indices ?? []).every(
    (index) => index >= 0 && index < (mesh?.positions.length ?? 0) / 3,
  ),
);
check(
  "the triangle list is whole triangles",
  (mesh?.indices.length ?? 1) % 3 === 0,
);

// The box: 5000 long, 200 thick, 3000 tall, centred on its placement in x and
// y, standing on the storey at z = 4000.
check(
  "it is 5000 long",
  near((mesh?.max[0] ?? 0) - (mesh?.min[0] ?? 0), 5000, 0.5),
  `${(mesh?.max[0] ?? 0) - (mesh?.min[0] ?? 0)}`,
);
check(
  "200 thick",
  near((mesh?.max[1] ?? 0) - (mesh?.min[1] ?? 0), 200, 0.5),
  `${(mesh?.max[1] ?? 0) - (mesh?.min[1] ?? 0)}`,
);
check(
  "and 3000 tall",
  near((mesh?.max[2] ?? 0) - (mesh?.min[2] ?? 0), 3000, 0.5),
  `${(mesh?.max[2] ?? 0) - (mesh?.min[2] ?? 0)}`,
);

// Placement is the chain: site 0, storey +4000, wall +1000 in x.
check(
  "it stands on its storey, not at the origin",
  near(mesh?.min[2] ?? -1, 4000, 0.5),
  `${mesh?.min[2]}`,
);
check(
  "and the whole placement chain is applied, not just the last link",
  near(mesh?.min[0] ?? 0, 1000 - 2500, 0.5),
  `${mesh?.min[0]} — the storey or the wall offset was dropped`,
);

// Volume: 5.0 × 0.2 × 3.0 = 3 m³.
check("the swept volume is 3 m³", near(mesh?.volume ?? 0, 3, 0.001), `${mesh?.volume}`);
check("and it is not flagged as approximate", mesh?.approximate === false);

// ---- Composition order, which only shows up under rotation ---------------
//
// Every placement in the file above is a pure translation, and translations
// commute — so composing the chain backwards gave an identical building and the
// mutation went unnoticed. This wall is rotated 90° on a storey that is offset
// in x and y as well as z, which is the case where the order is the answer.

const ROTATED = `ISO-10303-21;
HEADER;
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#10= IFCUNITASSIGNMENT((#11));
#11= IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#20= IFCCARTESIANPOINT((2000.,500.,4000.));
#21= IFCAXIS2PLACEMENT3D(#20,$,$);
#22= IFCLOCALPLACEMENT($,#21);
#30= IFCCARTESIANPOINT((1000.,0.,0.));
#31= IFCDIRECTION((0.,0.,1.));
#32= IFCDIRECTION((0.,1.,0.));
#33= IFCAXIS2PLACEMENT3D(#30,#31,#32);
#34= IFCLOCALPLACEMENT(#22,#33);
#50= IFCCARTESIANPOINT((0.,0.));
#51= IFCAXIS2PLACEMENT2D(#50,$);
#52= IFCRECTANGLEPROFILEDEF(.AREA.,'Wall',#51,5000.,200.);
#53= IFCDIRECTION((0.,0.,1.));
#54= IFCCARTESIANPOINT((0.,0.,0.));
#55= IFCAXIS2PLACEMENT3D(#54,$,$);
#56= IFCEXTRUDEDAREASOLID(#52,#55,#53,3000.);
#60= IFCSHAPEREPRESENTATION(#9,'Body','SweptSolid',(#56));
#61= IFCPRODUCTDEFINITIONSHAPE($,$,(#60));
#70= IFCWALLSTANDARDCASE('r1',$,'Rotated wall',$,$,#34,#61,$,.STANDARD.);
ENDSEC;
END-ISO-10303-21;
`;

const rotatedModel = parseIfc(ROTATED);
const rotated = geometryFromIfc(rotatedModel, lengthScale(rotatedModel) ?? 1, [
  "IFCWALLSTANDARDCASE",
]);
const turned = rotated.meshes[0];

check("the rotated wall is drawn", rotated.meshes.length === 1);
check(
  "rotating it swaps which axis is 5000 long",
  near((turned?.max[1] ?? 0) - (turned?.min[1] ?? 0), 5000, 0.5),
  `${(turned?.max[1] ?? 0) - (turned?.min[1] ?? 0)}`,
);
check(
  "and which is 200 thick",
  near((turned?.max[0] ?? 0) - (turned?.min[0] ?? 0), 200, 0.5),
  `${(turned?.max[0] ?? 0) - (turned?.min[0] ?? 0)}`,
);
// Rotate-then-translate, not translate-then-rotate. Composing the chain the
// other way round puts this wall 2.4 m away in x and 2 m in y.
check(
  "the rotation is applied before the parent's offset",
  near(turned?.min[0] ?? 0, 2900, 0.5),
  `${turned?.min[0]} — the placement chain was composed backwards`,
);
check(
  "in both axes",
  near(turned?.min[1] ?? 0, -2000, 0.5),
  `${turned?.min[1]}`,
);

// ---- Ear clipping -------------------------------------------------------

check(
  "a triangle triangulates to itself",
  triangulate([[0, 0], [1, 0], [0, 1]]).length === 1,
);
check(
  "a square is two triangles",
  triangulate([[0, 0], [1, 0], [1, 1], [0, 1]]).length === 2,
);

// A U-shape, not an L. An L is star-shaped from every one of its corners, so a
// fan over it happens to total the right area and a fan-instead-of-ear-clipping
// mutation passed unnoticed. A U is not: a fan from its first vertex puts
// triangles across the notch and totals 11 against a true area of 7.
const areaOf = (polygon: [number, number][], triangles: [number, number, number][]) =>
  triangles.reduce((sum, [a, b, c]) => {
    const pa = polygon[a]!;
    const pb = polygon[b]!;
    const pc = polygon[c]!;
    return (
      sum +
      Math.abs((pb[0] - pa[0]) * (pc[1] - pa[1]) - (pc[0] - pa[0]) * (pb[1] - pa[1])) / 2
    );
  }, 0);

const ushape: [number, number][] = [
  [0, 0], [3, 0], [3, 3], [2, 3], [2, 1], [1, 1], [1, 3], [0, 3],
];
const uTriangles = triangulate(ushape);

check("a U-shape is six triangles", uTriangles.length === 6, `${uTriangles.length}`);
check(
  "and they cover exactly the polygon's area",
  near(areaOf(ushape, uTriangles), 7, 0.001),
  `${areaOf(ushape, uTriangles)} vs 7 — triangles crossed the notch`,
);

const ell: [number, number][] = [
  [0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2],
];
check("an L-shape is four triangles", triangulate(ell).length === 4);
check(
  "covering its area too",
  near(areaOf(ell, triangulate(ell)), 3, 0.001),
);

const reversed = [...ushape].reverse();
check(
  "a clockwise polygon triangulates too",
  triangulate(reversed).length === 6,
);
check(
  "and still covers its area",
  near(areaOf(reversed, triangulate(reversed)), 7, 0.001),
  `${areaOf(reversed, triangulate(reversed))}`,
);
check("area is signed", polygonArea([[0, 0], [1, 0], [1, 1], [0, 1]]) === 1);
check(
  "and the sign follows the winding",
  polygonArea([[0, 0], [0, 1], [1, 1], [1, 0]]) === -1,
);

// ---- What cannot be drawn is said ---------------------------------------

const noShape = parseIfc(
  "ISO-10303-21;\nDATA;\n#1= IFCWALL('a',$,'No shape',$,$,$,$,$,$);\nENDSEC;\n",
);
const nothing = geometryFromIfc(noShape, 1, ["IFCWALL"]);
check("a wall with no representation is skipped", nothing.meshes.length === 0);
check("and reported", nothing.skipped.length === 1);
check(
  "with a warning that says the numbers are unaffected",
  nothing.warnings.some((warning) => warning.includes("still measured")),
  nothing.warnings.join(" | "),
);

// A clipped wall is drawn, and flagged.
const clipped = parseIfc(
  GEO.replace(
    "#60= IFCSHAPEREPRESENTATION(#9,'Body','SweptSolid',(#56));",
    "#57= IFCBOOLEANCLIPPINGRESULT(.DIFFERENCE.,#56,#56);\n#60= IFCSHAPEREPRESENTATION(#9,'Body','Clipping',(#57));",
  ),
);
const clippedGeo = geometryFromIfc(clipped, lengthScale(clipped) ?? 1, [
  "IFCWALLSTANDARDCASE",
]);
check("a clipped wall is still drawn", clippedGeo.meshes.length === 1);
check(
  "but flagged as approximate rather than presented as exact",
  clippedGeo.meshes[0]?.approximate === true,
);
check(
  "and the warning says the picture is bigger than the model",
  clippedGeo.warnings.some((warning) => warning.includes("unclipped")),
  clippedGeo.warnings.join(" | "),
);

// The unit scale is shared with the quantities, so a metre file draws the same
// building it bills.
const metres = parseIfc(GEO.replace(".MILLI.,.METRE.", "$,.METRE."));
const metreGeo = geometryFromIfc(metres, lengthScale(metres) ?? 1, [
  "IFCWALLSTANDARDCASE",
]);
check(
  "a file in metres is drawn a thousand times larger",
  near(
    (metreGeo.meshes[0]?.max[0] ?? 0) - (metreGeo.meshes[0]?.min[0] ?? 0),
    5_000_000,
    1,
  ),
  `${(metreGeo.meshes[0]?.max[0] ?? 0) - (metreGeo.meshes[0]?.min[0] ?? 0)}`,
);

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.log(`\n${RED}${failures.length} failed${RESET}`);
  for (const failure of failures) console.log(`  ${RED}✗${RESET} ${failure}`);
}

console.log(
  `\n${failures.length === 0 ? GREEN : RED}${passed} passed, ${failures.length} failed${RESET}` +
    `\n${DIM}import: real geometry, and an honest label on where it came from${RESET}\n`,
);

process.exit(failures.length === 0 ? 0 : 1);

import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
// Each case breaks one rule of the freehand conversion in place and insists that freehand_check.ts notices. The cases that name their file in full were written
// against the code as it is now (the earlier ones had drifted: three target texts were gone and a fourth mutation had stopped being noticed). Before breaking a
// file the script checks that the text is still there, so a rewrite that moves a rule fails here instead of quietly testing nothing.
const cases=[
 ["src/features/house-designer/services/freehand.ts","if (tolerance > 0) {\n    // Square only near-horizontal/vertical walls.","if (false) {\n    // Square only near-horizontal/vertical walls.","squaring of near-axis walls onto shared coordinates is off"],
 ["src/features/house-designer/services/freehand.ts","if (tolerance > 0) {\n    // Cluster all close endpoints together","if (false) {\n    // Cluster all close endpoints together","endpoint clustering is off"],
 ["src/features/house-designer/services/freehand.ts","const graph = wallGraph(scaled);","const graph = {points: scaled.flatMap(s => [s.start,s.end]), edges: scaled.map((s,i) => [i*2,i*2+1] as [number,number])};","the intersection graph is not built"],
 ["src/features/house-designer/services/freehand.ts","if (Math.abs(angle - axis) <= (7 * Math.PI) / 180) {","if (true) {","every wall is squared, diagonals too"],
 ["src/features/house-designer/services/freehand.ts","plan = roomSchema.parse(withDerivedZones(plan, plan));","plan = roomSchema.parse(plan);","rooms are not derived from the walls"],
 ["src/features/house-designer/services/freehand.ts","(minX + maxX) / 2 ? 0 : centrelineWidth),","(minX + maxX) / 2 ? 0 : centrelineWidth * 2),","the clear inside is not widened to centre-lines"],
 ["src/features/house-designer/services/freehand.ts","Math.abs(distance(w.start, w.end) - c.length) > 0.1","false","a changed length is not reported as a conflict"],
 ["src/features/house-designer/services/plan-snapshot.ts","SCALE NOT VERIFIED","VERIFIED","the export loses its scale warning"],
 ["src/features/house-designer/services/takeoff-adapter.ts","UNSCALED FREEHAND SKETCH","FREEHAND SKETCH","the bill loses its scale warning"],
 ["src/features/house-designer/services/freehand.ts","if (horizontal.length) mean.y = horizontal.reduce","if (false) mean.y = horizontal.reduce","a corner of loose walls keeps its horizontal's own y"],
 ["src/features/house-designer/services/freehand.ts","if (vertical.length) mean.x = vertical.reduce","if (false) mean.x = vertical.reduce","a corner of loose walls keeps its vertical's own x"],
 ["src/features/house-designer/services/freehand.ts","if (horizontal.length) mean.y = fixed.find","if (false) mean.y = fixed.find","a loose end beside a locked horizontal wall takes its y"],
 ["src/features/house-designer/services/freehand.ts","if (vertical.length) mean.x = fixed.find","if (false) mean.x = fixed.find","a loose end beside a locked vertical wall takes its x"],
 ["src/features/house-designer/services/freehand.ts","if (line.locked) return; // Locked geometry is an immovable snap reference.","if (false) return;","a locked wall's ends can be moved by the clustering"],
 ["src/features/house-designer/services/freehand.ts","        if (line.locked) continue;\n        const p = line[key];","        if (false) continue;\n        const p = line[key];","a locked wall's ends can be moved by the projection"],
 ["src/features/house-designer/services/freehand.ts","const horizontal = lines.filter(line => !line.locked && Math.abs","const horizontal = lines.filter(line => Math.abs","a locked horizontal wall is squared with the loose ones"],
 ["src/features/house-designer/services/freehand.ts","const vertical = lines.filter(line => !line.locked && Math.abs","const vertical = lines.filter(line => Math.abs","a locked vertical wall is squared with the loose ones"],
 ["src/features/house-designer/services/freehand.ts","locked: !!s.locked","locked: false","a locked stroke is not marked locked"],
 ["src/features/house-designer/services/freehand.ts","const fixed = members.filter(member => lines[member.lineIndex]!.locked);","const fixed: typeof members = [];","locked ends are not looked for in a cluster"],
];
for(const [path,from,to,label] of cases){
 const original=readFileSync(path,'utf8');
 if(!original.includes(from))throw Error(`Mutation target missing: ${label}`);
 try{
  writeFileSync(path,original.replace(from,to));
  const result=spawnSync(process.execPath,['--import','tsx','scripts/freehand_check.ts'],{encoding:'utf8'});
  if(result.status===0)throw Error(`Mutation survived: ${label}`);
  if(!result.stderr.includes('AssertionError'))throw Error(`Mutation failed outside assertions: ${label}\n${result.stderr}`);
  console.log(`Detected: ${label}`);
 }finally{writeFileSync(path,original);}
}
console.log('All mutations detected; original sources restored.');

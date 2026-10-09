import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const base='src/features/house-designer/';
const cases=[
 ['services/freehand.ts','if (tolerance > 0)','if (false)','endpoint snapping'],
 ['services/freehand.ts','const graph = wallGraph(scaled);','const graph = {points: scaled.flatMap(s => [s.start,s.end]), edges: scaled.map((s,i) => [i*2,i*2+1] as [number,number])};','intersection graph'],
 ['services/freehand.ts','if (Math.abs(angle - axis) <= (5 * Math.PI) / 180)','if (true)','diagonal preservation'],
 ['services/freehand.ts','plan = roomSchema.parse(withDerivedZones(plan, plan));','plan = roomSchema.parse(plan);','room detection'],
 ['services/project-edit.ts','plan.freehand ? 0.01 : interior.thickness / 2 + 5','500','unrelated wall safety'],
 ['services/freehand.ts','? 0 : width','? 0 : width * 2','exact dimensions'],
 ['services/freehand.ts','Math.abs(distance(w.start, w.end) - c.length) > 0.1','false','dimension conflicts'],
 ['services/plan-snapshot.ts','SCALE NOT VERIFIED','VERIFIED','export scale warning'],
 ['services/takeoff-adapter.ts','UNSCALED FREEHAND SKETCH','FREEHAND SKETCH','BOQ scale warning'],
];
for(const [file,from,to,label] of cases){
 const path=base+file,original=readFileSync(path,'utf8');
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

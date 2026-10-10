import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const join='src/features/berchuma-studio/services/wall-joins.ts';
const cases=[
 [join,'if(rays.length<2)continue;','if(true)continue;','wall_joins_check.ts','mitred corners'],
 [join,'if(boundary.length>=3&&','if(false&&','wall_joins_check.ts','junction fill'],
 [join,'if(from>EPS)clip(from,1);','if(false)clip(from,1);','wall_joins_check.ts','opening trim'],
 [join,'>limit)continue;','>Infinity)continue;','wall_joins_check.ts','acute corner limit'],
 ['src/features/berchuma-studio/components/plan/plan-canvas.tsx','joins?.footprints.has(wall.id)','false','wall_joins_check.ts','plan renderer binding'],
 ['src/features/house-designer/services/freehand.ts','if (horizontal.length) mean.y','if (false) mean.y','freehand_check.ts','orthogonal snap'],
];
for(const [path,from,to,test,label] of cases){
 const original=readFileSync(path,'utf8');if(!original.includes(from))throw Error('Missing mutation: '+label);
 try{writeFileSync(path,original.replace(from,to));const result=spawnSync(process.execPath,['--import','tsx','scripts/'+test],{encoding:'utf8'});if(result.status===0||!result.stderr.includes('AssertionError'))throw Error('Mutation was not caught by assertions: '+label+'\n'+result.stderr);console.log('Detected: '+label);}finally{writeFileSync(path,original);}
}
console.log('All six mutations caught; original files restored.');

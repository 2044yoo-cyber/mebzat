import assert from "node:assert/strict";
import { joinedWallFootprints, wallSectionFootprint, type JoinWall } from "../src/features/berchuma-studio/services/wall-joins";
import { signedArea, overlapArea, pointInPolygon } from "../src/features/house-designer/services/room-topology";
import { Shape, ExtrudeGeometry } from "three";
import { PlanCanvas } from "../src/features/berchuma-studio/components/plan/plan-canvas";
import { roomSchema } from "../src/features/berchuma-studio/types/room";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const wall=(id:string,x:number,y:number,thickness=200):JoinWall=>({id,start:{x:0,y:0},end:{x,y},thickness});
let checks=0;
function check(walls:JoinWall[],label:string){
  const before=JSON.stringify(walls),joins=joinedWallFootprints(walls);
  const polygons=[...joins.footprints.values(),...joins.junctions.map(j=>j.boundary)];
  for(let i=0;i<polygons.length;i++){
    const p=polygons[i]!;assert.ok(p.every(v=>Number.isFinite(v.x)&&Number.isFinite(v.y)),label+" finite");
    assert.ok(Math.abs(signedArea(p))>.01,label+" nonzero polygon");
    for(let j=i+1;j<polygons.length;j++)assert.ok(overlapArea(p,polygons[j]!)<.1,label+" no overlapping wall polygons");
    const shape=new Shape();p.forEach((v,k)=>k?shape.lineTo(v.x/1000,v.y/1000):shape.moveTo(v.x/1000,v.y/1000));shape.closePath();
    const geometry=new ExtrudeGeometry(shape,{depth:3,bevelEnabled:false});geometry.computeBoundingBox();
    assert.equal(geometry.boundingBox!.max.z,3,label+" full 3D height");assert.ok([...geometry.attributes.position!.array].every(Number.isFinite),label+" valid 3D vertices");geometry.dispose();checks+=5;
  }
  assert.equal(JSON.stringify(walls),before,label+" keeps editable centre lines");
  for(const x of [-73,-31,17,67])for(const y of [-71,-27,19,69])assert.ok(polygons.some(p=>pointInPolygon({x,y},p)),label+" continuous junction fill");
  checks+=17;return joins;
}
const l=check([wall("a",2000,0),wall("b",0,2000)],"L");
assert.ok(l.footprints.get("a")!.some(p=>p.x===-100&&p.y===-100),"L outer mitre extends both faces");
assert.equal(l.junctions.length,0,"two walls meet along a shared mitre");
check([wall("a",2000,0),wall("b",0,2000,300)],"unequal L");
const t=check([wall("a",2000,0),wall("b",0,2000),wall("c",-2000,0)],"T");assert.equal(t.junctions.length,1,"T central patch");
const x=check([wall("a",2000,0),wall("b",0,2000),wall("c",-2000,0),wall("d",0,-2000)],"X");assert.equal(x.junctions.length,1,"X central patch");
check([wall("a",2000,0),wall("b",0,2000)].map(w=>({...w,start:w.end,end:w.start})),"reversed L");
const tilted=joinedWallFootprints([wall("a",2000,30),wall("b",0,2000)]);
assert.ok(tilted.footprints.get("a")!.some(p=>p.x<0&&p.y<0),"slightly tilted screenshot corner still mitres");
const acute=joinedWallFootprints([wall("a",2000,0),wall("b",2000,5)]);
assert.ok([...acute.footprints.values()].flat().every(p=>Math.abs(p.x)<2200&&Math.abs(p.y)<400),"acute corner has no long spikes");
const separated=joinedWallFootprints([wall("a",2000,0),{...wall("b",0,2000),start:{x:0,y:50}}]);assert.equal(separated.junctions.length,0,"unconnected endpoints are not moved or bridged");
const body=wallSectionFootprint(wall("a",2000,0),l.footprints.get("a")!,500,1200);assert.equal(Math.abs(signedArea(body)),140000,"opening clipping retains exact offsets");assert.ok(body.every(p=>p.x>=500&&p.x<=1200));
assert.deepEqual(wallSectionFootprint(wall("a",2000,0),l.footprints.get("a")!,0,2000),l.footprints.get("a"),"full wall preserves mitred ends");
const room=roomSchema.parse({version:1,freehand:true,corners:[],interiorWalls:[wall("a",2000,0),wall("b",0,2000)].map(w=>({...w,height:3000}))});
const markup=renderToStaticMarkup(createElement(PlanCanvas,{room,onChange:()=>{}}));
assert.equal((markup.match(/data-joined-wall=/g)||[]).length,2,"plan renders shared footprints");assert.ok(markup.includes("-100,-100"),"plan contains outer mitre");
console.log(`Wall joins: ${checks+13} checks passed for L/T/X, unequal/diagonal walls, openings, plan polygons and 3D extrusion.`);

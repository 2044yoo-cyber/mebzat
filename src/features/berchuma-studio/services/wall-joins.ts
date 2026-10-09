/** Shared plan/3D footprints. Units are mm; only coincident endpoints join.
 * Wall bodies meet along mitres; a separate non-overlapping junction polygon
 * closes degree-three/four nodes. This never moves the editable centre lines.
 */
export type JoinPoint = { x: number; y: number };
export type JoinWall = { id: string; start: JoinPoint; end: JoinPoint; thickness: number };
type Ray = { wall: JoinWall; end: "start" | "end"; x: number; y: number; length: number; angle: number; left: JoinPoint; right: JoinPoint };
export type WallJunction = { point: JoinPoint; boundary: JoinPoint[]; wallIds: string[] };
export type WallJoins = { footprints: Map<string, JoinPoint[]>; junctions: WallJunction[] };
const EPS = .01;
const cross = (a: JoinPoint, b: JoinPoint) => a.x*b.y-a.y*b.x;
const same = (a: JoinPoint,b: JoinPoint) => Math.hypot(a.x-b.x,a.y-b.y)<EPS;
export function joinedWallFootprints(walls: readonly JoinWall[]): WallJoins {
  const nodes: { point: JoinPoint; rays: Ray[] }[]=[];
  const ends=new Map<string,{start:Ray;end:Ray}>();
  for(const wall of walls){
    const length=Math.hypot(wall.end.x-wall.start.x,wall.end.y-wall.start.y);
    if(length<EPS||!Number.isFinite(length)||!(wall.thickness>0))continue;
    const rays={} as {start:Ray;end:Ray};
    for(const end of ["start","end"] as const){
      const point=wall[end],other=wall[end==="start"?"end":"start"];
      const x=(other.x-point.x)/length,y=(other.y-point.y)/length,h=wall.thickness/2;
      const ray:Ray={wall,end,x,y,length,angle:Math.atan2(y,x),left:{x:point.x-y*h,y:point.y+x*h},right:{x:point.x+y*h,y:point.y-x*h}};
      let node=nodes.find(n=>same(n.point,point));
      if(!node){node={point:{...point},rays:[]};nodes.push(node);}
      node.rays.push(ray);rays[end]=ray;
    }
    ends.set(wall.id,rays);
  }
  const junctions:WallJunction[]=[];
  for(const node of nodes){
    const rays=node.rays.sort((a,b)=>a.angle-b.angle);
    if(rays.length<2)continue;
    // Adjacent offset faces intersect on their shared mitre. Opposite parallel
    // faces need no extension; very acute corners use a bounded bevel instead.
    for(let i=0;i<rays.length;i++){
      const a=rays[i]!,b=rays[(i+1)%rays.length]!;
      const determinant=cross(a,b);
      if(Math.abs(determinant)<1e-8)continue;
      const delta={x:b.right.x-a.left.x,y:b.right.y-a.left.y};
      const t=cross(delta,b)/determinant;
      const intersection={x:a.left.x+t*a.x,y:a.left.y+t*a.y};
      const limit=Math.min(Math.max(a.wall.thickness,b.wall.thickness)*4,a.length*.45,b.length*.45);
      if(Math.hypot(intersection.x-node.point.x,intersection.y-node.point.y)>limit)continue;
      a.left={...intersection};b.right={...intersection};
    }
    const boundary:JoinPoint[]=[];
    for(const ray of rays)for(const p of [ray.right,ray.left])if(!boundary.length||!same(boundary.at(-1)!,p))boundary.push({...p});
    if(boundary.length>1&&same(boundary[0]!,boundary.at(-1)!))boundary.pop();
    if(boundary.length>=3&&Math.abs(polygonSignedArea(boundary))>.01)junctions.push({point:node.point,boundary,wallIds:rays.map(r=>r.wall.id)});
  }
  const footprints=new Map<string,JoinPoint[]>();
  for(const [id,rays] of ends)footprints.set(id,[rays.start.left,rays.end.right,rays.end.left,rays.start.right].map(p=>({...p})));
  return {footprints,junctions};
}
function polygonSignedArea(p: readonly JoinPoint[]){return p.reduce((a,v,i)=>{const n=p[(i+1)%p.length]!;return a+v.x*n.y-n.x*v.y;},0)/2;}
/** Trim an opening's longitudinal section without cutting mitres at wall ends. */
export function wallSectionFootprint(wall:JoinWall,footprint:readonly JoinPoint[],from:number,to:number):JoinPoint[]{
  const length=Math.hypot(wall.end.x-wall.start.x,wall.end.y-wall.start.y);
  if(length<EPS||to<=from)return [];
  const x=(wall.end.x-wall.start.x)/length,y=(wall.end.y-wall.start.y)/length;
  const along=(p:JoinPoint)=>(p.x-wall.start.x)*x+(p.y-wall.start.y)*y;
  let result=footprint.map(p=>({...p}));
  const clip=(at:number,sign:number)=>{
    const input=result;result=[];
    for(let i=0;i<input.length;i++){
      const a=input[i]!,b=input[(i+1)%input.length]!,da=(along(a)-at)*sign,db=(along(b)-at)*sign;
      if(da>=-EPS)result.push(a);
      if((da<0&&db>0)||(da>0&&db<0)){const t=da/(da-db);result.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}
    }
  };
  if(from>EPS)clip(from,1);
  if(to<length-EPS)clip(to,-1);
  return result;
}

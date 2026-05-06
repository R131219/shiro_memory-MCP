process.stdout.setBlocking&&process.stdout.setBlocking(true);
const fs=require('fs'),path=require('path'),readline=require('readline');
class M{async read(i){throw Error('unimpl')}async write(i,c){throw Error('unimpl')}async search(k){throw Error('unimpl')}async delete(i){throw Error('unimpl')}async list(){throw Error('unimpl')}}
function ok(d){return{success:true,data:d}}
function fail(m,c){return{success:false,error:m,code:c||'UNKNOWN'}}
class F extends M{
constructor(c){super();this.d=c.memoryDir||'./shiro_memories';this.cache=new Map();this.ttl=c.cacheTTL||6e4;if(!fs.existsSync(this.d))fs.mkdirSync(this.d,{recursive:true})}
_p(i){return path.join(this.d,i.replace(/[^a-zA-Z0-9_-]/g,'_')+'.json')}
async read(i){let x=this.cache.get(i);if(x&&Date.now()-x.t<this.ttl)return ok(x.d);let p=this._p(i);if(!fs.existsSync(p))return fail('not found:'+i,'NF');let d=JSON.parse(fs.readFileSync(p,'utf8'));this.cache.set(i,{d,t:Date.now()});return ok(d)}
async write(i,c){let p=this._p(i),e={...c,_id:i,_updated:new Date().toISOString()};fs.writeFileSync(p,JSON.stringify(e,null,2),'utf8');this.cache.set(i,{d:e,t:Date.now()});return ok({memoryId:i,_updated:e._updated})}
async search(k){if(!fs.existsSync(this.d))return ok([]);let kw=k.toLowerCase(),r=[];for(let f of fs.readdirSync(this.d)){if(!f.endsWith('.json'))continue;try{let d=JSON.parse(fs.readFileSync(path.join(this.d,f),'utf8'));if(JSON.stringify(d).toLowerCase().includes(kw))r.push({memoryId:f.replace('.json',''),data:d})}catch(_){}}return ok(r)}
async delete(i){let p=this._p(i);if(!fs.existsSync(p))return fail('not found:'+i,'NF');fs.unlinkSync(p);this.cache.delete(i);return ok({memoryId:i,deleted:true})}
async list(){if(!fs.existsSync(this.d))return ok([]);return ok(fs.readdirSync(this.d).filter(f=>f.endsWith('.json')).map(f=>({memoryId:f.replace('.json','')})))}
}
class S{constructor(c){this.a=new F(c||{})}async pr(i){return i?this.a.read(i):fail('no id')}async pw(i,c){return i&&c?this.a.write(i,c):fail('no params')}async ps(k){return k?this.a.search(k):fail('no kw')}async pd(i){return i?this.a.delete(i):fail('no id')}async pl(){return this.a.list()}async pst(){let r=await this.a.list();return r.success?ok({total:r.data.length}):r}}
const srv=new S({memoryDir:'./shiro_memories'});
console.log('{}');
const rl=readline.createInterface({input:process.stdin,output:process.stdout,terminal:false});
let okFlag=false;
rl.on('line',async line=>{
  let req;
  try{
    req=JSON.parse(line);
    const {id,method,params}=req;
    if(method==='initialize'){
      console.log(JSON.stringify({
        jsonrpc:'2.0',id,
        result:{
          protocolVersion:'2024-11-05',
          capabilities:{
            tools:JSON.parse('{"mem_save":{"description":"save","inputSchema":{"type":"object","properties":{"memoryId":{"type":"string"},"content":{"type":"object"}},"required":["memoryId","content"]}},"mem_search":{"description":"search","inputSchema":{"type":"object","properties":{"keyword":{"type":"string"}},"required":["keyword"]}},"mem_context":{"description":"context","inputSchema":{"type":"object","properties":{}}},"mem_update":{"description":"update","inputSchema":{"type":"object","properties":{"memoryId":{"type":"string"},"content":{"type":"object"}},"required":["memoryId","content"]}},"mem_delete":{"description":"delete","inputSchema":{"type":"object","properties":{"memoryId":{"type":"string"}},"required":["memoryId"]}},"mem_stats":{"description":"stats","inputSchema":{"type":"object","properties":{}}}}')
          },
          serverInfo:{name:'shiro_memory',version:'2.0.0'}
        }
      }));
      return;
    }
    if(method==='notifications/initialized'||method==='initialized'){okFlag=true;return;}
    //if(!okFlag)return;
    let r;
    switch(method){
      case'tools/call':
        switch(params.name){
          case'mem_read':case'read':r=await srv.pr(params.arguments?.memoryId);break;
          case'mem_write':case'write':r=await srv.pw(params.arguments?.memoryId,params.arguments?.content);break;
          case'mem_search':case'search':r=await srv.ps(params.arguments?.keyword);break;
          case'mem_delete':case'delete':r=await srv.pd(params.arguments?.memoryId);break;
          case'mem_list':case'list':r=await srv.pl();break;
          case'mem_stats':case'stats':r=await srv.pst();break;
          default:r=fail('unknown tool:'+params.name);
        }
        break;
      default:r=fail('unknown method:'+method);
    }
    console.log(JSON.stringify({jsonrpc:'2.0',id,result:r}));
  }catch(e){
    console.log(JSON.stringify({jsonrpc:'2.0',id:req?.id??0,error:{code:-32700,message:e.message}}));
  }
});

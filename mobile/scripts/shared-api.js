// Shared mode for the claude.ai artifact: answers the app's /api calls from the
// artifact's shared database, so the customer app and the owner app (on any device
// signed in to claude.ai with access) see the same menu, customers and live orders.
// Falls back to this device's local storage when the database is not available.
(function(){
  const SPECS={sizes:{key:'id'},outlets:{key:'id'},menu:{key:'id'},addons:{map:1},offers:{key:'id'},combos:{key:'id'},extras:{key:'id'},users:{key:'id',pin:1},customers:{map:1,pin:1},orders:{key:'id'}};
  const COLS=Object.keys(SPECS);const LOCAL='cheesy-preview-db-v1';
  const M={c:{},v:1,demo:false,cfg:null,shared:false,canWrite:true};COLS.forEach(n=>M.c[n]={});
  window.CHEESY_SHARED=M;
  let posN=0;const newPos=()=>Date.now()*100+(posN++%100);
  // Document ids allow letters, digits and _ - . : @ + only
  const enc=k=>String(k).replace(/[^A-Za-z0-9_\-.:@+]/g,c=>'~'+c.charCodeAt(0).toString(16).padStart(4,'0'));
  const dec=k=>k.replace(/~([0-9a-f]{4})/g,(_,h)=>String.fromCharCode(parseInt(h,16)));
  const clone=o=>JSON.parse(JSON.stringify(o));
  let db=null;const chains=new Map();
  // One write at a time per document
  function put(path,body){const p=(chains.get(path)||Promise.resolve()).catch(()=>{}).then(()=>body?db.doc(path).set(body):db.doc(path).delete());chains.set(path,p);return p}
  async function runAll(jobs){const errs=[];for(let i=0;i<jobs.length;i+=6)await Promise.all(jobs.slice(i,i+6).map(j=>j().catch(e=>errs.push(e))));if(errs.length)throw errs[0]}
  const keepLocal=()=>{if(M.shared)return;try{localStorage.setItem(LOCAL,JSON.stringify({c:M.c,v:M.v,demo:M.demo,cfg:M.cfg}))}catch(e){}};

  function seqMap(){const seq={};const out=M.c.outlets;
    Object.values(M.c.orders).forEach(o=>{const ou=out[String(o.outletId)];if(!ou||!o.date||!o.no)return;const m=new RegExp('^'+ou.code+'-(\\d+)$').exec(o.no);if(!m)return;const key=o.outletId+'|'+o.date;seq[key]=Math.max(seq[key]||0,+m[1])});return seq}
  // Applies a change set to the mirror and returns the documents to write
  function apply(ch,writes){const up=ch.upsert||{},del=ch.delete||{},ren={};const seq=seqMap();
    for(const n of COLS){const spec=SPECS[n];
      (del[n]||[]).forEach(k=>{k=String(k);if(M.c[n][k]){delete M.c[n][k];writes.push(['rec_'+n+'/'+enc(k),null])}});
      const items=up[n];if(!items)continue;
      const ents=Array.isArray(items)?items.map(o=>[o[spec.key],o]):Object.entries(items);
      for(const [k0,obj] of ents){const k=String(k0);const old=M.c[n][k];const {pin,_newPin,...rest}=obj;const d={...clone(rest),_pos:old?old._pos:newPos()};
        if(n==='extras'&&d.items)d.items=d.items.map(({from,...it})=>it);
        if(spec.pin){if(_newPin)d._pin=String(_newPin);else if(pin&&old&&old._pin)d._pin=old._pin}
        if(n==='orders'&&!old){const out=M.c.outlets[String(obj.outletId)];if(out&&obj.date){const key=obj.outletId+'|'+obj.date;seq[key]=(seq[key]||0)+1;const no=out.code+'-'+String(seq[key]).padStart(3,'0');if(no!==obj.no){d.no=no;ren[k]=no}}}
        M.c[n][k]=d;writes.push(['rec_'+n+'/'+enc(k),d])}}
    M.v++;return {prev:M.v-1,version:M.v,renumbered:ren,seq}}
  function read(n){const spec=SPECS[n];const docs=Object.entries(M.c[n]).sort((a,b)=>a[1]._pos-b[1]._pos);
    const toApp=d=>{const {_pos,_pin,...o}=clone(d);if(spec.pin&&_pin)o.pin=true;return o};
    return spec.map?Object.fromEntries(docs.map(([k,d])=>[k,toApp(d)])):docs.map(([,d])=>toApp(d))}
  function state(){const st={};COLS.forEach(n=>st[n]=read(n));st.seq=seqMap();st.config=M.cfg;return {version:M.v,demoPending:M.demo,state:st}}
  function seedWrites(){const data=seedData();M.cfg={categories:data.categories,orderTypes:data.orderTypes,payModes:data.payModes,...data.config};M.demo=true;
    COLS.forEach(n=>M.c[n]={});const w=[];apply({upsert:data.state},w);return w}
  const metaBody=()=>({demo:M.demo,cfg:M.cfg});

  async function connectShared(){
    let user=null;try{user=await window.claude.use('user')}catch(e){}
    try{const w=user&&user.can?await user.can('data.write'):null;if(w===false)M.canWrite=false}catch(e){}
    M.isOwner=!!(user&&user.isOwner&&user.isOwner());M.canEdit=!!(user&&user.canEdit&&user.canEdit());
    let first=new Set();let done;const ready=new Promise(r=>done=r);
    const mark=n=>{if(!first.has(n)){first.add(n);if(first.size===COLS.length+1)done()}};
    COLS.forEach(n=>db.collection('rec_'+n).onSnapshot(snap=>{let ch=false;
      snap.docChanges().forEach(x=>{const k=dec(x.doc.id);
        if(x.type==='removed'){if(M.c[n][k]){delete M.c[n][k];ch=true}return}
        const d=x.doc.data();if(JSON.stringify(M.c[n][k])!==JSON.stringify(d)){M.c[n][k]=clone(d);ch=true}});
      if(ch&&first.has(n))M.v++;mark(n)},e=>console.error('db',n,e)));
    db.doc('meta/main').onSnapshot(s=>{if(s.exists){const d=s.data();if(JSON.stringify(metaBody())!==JSON.stringify({demo:d.demo,cfg:d.cfg})){M.demo=!!d.demo;M.cfg=d.cfg;if(first.has('meta'))M.v++}}M.metaExists=s.exists;mark('meta')},e=>console.error('db meta',e));
    await ready;
    if(!M.metaExists){
      if(!M.canWrite)throw new Error('This shop has not been set up yet. Ask the owner to open it first.');
      const w=seedWrites();await runAll(w.map(([p,b])=>()=>put(p,b)));await put('meta/main',metaBody());
    }
    M.shared=true;
  }
  function connectLocal(){
    try{const j=JSON.parse(localStorage.getItem(LOCAL));if(j&&j.c&&j.cfg){M.c=j.c;COLS.forEach(n=>M.c[n]=M.c[n]||{});M.v=j.v||1;M.demo=!!j.demo;M.cfg=j.cfg;return}}catch(e){}
    seedWrites();keepLocal();
  }
  const ready=(async()=>{
    try{db=window.claude&&window.claude.use?await window.claude.use('db'):null}catch(e){db=null}
    if(db){try{await connectShared();return}catch(e){console.error(e);M.err=e.message||String(e);if(/set up/.test(M.err))throw e}}
    db=null;connectLocal();
  })();
  window.CHEESY_READY=ready;

  async function shrink(d,max){if(d.length<=max)return d;
    const im=new Image();await new Promise((ok,bad)=>{im.onload=ok;im.onerror=bad;im.src=d});
    for(let w=900,q=.8;w>=240;w=Math.round(w*.8),q=Math.max(.5,q-.08)){const k=Math.min(1,w/Math.max(im.width,im.height));const c=document.createElement('canvas');c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);c.getContext('2d').drawImage(im,0,0,c.width,c.height);const out=c.toDataURL('image/jpeg',q);if(out.length<=max)return out}
    throw new Error('Image is too big')}
  async function save(writes){if(!M.shared){keepLocal();return}
    await runAll(writes.map(([p,b])=>()=>put(p,b)))}

  const ok=b=>new Response(JSON.stringify(b),{status:200,headers:{'Content-Type':'application/json'}});
  const bad=(s,m)=>new Response(JSON.stringify({error:m}),{status:s,headers:{'Content-Type':'application/json'}});
  const real=window.fetch.bind(window);
  window.fetch=async function(url,opt={}){
    const u=String(url);const m=/\/?api\/([\w/]+)/.exec(u);if(!m||/^https?:/.test(u))return real(url,opt);
    const path=m[1];let body={};try{body=opt.body?JSON.parse(opt.body):{}}catch(e){}
    try{await ready}catch(e){return bad(503,e.message)}
    if(path==='state')return ok(state());
    if(path==='version')return ok({version:M.v});
    if(path==='sync'){const w=[];const r=apply(body,w);try{await save(w)}catch(e){return bad(e&&e.code==='quota_exceeded'?507:403,e&&e.code==='quota_exceeded'?'The shop database is full':'You can view this shop but not change it')}return ok(r)}
    if(path==='auth/staff'){const s=M.c.users[String(body.id)];return ok({ok:!!s&&s._pin===String(body.pin)})}
    if(path==='auth/customer'){const c=M.c.customers[String(body.phone)];return ok({ok:!!c&&c._pin===String(body.pin)})}
    if(path==='images'){let d=String(body.data||'');if(!/^data:image\/(jpeg|png|webp);base64,/.test(d))return bad(400,'Send a JPEG, PNG or WebP image');
      try{d=await shrink(d,M.shared?160000:4.2e6)}catch(e){return bad(413,'Image is too big')}return ok({url:d})}
    if(path==='demo/claim'){const r=M.demo;if(r){M.demo=false;try{if(M.shared)await put('meta/main',metaBody());else keepLocal()}catch(e){}}return ok({ok:r})}
    if(path==='reset'){const w=[];COLS.forEach(n=>Object.keys(M.c[n]).forEach(k=>w.push(['rec_'+n+'/'+enc(k),null])));
      const s=seedWrites();const keep=new Set(s.map(x=>x[0]));try{await save(w.filter(x=>!keep.has(x[0])).concat(s));if(M.shared)await put('meta/main',metaBody())}catch(e){return bad(403,'You can view this shop but not change it')}
      M.v++;return ok(state())}
    if(path==='config')return ok(M.cfg);
    return bad(404,'Not available here');
  };
})();

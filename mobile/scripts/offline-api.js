// Offline mode: there is no server, so the app's /api calls are answered here on the
// device, from the starting data in server/seed-data.js. Everything is kept in this
// device's local storage only and is not shared with other phones.
(function(){
  const SPECS={sizes:{key:'id'},outlets:{key:'id'},menu:{key:'id'},addons:{map:1},offers:{key:'id'},combos:{key:'id'},extras:{key:'id'},users:{key:'id',pin:1},customers:{map:1,pin:1},orders:{key:'id'}};
  const COLS=Object.keys(SPECS);const KEY='cheesy-preview-db-v1';
  let mem=null;
  const load=()=>{try{const j=localStorage.getItem(KEY);if(j)return JSON.parse(j)}catch(e){}return mem};
  const keep=db=>{mem=db;try{localStorage.setItem(KEY,JSON.stringify(db))}catch(e){}};
  function seed(){
    const data=seedData();const db={c:{},pos:0,v:1,seq:{},demo:true,img:{},
      cfg:{categories:data.categories,orderTypes:data.orderTypes,payModes:data.payModes,...data.config}};
    COLS.forEach(n=>db.c[n]={});apply(db,{upsert:data.state});db.v=1;keep(db);return db;
  }
  const get=()=>load()||seed();
  function apply(db,ch){const up=ch.upsert||{},del=ch.delete||{},ren={};
    for(const n of COLS){const spec=SPECS[n];(del[n]||[]).forEach(k=>delete db.c[n][String(k)]);const items=up[n];if(!items)continue;
      const ents=Array.isArray(items)?items.map(o=>[o[spec.key],o]):Object.entries(items);
      for(const [k0,obj] of ents){const k=String(k0);const old=db.c[n][k];const {pin,_newPin,...rest}=obj;const d={...JSON.parse(JSON.stringify(rest)),_pos:old?old._pos:++db.pos};
        if(n==='extras'&&d.items)d.items=d.items.map(({from,...it})=>it);
        if(spec.pin){if(_newPin)d._pin=String(_newPin);else if(pin&&old)d._pin=old._pin}
        if(n==='orders'&&!old){const out=db.c.outlets[String(obj.outletId)];if(out&&obj.date){const key=obj.outletId+'|'+obj.date;db.seq[key]=(db.seq[key]||0)+1;const no=out.code+'-'+String(db.seq[key]).padStart(3,'0');if(no!==obj.no){d.no=no;ren[k]=no}}}
        db.c[n][k]=d}}
    db.v++;return {prev:db.v-1,version:db.v,renumbered:ren,seq:{...db.seq}}}
  function read(db,n){const spec=SPECS[n];const docs=Object.entries(db.c[n]).sort((a,b)=>a[1]._pos-b[1]._pos);
    const toApp=d=>{const {_pos,_pin,...o}=JSON.parse(JSON.stringify(d));if(spec.pin&&_pin)o.pin=true;return o};
    return spec.map?Object.fromEntries(docs.map(([k,d])=>[k,toApp(d)])):docs.map(([,d])=>toApp(d))}
  function state(db){const st={};COLS.forEach(n=>st[n]=read(db,n));st.seq={...db.seq};st.config=db.cfg;return {version:db.v,demoPending:db.demo,state:st}}
  const ok=b=>new Response(JSON.stringify(b),{status:200,headers:{'Content-Type':'application/json'}});
  const bad=(s,m)=>new Response(JSON.stringify({error:m}),{status:s,headers:{'Content-Type':'application/json'}});
  const real=window.fetch.bind(window);
  window.fetch=async function(url,opt={}){
    const u=String(url);const m=/\/?api\/([\w/]+)/.exec(u);if(!m||/^https?:/.test(u))return real(url,opt);
    const path=m[1];let body={};try{body=opt.body?JSON.parse(opt.body):{}}catch(e){}
    const db=get();
    if(path==='state')return ok(state(db));
    if(path==='version')return ok({version:db.v});
    if(path==='sync'){const r=apply(db,body);keep(db);return ok(r)}
    if(path==='auth/staff'){const s=db.c.users[String(body.id)];return ok({ok:!!s&&s._pin===String(body.pin)})}
    if(path==='auth/customer'){const c=db.c.customers[String(body.phone)];return ok({ok:!!c&&c._pin===String(body.pin)})}
    if(path==='images'){const d=String(body.data||'');if(!/^data:image\/(jpeg|png|webp);base64,/.test(d))return bad(400,'Send a JPEG, PNG or WebP image');if(d.length>4.2e6)return bad(413,'Image is too big');return ok({url:d})}
    if(path==='demo/claim'){const r=db.demo;db.demo=false;keep(db);return ok({ok:r})}
    if(path==='reset'){mem=null;try{localStorage.removeItem(KEY)}catch(e){}return ok(state(seed()))}
    if(path==='config')return ok(db.cfg);
    return bad(404,'Not in the preview');
  };
})();


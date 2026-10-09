// Shared artifact: each device runs either the customer app or the owner app.
// The choice is remembered on the device; only the shop's owner and editors can pick the owner app.
(function(){
  const RKEY='cheesy-app-role';
  let role=null;try{role=localStorage.getItem(RKEY)}catch(e){}
  const M=window.CHEESY_SHARED;
  const ownerOk=()=>!M.shared||M.isOwner||M.canEdit;
  function setRole(r){role=r;try{localStorage.setItem(RKEY,r)}catch(e){}
    document.body.classList.toggle('role-customer',r==='customer');document.body.classList.toggle('role-owner',r==='owner');
    const mode=r==='owner'?'pos':'public';try{history.replaceState(null,'','#'+mode)}catch(e){}
    if(typeof S!=='undefined'&&S){S.mode=mode;if(r==='customer')S.staffId=null;U.board=false;saveLocal();closeModal();render();window.scrollTo(0,0)}}
  if(role)setRole(role);
  function chooser(){
    const el=document.createElement('div');el.id='chooser';el.setAttribute('role','dialog');el.setAttribute('aria-label','Choose an app');
    el.innerHTML=`<div class="ch-card"><div class="ch-logo">C</div><h2>Welcome to Cheesy Pizza</h2><p>Who is using this device?</p>
      <button class="ch-opt" data-r="customer"><span>🍕</span><b>Customer app</b><small>Browse the menu, order and track it live</small></button>
      ${ownerOk()?`<button class="ch-opt" data-r="owner"><span>🧑‍🍳</span><b>Owner app</b><small>POS, kitchen and new-order alerts</small></button>`:''}
      <p class="ch-note">Both apps share the same live orders. You can switch later from the menu footer.</p></div>`;
    el.addEventListener('click',e=>{const b=e.target.closest('[data-r]');if(!b)return;setRole(b.dataset.r);el.remove()});
    document.body.appendChild(el);
  }
  // Customer devices never open the POS; the owner can switch the device over instead
  document.addEventListener('click',e=>{const b=e.target.closest('[data-act="mode"]');if(!b)return;
    if(role==='customer'&&b.dataset.v==='pos'){e.stopImmediatePropagation();e.preventDefault();if(ownerOk())setRole('owner')}
    if(role==='owner'&&b.dataset.v==='public'&&b.dataset.switch){e.stopImmediatePropagation();e.preventDefault();setRole('customer')}},true);
  (window.CHEESY_READY||Promise.resolve()).catch(()=>{}).then(()=>{
    document.body.classList.toggle('can-own',ownerOk());
    if(M.shared&&!M.canWrite)document.body.insertAdjacentHTML('beforeend','<div id="viewonly">View only: ask the owner for edit access to place orders.</div>');
    if(!role)chooser();
    // A footer link to switch this device between the two apps
    const f=document.createElement('button');f.id='swapApp';f.className='btn sm ghost';
    const draw=()=>{f.textContent=role==='owner'?'Switch this device to the customer app':'Switch this device to the owner app';f.hidden=!role||(role==='customer'&&!ownerOk())};
    f.onclick=()=>{setRole(role==='owner'?'customer':'owner');draw()};draw();document.body.appendChild(f);
    new MutationObserver(draw).observe(document.body,{attributes:true,attributeFilter:['class']});
  });
})();

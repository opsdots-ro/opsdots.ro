(()=>{
  const EN=document.documentElement.lang.startsWith('en');
  const L=EN?
    {n:'Name',c:'Company',e:'Email',i:'Interest',subj:'Enquiry — ',
     sending:'Sending…',ok:'Thank you! Your message has been sent — we will get back to you within one working day.',
     invalid:'Please check the highlighted fields (name, a valid email and a message of at least 10 characters).',
     rate:'Too many attempts. Please wait a minute and try again.',
     captcha:'Please complete the anti-spam check and try again.',
     fail:'The message could not be sent right now.',offline:'The form only sends from the live site (www.opsdots.ro).',viaMail:'Send it by email instead →'}:
    {n:'Nume',c:'Companie',e:'Email',i:'Interes',subj:'Cerere ofertă — ',
     sending:'Se trimite…',ok:'Mulțumim! Mesajul a fost trimis — revenim cu un răspuns în cel mult o zi lucrătoare.',
     invalid:'Verifică câmpurile marcate (nume, un email valid și un mesaj de minimum 10 caractere).',
     rate:'Prea multe încercări. Te rugăm să aștepți un minut și să încerci din nou.',
     captcha:'Te rugăm să completezi verificarea anti-spam și să încerci din nou.',
     fail:'Mesajul nu a putut fi trimis momentan.',offline:'Formularul trimite doar de pe site-ul publicat (www.opsdots.ro).',viaMail:'Trimite-l prin email →'};

  // meniu mobil
  const b=document.querySelector('.burger'),m=document.getElementById('menu');
  if(b&&m){
    b.addEventListener('click',()=>{const o=m.classList.toggle('open');b.setAttribute('aria-expanded',o)});
    m.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{m.classList.remove('open');b.setAttribute('aria-expanded',false)}));
  }
  // animații la scroll
  if('IntersectionObserver' in window){
    const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.12});
    document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
  } else document.querySelectorAll('.reveal').forEach(el=>el.classList.add('in'));
  const y=document.getElementById('y'); if(y) y.textContent=new Date().getFullYear();

  // formular de contact
  const f=document.getElementById('contact-form');
  if(!f) return;
  const status=f.querySelector('.form-status');
  const btn=f.querySelector('button[type=submit]');
  const startedAt=Date.now();
  const online=location.protocol.startsWith('http');
  let tsWidget=null;

  const say=(msg,kind,d)=>{
    if(!status)return;
    status.textContent=msg||''; status.dataset.kind=kind||'';
    if(d){ // link opțional spre aplicația de email, cu mesajul precompletat
      const a=document.createElement('a'); a.href=mailtoUrl(d); a.textContent=' '+L.viaMail; status.appendChild(a);
    }
  };

  const mailtoUrl=d=>{
    const body=`${L.n}: ${d.name}\n${L.c}: ${d.company}\n${L.e}: ${d.email}\n${L.i}: ${d.interest}\n\n${d.message}`;
    return `mailto:contact@opsdots.ro?subject=${encodeURIComponent(L.subj+d.interest)}&body=${encodeURIComponent(body)}`;
  };

  // Turnstile (se încarcă doar dacă serverul are o cheie configurată)
  if(online){
    fetch('/api/config',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(cfg=>{
      if(!cfg||!cfg.turnstileSiteKey) return;
      window.__opsdotsTs=()=>{ tsWidget=window.turnstile.render('#ts',{sitekey:cfg.turnstileSiteKey,theme:'dark',language:EN?'en':'ro',size:'flexible'}); };
      const s=document.createElement('script');
      s.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__opsdotsTs';
      s.async=true; s.defer=true; document.head.appendChild(s);
    }).catch(()=>{});
  }

  f.addEventListener('submit',async e=>{
    e.preventDefault();
    if(!f.reportValidity())return;
    const d=Object.fromEntries(new FormData(f));
    if(!online){ say(L.offline,'error',d); return; }

    btn.disabled=true; say(L.sending,'info');
    try{
      const token=tsWidget!==null&&window.turnstile?window.turnstile.getResponse(tsWidget):undefined;
      const r=await fetch('/api/contact',{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({...d,lang:EN?'en':'ro',t:startedAt,turnstile:token})});
      const res=await r.json().catch(()=>({}));
      if(r.ok&&res.ok){ f.reset(); say(L.ok,'ok'); if(tsWidget!==null)window.turnstile.reset(tsWidget); }
      else if(res.error==='invalid_fields'){ say(L.invalid,'error'); }
      else if(res.error==='rate_limited'){ say(L.rate,'error'); }
      else if(res.error&&res.error.startsWith('turnstile')){ say(L.captcha,'error'); if(tsWidget!==null)window.turnstile.reset(tsWidget); }
      else { say(L.fail,'error',d); console.warn('[opsdots] contact failed',r.status,res.error||''); }
    }catch(err){ say(L.fail,'error',d); console.warn('[opsdots] contact network error',err); }
    finally{ btn.disabled=false; }
  });
})();

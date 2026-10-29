(()=>{
  const L=document.documentElement.lang.startsWith('en')?
    {n:'Name',c:'Company',e:'Email',i:'Interest',subj:'Enquiry — '}:
    {n:'Nume',c:'Companie',e:'Email',i:'Interes',subj:'Cerere ofertă — '};
  const b=document.querySelector('.burger'),m=document.getElementById('menu');
  b.addEventListener('click',()=>{const o=m.classList.toggle('open');b.setAttribute('aria-expanded',o)});
  m.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{m.classList.remove('open');b.setAttribute('aria-expanded',false)}));
  if('IntersectionObserver' in window){
    const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.12});
    document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
  } else document.querySelectorAll('.reveal').forEach(el=>el.classList.add('in'));
  const y=document.getElementById('y'); if(y) y.textContent=new Date().getFullYear();
  try{localStorage.setItem('opsdots-lang',document.documentElement.lang)}catch(e){}
  const f=document.getElementById('contact-form');
  if(f) f.addEventListener('submit',e=>{
    e.preventDefault(); if(!f.reportValidity())return;
    const d=Object.fromEntries(new FormData(f));
    const body=`${L.n}: ${d.name}\n${L.c}: ${d.company}\n${L.e}: ${d.email}\n${L.i}: ${d.interest}\n\n${d.message}`;
    location.href=`mailto:contact@opsdots.ro?subject=${encodeURIComponent(L.subj+d.interest)}&body=${encodeURIComponent(body)}`;
  });
})();

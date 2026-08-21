/* ═══════ PERSONAS (archivo independiente, no rompe app.js) ═══════ */
const A=window.APP;
let currentPersonId=null, editingPersonId=null, editingAsignId=null;
const personAssignments=pid=>A.db.movimientos.filter(m=>m.tipo==='asignacion'&&m.personaId===pid);

/* Modales */
document.body.insertAdjacentHTML('beforeend',
'<div class="overlay" id="ovPersonDetail"><div class="modal"><div class="modal-h"><h3 id="pdTitle">Persona</h3><button class="icon-btn" data-close="ovPersonDetail">✕</button></div><div class="modal-b" id="pdBody"></div><div class="modal-f"><button class="btn btn-ghost" data-close="ovPersonDetail">Cerrar</button><button class="btn btn-primary" id="pdAssign">＋ Asignar artículo</button></div></div></div>'+
'<div class="overlay" id="ovAssign"><div class="modal"><div class="modal-h"><h3 id="asTitle">Asignar artículo</h3><button class="icon-btn" data-close="ovAssign">✕</button></div><div class="modal-b"><form class="frm"><input type="hidden" id="asPersonId"><div class="field"><label>Artículo *</label><input list="dlItems" id="asArt" required></div><div class="frm-2"><div class="field"><label>Cantidad *</label><input type="number" id="asCant" min="1" value="1" required></div><div class="field"><label>Ubicación</label><input id="asUbic" placeholder="Obra / patio..."></div></div><div class="field"><label>Notas</label><input id="asNotas" placeholder="Observaciones..."></div></form></div><div class="modal-f"><button class="btn btn-ghost" data-close="ovAssign">Cancelar</button><button class="btn btn-primary" id="btnSaveAssign">Guardar</button></div></div></div>');
document.addEventListener('click',e=>{const c=e.target.closest('[data-close]');if(c){const o=A.$('#'+c.dataset.close);if(o)o.classList.remove('show')}});

/* Render con botones */
function renderPersonasCustom(){
  A.$('#personasList').innerHTML=A.db.personas.length?A.db.personas.map(p=>{
    const asig=personAssignments(p.id);
    return '<div class="person-card" data-pd="'+p.id+'"><div class="person-head"><div class="person-avatar">'+A.esc((p.nombre||'?').charAt(0))+'</div><div><div class="person-name">'+A.esc(p.nombre)+'</div><div class="person-role">'+A.esc(p.cargo||'Sin cargo')+'</div></div><div style="margin-left:auto;display:flex;gap:6px"><button class="icon-btn" data-pedit="'+p.id+'">✏️</button><button class="icon-btn del" data-pdel="'+p.id+'">🗑️</button></div></div><div class="person-row"><span>Asignaciones</span><b>'+asig.length+'</b></div><div class="hint" style="margin-top:6px">Toca la tarjeta para ver/editar asignaciones</div></div>';
  }).join(''):'<div class="empty"><b>Sin personas</b></div>';
}
window.renderPersonasHook=renderPersonasCustom;

A.$('#personasList').addEventListener('click',e=>{
  const ed=e.target.closest('[data-pedit]');const dl=e.target.closest('[data-pdel]');const card=e.target.closest('[data-pd]');
  if(ed){openPersonEdit(ed.dataset.pedit);return}
  if(dl){deletePerson(dl.dataset.pdel);return}
  if(card)openPersonDetail(card.dataset.pd);
});

/* Editar persona (reusa modal de app.js) */
function openPersonEdit(id){const p=A.db.personas.find(x=>x.id===id);if(!p)return;editingPersonId=id;A.$('#perNombre').value=p.nombre;A.$('#perCargo').value=p.cargo||'';A.$('#ovPerson .modal-h h3').textContent='Editar persona';A.$('#ovPerson').classList.add('show')}
A.$('#btnNewPerson').onclick=()=>{editingPersonId=null;A.$('#perNombre').value='';A.$('#perCargo').value='';A.$('#ovPerson .modal-h h3').textContent='Nueva persona';A.$('#ovPerson').classList.add('show')};
A.$('#btnSavePerson').onclick=()=>{const n=A.$('#perNombre').value.trim();if(!n)return A.toast('Nombre obligatorio','err');const data={nombre:n,cargo:A.$('#perCargo').value.trim()};if(editingPersonId){A.updateDoc(A.doc(A.fdb,'personas',editingPersonId),data);A.toast('Persona actualizada','ok')}else{A.addDoc(A.collection(A.fdb,'personas'),data);A.toast('Persona guardada','ok')}A.$('#ovPerson').classList.remove('show');editingPersonId=null};

/* Eliminar persona (devuelve stock) */
function deletePerson(id){const p=A.db.personas.find(x=>x.id===id);if(!p)return;const asig=personAssignments(id);
  A.askConfirm('¿Eliminar a «'+p.nombre+'»?'+(asig.length?' Se quitarán '+asig.length+' asignación(es) y el stock volverá al almacén.':''),async()=>{
    for(const m of asig){if(m.artId)A.updateDoc(A.doc(A.fdb,'items',m.artId),{stock:((A.db.items.find(i=>i.id===m.artId)||{}).stock||0)+m.cant});await A.deleteDoc(A.doc(A.fdb,'movimientos',m.id))}
    await A.deleteDoc(A.doc(A.fdb,'personas',id));A.toast('Persona eliminada','warn');
  });
}

/* Detalle + asignaciones */
function openPersonDetail(id){const p=A.db.personas.find(x=>x.id===id);if(!p)return;currentPersonId=id;A.$('#pdTitle').textContent='👤 '+p.nombre;const asig=personAssignments(id);
  A.$('#pdBody').innerHTML=asig.length?asig.map(m=>'<div class="person-row" style="align-items:center"><div><b>'+A.esc(m.art)+'</b><div class="hint">📍 '+A.esc(m.ubic||'—')+' · '+A.fmtFecha(m.fecha)+'</div></div><div style="display:flex;gap:6px;align-items:center"><b>'+m.cant+'</b><button class="icon-btn" data-aedit="'+m.id+'">✏️</button><button class="icon-btn del" data-adel="'+m.id+'">🗑️</button></div></div>').join(''):'<div class="empty"><b>Sin asignaciones</b></div>';
  A.$('#ovPersonDetail').classList.add('show');
}
A.$('#pdBody').addEventListener('click',e=>{const ed=e.target.closest('[data-aedit]');const dl=e.target.closest('[data-adel]');if(ed)openAssignEdit(ed.dataset.aedit);if(dl)deleteAsign(dl.dataset.adel)});
A.$('#pdAssign').onclick=()=>openAssignNew(currentPersonId);

function openAssignNew(pid){editingAsignId=null;A.$('#asPersonId').value=pid;A.$('#asArt').value='';A.$('#asCant').value=1;A.$('#asUbic').value='';A.$('#asNotas').value='';A.$('#asTitle').textContent='Asignar artículo';A.$('#ovAssign').classList.add('show')}
function openAssignEdit(mid){const m=A.db.movimientos.find(x=>x.id===mid);if(!m)return;editingAsignId=mid;A.$('#asPersonId').value=m.personaId;A.$('#asArt').value=m.art;A.$('#asCant').value=m.cant;A.$('#asUbic').value=m.ubic||'';A.$('#asNotas').value=m.notas||'';A.$('#asTitle').textContent='Editar asignación';A.$('#ovAssign').classList.add('show')}
A.$('#btnSaveAssign').onclick=()=>{
  const pid=A.$('#asPersonId').value;const art=A.$('#asArt').value.trim();const cant=parseInt(A.$('#asCant').value,10);
  if(!art||!cant||cant<1)return A.toast('Completa artículo y cantidad','err');
  const it=A.matchItem(art);
  if(editingAsignId){const m=A.db.movimientos.find(x=>x.id===editingAsignId);if(!m)return;const delta=cant-m.cant;
    if(it&&delta>0&&(typeof it.stock!=='number'||delta>it.stock))return A.toast('Stock insuficiente','err');
    if(it)A.updateDoc(A.doc(A.fdb,'items',it.id),{stock:(typeof it.stock==='number'?it.stock:0)-delta});
    A.updateDoc(A.doc(A.fdb,'movimientos',editingAsignId),{art:it?it.desc:art.toUpperCase(),artId:it?it.id:m.artId,cant,ubic:A.$('#asUbic').value.trim(),notas:A.$('#asNotas').value.trim()});
    A.toast('Asignación actualizada','ok');
  }else{
    if(it&&(typeof it.stock!=='number'||cant>it.stock))return A.toast('Stock insuficiente','err');
    if(it)A.updateDoc(A.doc(A.fdb,'items',it.id),{stock:(typeof it.stock==='number'?it.stock:0)-cant});
    A.addDoc(A.collection(A.fdb,'movimientos'),{tipo:'asignacion',personaId:pid,art:it?it.desc:art.toUpperCase(),artId:it?it.id:null,cant,ubic:A.$('#asUbic').value.trim(),notas:A.$('#asNotas').value.trim(),fecha:A.hoyISO()});
    A.toast('Artículo asignado','ok');
  }
  A.$('#ovAssign').classList.remove('show');editingAsignId=null;
  if(currentPersonId)openPersonDetail(currentPersonId);
};
function deleteAsign(mid){const m=A.db.movimientos.find(x=>x.id===mid);if(!m)return;
  A.askConfirm('¿Quitar esta asignación? El stock ('+m.cant+') volverá al almacén.',async()=>{
    if(m.artId)A.updateDoc(A.doc(A.fdb,'items',m.artId),{stock:((A.db.items.find(i=>i.id===m.artId)||{}).stock||0)+m.cant});
    await A.deleteDoc(A.doc(A.fdb,'movimientos',mid));A.toast('Asignación eliminada','warn');
    if(currentPersonId)openPersonDetail(currentPersonId);
  });
}

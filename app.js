/* ════════════════════════════════════════════════════════════
   ALMACÉN PRO CLOUD — app.js (Parte 1: Firebase + Login + Sync)
════════════════════════════════════════════════════════════ */
import {initializeApp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {getAuth,onAuthStateChanged,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {getFirestore,initializeFirestore,persistentLocalCache,persistentMultipleTabManager,collection,onSnapshot,addDoc,updateDoc,deleteDoc,doc,getDoc,getDocs,setDoc,runTransaction,writeBatch} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig={apiKey:"AIzaSyCbwCrH05GRNz1giEISfBzVkfRydm976Oo",authDomain:"l3yvainv.firebaseapp.com",projectId:"l3yvainv",storageBucket:"l3yvainv.firebasestorage.app",messagingSenderId:"974006286377",appId:"1:974006286377:web:e2ea1cbce66781d4d2c438"};
const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
let fdb;try{fdb=initializeFirestore(app,{persistentLocalCache:{tabManager:persistentMultipleTabManager()}})}catch(e){fdb=getFirestore(app)}

const QWEN_KEY='sk-ws-H.DMLDYXH.B7DP.MEQCIEadN2MZxHF09JwM3mQ8E1ucdQaDgJEoOZK2K6LV6kydAiBd_vLuxESH5Uqlo3Sz1auPjz6TvGDv6Dh8EgTYpTxwMg';

/* ── Utilidades ── */
const $=s=>document.querySelector(s);
const $$=s=>document.querySelectorAll(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const hoyISO=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const fmtFecha=iso=>{if(!iso)return'—';const[y,m,d]=iso.split('-');return d+'/'+m+'/'+y};
const mil=n=>String(n).replace(/\B(?=(\d{3})+(?!\d))/g,',');

/* ── Estado global ── */
let db={items:[],movimientos:[],personas:[],users:[]};
let currentUser=null,currentRole='consulta',loginMode='entrar',unsubs=[];
const canEdit=()=>currentRole==='admin'||currentRole==='almacenista';

/* ── Toast ── */
function toast(msg,type='ok'){const t=document.createElement('div');t.className='toast';t.innerHTML='<span>'+esc(msg)+'</span>';$('#toasts').appendChild(t);setTimeout(()=>t.remove(),3400)}

/* ── Confirmación ── */
let confirmCb=null;
function askConfirm(msg,cb){$('#cfMsg').textContent=msg;confirmCb=cb;$('#ovConfirm').classList.add('show')}
$('#btnConfirmYes').onclick=()=>{$('#ovConfirm').classList.remove('show');if(confirmCb)confirmCb();confirmCb=null};
$$('[data-close]').forEach(b=>b.onclick=()=>$('#'+b.dataset.close).classList.remove('show'));
$$('.overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('show')}));

/* ── Navegación ── */
function goView(v){
  $$('.view').forEach(s=>s.classList.remove('active'));
  const el=$('#view-'+v);if(el)el.classList.add('active');
  $$('.nav-btn[data-view],.nav-item[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
  if(v==='dashboard')renderDashboard();
}
$$('.nav-btn[data-view],.nav-item[data-view]').forEach(b=>b.onclick=()=>goView(b.dataset.view));
$$('[data-goto]').forEach(b=>b.onclick=()=>goView(b.dataset.goto));

/* ── Login ─ */
$('#lt-entrar').onclick=()=>{loginMode='entrar';$('#lt-entrar').classList.add('active');$('#lt-registrar').classList.remove('active');$('#ff-nombre').style.display='none';$('#li-btn').textContent='Entrar'};
$('#lt-registrar').onclick=()=>{loginMode='registrar';$('#lt-registrar').classList.add('active');$('#lt-entrar').classList.remove('active');$('#ff-nombre').style.display='block';$('#li-btn').textContent='Crear cuenta'};
$('#li-btn').onclick=async()=>{
  const email=$('#li-email').value.trim(),pass=$('#li-pass').value,nombre=$('#li-nombre').value.trim();
  if(!email||!pass)return toast('Completa correo y contraseña','err');
  if(pass.length<6)return toast('Contraseña mínimo 6 caracteres','err');
  $('#li-btn').disabled=true;$('#li-btn').textContent='Procesando...';
  try{
    if(loginMode==='registrar'){
      const cred=await createUserWithEmailAndPassword(auth,email,pass);
      const ex=await getDocs(collection(fdb,'users'));
      const role=ex.empty?'admin':'pendiente';
      await setDoc(doc(fdb,'users',cred.user.uid),{email,nombre:nombre||email.split('@')[0],role,creado:hoyISO()});
      toast(role==='admin'?'Eres ADMINISTRADOR':'Solicitud enviada, espera aprobación','ok');
    }else await signInWithEmailAndPassword(auth,email,pass);
  }catch(e){toast('Error: '+traducirError(e.code),'err')}
  finally{$('#li-btn').disabled=false;$('#li-btn').textContent=loginMode==='registrar'?'Crear cuenta':'Entrar'}
};
function traducirError(c){const e={'auth/invalid-credential':'Credenciales incorrectas','auth/wrong-password':'Contraseña incorrecta','auth/user-not-found':'Usuario no existe','auth/email-already-in-use':'Correo ya registrado','auth/weak-password':'Contraseña débil','auth/invalid-email':'Correo inválido','auth/operation-not-allowed':'Habilita Email/Password en Firebase','auth/network-request-failed':'Error de red'};return e[c]||c}
$('#btnLogout').onclick=()=>signOut(auth);

onAuthStateChanged(auth,async u=>{
  currentUser=u;
  if(!u){$('#loginScreen').style.display='flex';unsubs.forEach(f=>f());unsubs=[];return}
  const ud=await getDoc(doc(fdb,'users',u.uid));
  currentRole=ud.exists()?(ud.data().role||'consulta'):'pendiente';
  $('#loginScreen').style.display='none';
  if(currentRole==='pendiente'||currentRole==='rechazado'){toast('Acceso pendiente de aprobación','warn')}
  startSync();
});

/* ── Sincronización en tiempo real ── */
function startSync(){
  unsubs.push(onSnapshot(collection(fdb,'items'),s=>{db.items=s.docs.map(d=>({id:d.id,...d.data()}));renderAll()},()=>{}));
  unsubs.push(onSnapshot(collection(fdb,'movimientos'),s=>{db.movimientos=s.docs.map(d=>({id:d.id,...d.data()}));renderAll()}));
  unsubs.push(onSnapshot(collection(fdb,'personas'),s=>{db.personas=s.docs.map(d=>({id:d.id,...d.data()}));renderAll()}));
  unsubs.push(onSnapshot(collection(fdb,'users'),s=>{db.users=s.docs.map(d=>({id:d.id,...d.data()}));watchPending()}));
  seedIfEmpty();
}
let _pendPrev=null;
function watchPending(){
  const pend=db.users.filter(u=>u.role==='pendiente');
  const badge=$('#badgeCompras');
  if(currentRole==='admin'&&_pendPrev!==null&&pend.length>_pendPrev)toast('Nueva solicitud de acceso pendiente','warn');
  _pendPrev=pend.length;
}

/* ── Estado de artículo (OK / PEDIR) ── */
function estadoDe(it){if(it.stock==null)return it.estadoManual||'PEDIR';return it.stock<=it.min?'PEDIR':'OK'}
function sugerencia(it){if(it.stock==null)return it.min;return Math.max(it.min,it.min*2-it.stock)}

/* ════════════════════════════════════════════════════════════
   ALMACÉN PRO CLOUD — app.js (Parte 2: Datos semilla + carga)
════════════════════════════════════════════════════════════ */
const S1='BODEGA #1',S2='BODEGA #2',S3='BODEGA #3';
const R=(cod,desc,cat,und,stock,ubic,notas)=>({cod,desc,cat,und,stock,ubic:ubic||S1,notas:notas||''});
const SEED=[
R('BPU','BOTIQUÍN PRIMEROS AUXILIOS','Seguridad','UNIDADES',10,S1,'4 bodega · 1 patio · 1 Julián'),
R('','KIT ANTI DERRAMES','Seguridad','UNIDADES',10,S1,'1 Julián'),
R('','PALETAS DE SEÑALIZACIÓN','Seguridad','UNIDADES',30),
R('','PUNTOS ECOLÓGICOS','Seguridad','UNIDADES',11,S1,'1 patio · 1 oficina'),
R('','PIMPINAS COMBUSTIBLES BLANCA','Materiales','UNIDADES',3),
R('','ANTISOL (PIMPINAS AMARILLAS)','Materiales','UNIDADES',3),
R('','ARNÉS','Alturas','UNIDADES',20),
R('','ESLINGAS EN Y','Alturas','UNIDADES',20),
R('','ESLINGAS DE POSICIONAMIENTO','Alturas','UNIDADES',20),
R('','TYPE OFF 50','Alturas','UNIDADES',10),
R('','ARRESTADORES DE CAÍDA','Alturas','UNIDADES',10),
R('','MOSQUETONES','Alturas','UNIDADES',40),
R('','LÍNEAS DE VIDA 10 MTS','Alturas','UNIDADES',10),
R('','CANECAS BLANCAS CON TAPA','Materiales','UNIDADES',24),
R('','DISCOS PARA TRONZADORA','Herramientas','CAJAS',19),
R('','LIMA DE 7/8 X 7,32"','Herramientas','CAJAS',4,S1,'Quedan 4 · 2 Julián'),
R('','LIMA DE 7/8 X 5,32"','Herramientas','CAJAS',6,S1,'Quedan 6'),
R('','LIMA DE 7/8 X 3,16"','Herramientas','CAJAS',6,S1,'Quedan 6'),
R('','LIMA TRIANGULAR 6"','Herramientas','UNIDADES',4),
R('','DISCO DE CORTE DE 4 1/2"','Herramientas','UNIDADES',5,S1,'Eran 10'),
R('','DISCO DE PULIR DE 4 1/2"','Herramientas','UNIDADES',9),
R('','EMBUDO PLÁSTICO','Herramientas','UNIDADES',1),
R('','CANASTILLA PLÁSTICA','Herramientas','UNIDADES',1),
R('','CADENA MOTOSIERRA STIHL 3/8"','Materiales','ROLLO',1),
R('','ACEITE LUBRICANTE MOTOSIERRA','Materiales','GALONES',4),
R('','CADENA MOTOSIERRA .325"','Materiales','ROLLO',1),
R('','PICAS – PICOS CON CABO','Herramientas','UNIDADES',6),
R('','PALINES','Herramientas','UNIDADES',3),
R('','PALA REDONDA','Herramientas','UNIDADES',2),
R('','PALA DRAGA (OLLADORA)','Herramientas','UNIDADES',7),
R('','PALÍN PALA CUADRADA','Herramientas','UNIDADES',2),
R('','BARRA PUNTA Y PALA 18"','Herramientas','UNIDADES',3),
R('','BARRA PUNTA Y PALA 12"','Herramientas','UNIDADES',3),
R('','MARTILLO DE UÑA','Herramientas','UNIDADES',9),
R('','ALMADANA (PORRA) 2 LBS','Herramientas','UNIDADES',5),
R('','PALUSTRE','Herramientas','UNIDADES',4,S1,'1 patio'),
R('','ESPÁTULA METÁLICA','Herramientas','UNIDADES',6),
R('','ALICATE AISLADO','Herramientas','UNIDADES',5),
R('','DESTORNILLADOR PALA 1/4 X 6"','Herramientas','UNIDADES',3),
R('','DESTORNILLADOR ESTRELLA 1/4 X 6"','Herramientas','UNIDADES',3),
R('','CANDADO ANTICIZALLA','Seguridad','UNIDADES',4),
R('','NEVERAS / CAVAS','Varios','UNIDADES',7,S1,'1 patio · 1 Juan Pablo'),
R('','ALAMBRE DE PÚAS','Materiales','ROLLO',30),
R('','CHIPA ALAMBRE DULCE','Materiales','ROLLO',38),
R('','ALAMBRE GALVANIZADO','Materiales','ROLLO',6),
R('','TENSOORES','Materiales','UNIDADES',20),
R('','ALMADANA (PORRA) 18 LBS','Herramientas','UNIDADES',2),
R('','PALA ANTICHISPAS','Herramientas','UNIDADES',10),
R('','PROTECTOR AUDITIVO TIPO COPA','EPP','UNIDADES',20,S1,'4 patio'),
R('','TAPABOCAS','EPP','UNIDADES',30),
R('','GUANTES DE PRECISIÓN','EPP','UNIDADES',40),
R('','CARGADOR PARA BATERÍA','Eléctrico','UNIDADES',1),
R('','COSTALES','Materiales','UNIDADES',50,S1,'Esperando 1000'),
R('','CONOS DE SEÑALIZACIÓN','Seguridad','UNIDADES',30),
R('','MANGUERA MOTOBOMBA','Maquinaria','UNIDADES',3),
R('','ACOPLES MOTOBOMBA','Maquinaria','UNIDADES',3),
R('','CINTA DE PELIGRO','Seguridad','UNIDADES',19),
R('','EXTINTORES 20 LBS','Seguridad','UNIDADES',13,S1,'Patio 1 · Oficina 3'),
R('','MANILA 1/2" X 200 M','Materiales','ROLLO',1),
R('','MANILA 5/8" X 250 M','Materiales','ROLLO',2),
R('','MALETAS','Varios','UNIDADES',6),
R('','PALETA PARE Y SIGA','Seguridad','UNIDADES',20),
R('','CHALECOS REFLECTIVOS','EPP','UNIDADES',20),
R('','MANGUERA CAMPESINA','Materiales','ROLLO',1),
R('','EXTENSIÓN ELÉCTRICA','Eléctrico','METROS',30),
R('','PUNTILLA ACERADA 3"','Materiales','LIBRAS',2),
R('','PUNTILLA CON CABEZA 3"','Materiales','LIBRAS',2),
R('','JUEGO DE LLAVES MIXTAS STANLEY','Herramientas','UNIDADES',2),
R('','MACHETE CON FUNDA','Herramientas','UNIDADES',1),
R('','RODILLO 9"','Herramientas','UNIDADES',2),
R('','FLEXÓMETRO 8 METROS','Herramientas','CAJAS',2),
R('','GRAPAS','Materiales','CAJAS',1),
R('','SOLDADURA 6010','Materiales','CAJAS',1),
R('','LIJA 150','Materiales','UNIDADES',14),
R('','SOLDADURA 6011','Materiales','CAJAS',1),
R('','PLÁSTICO','Materiales','ROLLO',1),
R('','CARRETILLA','Herramientas','UNIDADES',10),
R('','CADENA ESLABONADA PLÁSTICA','Materiales','PAQUETES',5),
R('','VIBRADOR DE CONCRETO','Maquinaria','UNIDADES',2,S2),
R('','BOMBAS SUMERGIBLES','Maquinaria','UNIDADES',3,S2),
R('','GUADAÑA','Maquinaria','UNIDADES',1,S2),
R('','CARRETE NYLON GUADAÑA','Maquinaria','UNIDADES',1,S2),
R('','BASES PARA EXTINTORES','Seguridad','UNIDADES',3,S2),
R('','MOTOSIERRA DE BRAZO','Maquinaria','UNIDADES',1,S2),
R('','GANCHO HERPETOLÓGICO','Alturas','UNIDADES',1,S2),
R('','CARPA','Varios','UNIDADES',3,S2),
R('','ESTRUCTURA DE CARPAS','Varios','UNIDADES',3,S2),
R('','MOTOSIERRA COMPLETA','Maquinaria','UNIDADES',1,S2),
R('','TAPABOCAS N95','EPP','UNIDADES',100,S2),
R('','VASCUA PINZUAR','Herramientas','UNIDADES',1,S2),
R('','PINCELES','Herramientas','UNIDADES',1,S2),
R('','HOMBRERAS','EPP','UNIDADES',30,S2),
R('','ESCALERAS','Herramientas','UNIDADES',4,S2),
R('','POLAINAS ESPECIALES','EPP','UNIDADES',1,S2),
R('','MASCARILLA MEDIA CARA','EPP','UNIDADES',4,S2),
R('','FILTROS MASCARILLA MEDIA CARA','EPP','UNIDADES',9,S2),
R('','CARETA TRANSPARENTE','EPP','UNIDADES',1,S2),
R('','VARILLA PUESTA A TIERRA','Eléctrico','UNIDADES',4,S2),
R('','CABLE','Eléctrico','METROS',60,S2),
R('','CONECTORES POLO A TIERRA','Eléctrico','UNIDADES',20,S2),
R('','TERMINALES DE OJO','Eléctrico','UNIDADES',20,S2),
R('','ROLLO WILFER','Eléctrico','ROLLO',1,S2),
R('','TRAMPAS','Seguridad','UNIDADES',2,S2),
R('','BOLSAS CULEBRAS','Seguridad','UNIDADES',1,S2),
R('','SILUETA','Materiales','ROLLO',5,S2),
R('','GUACAL PEQUEÑO','Varios','UNIDADES',2,S2),
R('','GUACAL GRANDE','Varios','UNIDADES',1,S2),
R('','KIT DE RESCATE PEQUEÑO','Alturas','UNIDADES',1,S2),
R('','KIT DE RESCATE GRANDE','Alturas','UNIDADES',1,S2),
R('','PLANTA ELÉCTRICA','Maquinaria','UNIDADES',6,S2,'2 oficina'),
R('','TALADRO','Maquinaria','UNIDADES',5,S2),
R('','CABLE COOPER','Eléctrico','ROLLO',1,S2),
R('','TRAJES TYVEK','EPP','UNIDADES',4,S2),
R('','PRENZA','Herramientas','UNIDADES',1,S3),
R('','EQUIPO PINZUAR','Herramientas','UNIDADES',1,S3),
R('','RASTRILLO','Herramientas','UNIDADES',1,S3),
R('','PISÓN','Herramientas','UNIDADES',1,S3,'8 en bodega 1'),
R('','BARRAS','Herramientas','UNIDADES',2,S3),
R('','PALA','Herramientas','UNIDADES',1,S3),
R('','CAMISAS HOMBRE T-S','Dotación','UNIDADES',0),
R('','CAMISAS HOMBRE T-M','Dotación','UNIDADES',53),
R('','CAMISAS HOMBRE T-L','Dotación','UNIDADES',53),
R('','CAMISAS HOMBRE T-XL','Dotación','UNIDADES',80),
R('','CAMISAS HOMBRE T-XXL','Dotación','UNIDADES',17),
R('','PANTALÓN HOMBRE 28','Dotación','UNIDADES',1),
R('','PANTALÓN HOMBRE 30','Dotación','UNIDADES',35),
R('','PANTALÓN HOMBRE 32','Dotación','UNIDADES',29),
R('','PANTALÓN HOMBRE 34','Dotación','UNIDADES',44),
R('','PANTALÓN HOMBRE 36','Dotación','UNIDADES',46),
R('','PANTALÓN HOMBRE 38','Dotación','UNIDADES',68),
R('','PANTALÓN HOMBRE 40','Dotación','UNIDADES',64),
R('','PANTALÓN HOMBRE 42','Dotación','UNIDADES',35),
R('','PANTALÓN DAMA 6','Dotación','UNIDADES',4),
R('','PANTALÓN DAMA 8','Dotación','UNIDADES',1),
R('','PANTALÓN DAMA 10','Dotación','UNIDADES',10),
R('','PANTALÓN DAMA 14','Dotación','UNIDADES',4),
R('','PANTALÓN DAMA 16','Dotación','UNIDADES',1),
R('','PANTALÓN DAMA 18','Dotación','UNIDADES',4),
R('','BOTAS 35','Dotación','PAR',4),
R('','BOTAS 36','Dotación','PAR',8),
R('','BOTAS 37','Dotación','PAR',7),
R('','BOTAS 38','Dotación','PAR',10),
R('','BOTAS 39','Dotación','PAR',12),
R('','BOTAS 40','Dotación','PAR',31),
R('','BOTAS 41','Dotación','PAR',42),
R('','BOTAS 42','Dotación','PAR',38),
R('','BOTAS 43','Dotación','PAR',17),
R('','BOTAS 44','Dotación','PAR',1),
R('','BOTAS 45','Dotación','PAR',3),
R('','CASCOS','EPP','UNIDADES',198),
R('','GUANTES DE PRECISIÓN PAR','EPP','PAR',60),
R('','GAFAS OSCURAS','EPP','UNIDADES',242),
R('','GAFAS DE SEGURIDAD','EPP','UNIDADES',42)
];

/* ── Carga inicial a la nube (solo primera vez) ── */
let seedDone=false;
async function seedIfEmpty(){
  if(seedDone)return;seedDone=true;
  // Espera un instante a que llegue el primer snapshot
  setTimeout(async()=>{
    if(db.items.length>0)return;
    try{
      const batch=writeBatch(fdb);
      SEED.forEach(r=>{batch.set(doc(collection(fdb,'items')),{codigo:r.cod||'',desc:r.desc,cat:r.cat,unidad:r.und,stock:r.stock,min:20,ubic:r.ubic,notas:r.notas})});
      await batch.commit();
      toast('Inventario inicial cargado ('+SEED.length+' artículos)','ok');
    }catch(e){toast('No se pudo cargar semilla: '+e.message,'err')}
  },1200);
}

/* ════════════════════════════════════════════════════════════
   ALMACÉN PRO CLOUD — app.js (Parte 3: Dashboard + Inventario)
════════════════════════════════════════════════════════════ */

/* ── Dashboard ── */
let chA=null,chB=null;
function renderDashboard(){
  const items=db.items;
  const ok=items.filter(i=>estadoDe(i)==='OK').length;
  const pedir=items.length-ok;
  const units=items.reduce((s,i)=>s+(typeof i.stock==='number'?i.stock:0),0);
  $('#stTotal').textContent=mil(items.length);
  $('#stOk').textContent=mil(ok);
  $('#stPedir').textContent=mil(pedir);
  $('#stUnits').textContent=mil(units);
  $('#badgeCompras').textContent=pedir;
  // Urgentes
  const urg=items.filter(i=>estadoDe(i)==='PEDIR').sort((a,b)=>(a.stock==null?9999:a.stock)-(b.stock==null?9999:b.stock)).slice(0,8);
  $('#urgentList').innerHTML=urg.length?urg.map(it=>{
    const pct=it.stock==null?4:Math.max(4,Math.min(100,it.stock/it.min*100));
    const st=it.stock==null?'S/D':it.stock;
    return '<div class="urg-row"><div class="urg-info"><div class="urg-name">'+esc(it.desc)+'</div><div class="urg-loc">'+esc(it.ubic)+'</div><div class="urg-bar"><i style="width:'+pct+'%"></i></div></div><div class="urg-num">'+esc(st)+' / '+it.min+'</div></div>';
  }).join(''):'<div class="empty"><b>¡Todo al día! 🎉</b></div>';
  // Movimientos recientes
  const movs=[...db.movimientos].sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha))).slice(0,6);
  $('#movList').innerHTML=movs.length?movs.map(m=>{
    const isIn=(m.tipo==='entrada'||m.tipo==='devolucion');
    return '<div class="mov-row"><div class="mov-ico" style="background:'+(isIn?'var(--em-bg)':'#ffe4e6')+';color:'+(isIn?'var(--em)':'var(--rose)')+'">'+(isIn?'↓':'↑')+'</div><div><div class="mov-t">'+esc(m.art||'')+'</div><div class="mov-s">'+esc(m.tipo)+' · '+m.cant+' · '+esc(m.quien||m.user||'—')+'</div></div><div class="mov-d">'+fmtFecha(m.fecha)+'</div></div>';
  }).join(''):'<div class="empty"><b>Sin movimientos</b>Registra entradas o salidas.</div>';
  drawCharts(ok,pedir);
}
function drawCharts(ok,pedir){
  if(!window.Chart)return;
  const cats={};db.items.forEach(i=>cats[i.cat]=(cats[i.cat]||0)+1);
  const catNames=Object.keys(cats).sort((a,b)=>cats[b]-cats[a]);
  const palette=['#0d9488','#f59e0b','#6366f1','#10b981','#f43f5e','#0ea5e9','#a855f7','#84cc16','#f97316','#64748b'];
  if(chA)chA.destroy();if(chB)chB.destroy();
  chA=new Chart($('#chEstados'),{type:'doughnut',data:{labels:['Stock OK','Pendientes (PEDIR)'],datasets:[{data:[ok,pedir],backgroundColor:['#10b981','#f59e0b'],borderWidth:4,borderColor:'#fff',hoverOffset:8}]},options:{maintainAspectRatio:false,cutout:'68%',plugins:{legend:{position:'bottom',labels:{usePointStyle:true,padding:18,font:{family:'Inter',size:12,weight:'600'}}}}}});
  chB=new Chart($('#chCategorias'),{type:'bar',data:{labels:catNames,datasets:[{data:catNames.map(c=>cats[c]),backgroundColor:catNames.map((_,i)=>palette[i%palette.length]),borderRadius:8,barThickness:16}]},options:{indexAxis:'y',maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{color:'#f1f5f9'}},y:{grid:{display:false}}}}});
}

/* ── Inventario ── */
let sortKey='desc',sortDir=1,editingId=null;
function buildFilterOptions(){
  const cats=[...new Set(db.items.map(i=>i.cat).filter(Boolean))].sort();
  const ubis=[...new Set(db.items.map(i=>i.ubic).filter(Boolean))].sort();
  $('#fCat').innerHTML='<option value="">Categoría: todas</option>'+cats.map(c=>'<option>'+esc(c)+'</option>').join('');
  $('#fUbic').innerHTML='<option value="">Ubicación: todas</option>'+ubis.map(u=>'<option>'+esc(u)+'</option>').join('');
}
function renderInventario(){
  const q=$('#invSearch').value.trim().toLowerCase();
  const fe=$('#fEstado').value,fu=$('#fUbic').value,fc=$('#fCat').value;
  let list=db.items.filter(it=>{
    if(fe&&estadoDe(it)!==fe)return false;
    if(fu&&it.ubic!==fu)return false;
    if(fc&&it.cat!==fc)return false;
    if(q&&!(it.desc.toLowerCase().includes(q)||(it.codigo||'').toLowerCase().includes(q)||(it.notas||'').toLowerCase().includes(q)))return false;
    return true;
  });
  list.sort((a,b)=>{let va,vb;
    if(sortKey==='stock'){va=a.stock==null?-1:a.stock;vb=b.stock==null?-1:b.stock}
    else if(sortKey==='min'){va=a.min;vb=b.min}
    else if(sortKey==='estado'){va=estadoDe(a);vb=estadoDe(b)}
    else{va=(a[sortKey]||'').toString().toLowerCase();vb=(b[sortKey]||'').toString().toLowerCase()}
    return va<vb?-sortDir:va>vb?sortDir:0;
  });
  $('#invBody').innerHTML=list.length?list.map(it=>{
    const est=estadoDe(it);const isNum=typeof it.stock==='number';const stDisp=isNum?mil(it.stock):(it.stockText||'—');
    const steps=isNum?'<button class="step-btn" data-act="menos" data-id="'+it.id+'">−</button><button class="step-btn" data-act="mas" data-id="'+it.id+'">+</button>':'';
    return '<tr><td>'+(it.codigo?'<span class="td-code">'+esc(it.codigo)+'</span>':'—')+'</td>'+
    '<td><div class="td-desc">'+esc(it.desc)+'</div>'+(it.notas?'<div class="td-note">📝 '+esc(it.notas)+'</div>':'')+'</td>'+
    '<td>'+esc(it.cat)+'</td><td style="color:var(--mut)">'+esc(it.unidad)+'</td>'+
    '<td><div class="stock-cell">'+steps+'<span class="stock-val '+(est==='PEDIR'?'low':'')+'">'+esc(stDisp)+'</span></div></td>'+
    '<td style="color:var(--mut)">'+it.min+'</td>'+
    '<td><span class="bdg '+(est==='OK'?'ok':'pedir')+'">'+est+'</span></td>'+
    '<td><span class="pill-loc">'+esc(it.ubic)+'</span></td>'+
    '<td style="text-align:right;white-space:nowrap"><button class="icon-btn" data-act="edit" data-id="'+it.id+'" title="Editar">✏️</button><button class="icon-btn del" data-act="del" data-id="'+it.id+'" title="Eliminar">🗑️</button></td></tr>';
  }).join(''):'<tr><td colspan="9"><div class="empty"><b>Sin resultados</b>Ajusta la búsqueda o filtros.</div></td></tr>';
}
$('#invSearch').oninput=renderInventario;
['fEstado','fUbic','fCat'].forEach(id=>$('#'+id).onchange=renderInventario);
$$('#view-inventario th[data-sort]').forEach(th=>th.onclick=()=>{const k=th.dataset.sort;if(sortKey===k)sortDir*=-1;else{sortKey=k;sortDir=1}renderInventario()});
$('#invBody').addEventListener('click',e=>{
  const b=e.target.closest('[data-act]');if(!b)return;
  const id=b.dataset.id,act=b.dataset.act;
  const it=db.items.find(x=>x.id===id);if(!it)return;
  if(act==='edit')openItemModal(id);
  if(act==='del')askConfirm('¿Eliminar «'+it.desc+'» del inventario?',()=>{deleteDoc(doc(fdb,'items',id));toast('Artículo eliminado','warn')});
  if(act==='mas'||act==='menos'){
    const delta=(act==='mas'?1:-1);
    const ns=Math.max(0,(typeof it.stock==='number'?it.stock:0)+delta);
    updateDoc(doc(fdb,'items',id),{stock:ns});
  }
});

/* ── Modal artículo ── */
function openItemModal(id){
  editingId=id;
  const it=id?db.items.find(x=>x.id===id):null;
  $('#itemModalTitle').textContent=it?'Editar artículo':'Nuevo artículo';
  $('#itCodigo').value=it?it.codigo:'';
  $('#itDesc').value=it?it.desc:'';
  $('#itCat').value=it?it.cat:'';
  $('#itUnd').value=it?it.unidad:'UNIDADES';
  $('#itStock').value=it&&typeof it.stock==='number'?it.stock:0;
  $('#itMin').value=it?it.min:20;
  $('#itUbic').value=it?it.ubic:S1;
  $('#itNotas').value=it?it.notas:'';
  $('#ovItem').classList.add('show');
}
$('#btnNew').onclick=()=>openItemModal(null);
$('#btnSaveItem').onclick=()=>{
  const desc=$('#itDesc').value.trim();
  if(!desc){toast('La descripción es obligatoria','err');return}
  const data={codigo:$('#itCodigo').value.trim(),desc,cat:$('#itCat').value.trim()||'Varios',unidad:$('#itUnd').value,stock:Math.max(0,parseInt($('#itStock').value,10)||0),min:Math.max(0,parseInt($('#itMin').value,10)||0),ubic:$('#itUbic').value,notas:$('#itNotas').value.trim()};
  if(editingId){updateDoc(doc(fdb,'items',editingId),data);toast('Artículo actualizado','ok')}
  else{addDoc(collection(fdb,'items'),data);toast('Artículo agregado','ok')}
  $('#ovItem').classList.remove('show');editingId=null;
};

/* ── Exportar CSV ── */
$('#btnCSV').onclick=()=>{
  const rows=[['Código','Descripción','Categoría','Unidad','Stock','Mínimo','Estado','Ubicación','Notas']];
  db.items.forEach(it=>rows.push([it.codigo,it.desc,it.cat,it.unidad,it.stock==null?'':it.stock,it.min,estadoDe(it),it.ubic,it.notas]));
  const csv=rows.map(r=>r.map(c=>'"'+String(c??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='inventario.csv';a.click();
  URL.revokeObjectURL(a.href);toast('CSV exportado','info');
};

/* ── Render general ── */
function renderAll(){
  buildFilterOptions();
  refreshDataList();
  renderDashboard();renderInventario();renderMovs();renderCompras();renderPersonas();
}
(function init(){
  const f=new Date();
  $('#todayTxt').innerHTML='📅 <b>'+f.toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long',year:'numeric'})+'</b>';
  $('#entFecha').value=hoyISO();$('#salFecha').value=hoyISO();
  buildFilterOptions();
})();

/* ════════════════════════════════════════════════════════════
   ALMACÉN PRO CLOUD — app.js (Parte 4: Movimientos+Compras+IA)
════════════════════════════════════════════════════════════ */

/* ── DataList de artículos ── */
function refreshDataList(){$('#dlItems').innerHTML=db.items.map(i=>'<option value="'+esc(i.desc)+'">').join('')}
function matchItem(v){if(!v)return null;const t=v.trim().toLowerCase();if(!t)return null;
  return db.items.find(i=>i.desc.toLowerCase()===t||(i.codigo&&i.codigo.toLowerCase()===t))||db.items.find(i=>i.desc.toLowerCase().startsWith(t)&&t.length>=3)||null}

/* ── Entradas / Salidas (bitácora) ── */
function renderMovs(){
  const ent=[...db.movimientos].filter(m=>m.tipo==='entrada').sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)));
  const sal=[...db.movimientos].filter(m=>m.tipo==='salida').sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)));
  $('#entBody').innerHTML=ent.length?ent.map(m=>'<tr><td>'+fmtFecha(m.fecha)+'</td><td class="td-desc">'+esc(m.art)+'</td><td><b>'+m.cant+'</b> '+esc(m.und||'')+'</td><td>'+esc(m.quien||'—')+'</td><td style="text-align:right"><button class="icon-btn del" data-mov="'+m.id+'">🗑️</button></td></tr>').join(''):'<tr><td colspan="5"><div class="empty"><b>Sin entradas</b></div></td></tr>';
  $('#salBody').innerHTML=sal.length?sal.map(m=>'<tr><td>'+fmtFecha(m.fecha)+'</td><td class="td-desc">'+esc(m.art)+'</td><td><b>'+m.cant+'</b> '+esc(m.und||'')+'</td><td>'+esc(m.quien||'—')+'</td><td style="text-align:right"><button class="icon-btn del" data-mov="'+m.id+'">🗑️</button></td></tr>').join(''):'<tr><td colspan="5"><div class="empty"><b>Sin salidas</b></div></td></tr>';
}
$('#entBody').addEventListener('click',e=>{const b=e.target.closest('[data-mov]');if(b)askConfirm('¿Eliminar este registro?',()=>deleteDoc(doc(fdb,'movimientos',b.dataset.mov)))});
$('#salBody').addEventListener('click',e=>{const b=e.target.closest('[data-mov]');if(b)askConfirm('¿Eliminar este registro?',()=>deleteDoc(doc(fdb,'movimientos',b.dataset.mov)))});
$('#formEntrada').onsubmit=e=>{
  e.preventDefault();
  const art=$('#entArt').value.trim(),cant=parseInt($('#entCant').value,10);
  if(!art||!cant||cant<1)return toast('Completa artículo y cantidad','err');
  const it=matchItem(art);
  if(it)updateDoc(doc(fdb,'items',it.id),{stock:(typeof it.stock==='number'?it.stock:0)+cant});
  addDoc(collection(fdb,'movimientos'),{tipo:'entrada',fecha:$('#entFecha').value||hoyISO(),art:it?it.desc:art.toUpperCase(),cant,und:$('#entUnd')?$('#entUnd').value:'',quien:$('#entProv').value.trim(),itemId:it?it.id:null,user:currentUser?currentUser.email:''});
  e.target.reset();$('#entFecha').value=hoyISO();
  toast(it?'Entrada registrada · stock +'+cant:'Entrada registrada','ok');
};
$('#formSalida').onsubmit=e=>{
  e.preventDefault();
  const art=$('#salArt').value.trim(),cant=parseInt($('#salCant').value,10),resp=$('#salResp').value.trim();
  if(!art||!cant||cant<1)return toast('Completa artículo y cantidad','err');
  if(!resp)return toast('Indica el responsable','err');
  const it=matchItem(art);
  if(it&&typeof it.stock==='number'&&cant>it.stock)return toast('Stock insuficiente: solo hay '+it.stock,'err');
  if(it&&typeof it.stock==='number')updateDoc(doc(fdb,'items',it.id),{stock:it.stock-cant});
  addDoc(collection(fdb,'movimientos'),{tipo:'salida',fecha:$('#salFecha').value||hoyISO(),art:it?it.desc:art.toUpperCase(),cant,und:'',quien:resp,itemId:it?it.id:null,user:currentUser?currentUser.email:''});
  e.target.reset();$('#salFecha').value=hoyISO();
  toast(it?'Salida registrada · stock −'+cant:'Salida registrada','ok');
};

/* ── Compras ── */
function renderCompras(){
  const list=db.items.filter(i=>estadoDe(i)==='PEDIR').sort((a,b)=>(a.stock==null?9999:a.stock)-(b.stock==null?9999:b.stock));
  $('#cmpBody').innerHTML=list.length?list.map(it=>{
    const st=it.stock==null?'—':it.stock;
    return '<tr><td>'+(it.codigo?'<span class="td-code">'+esc(it.codigo)+'</span>':'—')+'</td><td class="td-desc">'+esc(it.desc)+'</td><td><span class="stock-val low">'+esc(st)+'</span></td><td>'+it.min+'</td><td><span class="bdg pedir">'+sugerencia(it)+' '+esc(it.unidad)+'</span></td><td><span class="pill-loc">'+esc(it.ubic)+'</span></td><td style="text-align:right"><button class="btn btn-ghost btn-sm" data-comprar="'+it.id+'">Registrar entrada</button></td></tr>';
  }).join(''):'<tr><td colspan="7"><div class="empty"><b>No hay pendientes 🎉</b></div></td></tr>';
}
$('#cmpBody').addEventListener('click',e=>{
  const b=e.target.closest('[data-comprar]');if(!b)return;
  const it=db.items.find(x=>x.id===b.dataset.comprar);if(!it)return;
  goView('entradas');$('#entArt').value=it.desc;$('#entCant').value=sugerencia(it);
});

/* ── Personas ── */
function renderPersonas(){
  $('#personasList').innerHTML=db.personas.length?db.personas.map(p=>{
    const asig=db.movimientos.filter(m=>m.personaId===p.id&&m.tipo==='asignacion');
    return '<div class="person-card"><div class="person-head"><div class="person-avatar">'+esc((p.nombre||'?').charAt(0))+'</div><div><div class="person-name">'+esc(p.nombre)+'</div><div class="person-role">'+esc(p.cargo||'Sin cargo')+'</div></div></div><div class="person-row"><span>Asignaciones</span><b>'+asig.length+'</b></div></div>';
  }).join(''):'<div class="empty"><b>Sin personas</b>Crea la primera con el botón superior.</div>';
}
$('#btnNewPerson').onclick=()=>{$('#perNombre').value='';$('#perCargo').value='';$('#ovPerson').classList.add('show')};
$('#btnSavePerson').onclick=()=>{
  const n=$('#perNombre').value.trim();if(!n)return toast('Nombre obligatorio','err');
  addDoc(collection(fdb,'personas'),{nombre:n,cargo:$('#perCargo').value.trim()});
  $('#ovPerson').classList.remove('show');toast('Persona guardada','ok');
};

/* ── Asistente IA ── */
$('#btnAI').onclick=()=>{$('#ovAI').classList.add('show')};
async function llamarQwen(prompt){
  const int=[{t:'o',u:'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',m:'qwen-plus'},{t:'o',u:'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',m:'qwen-turbo'}];
  for(const it of int){try{
    const r=await fetch(it.u,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+QWEN_KEY},body:JSON.stringify({model:it.m,messages:[{role:'user',content:prompt}],temperature:0.2})});
    if(r.ok){const d=await r.json();if(d.choices&&d.choices[0])return{ok:true,text:d.choices[0].message.content}}
  }catch(e){}}
  return{ok:false,error:'Sin conexión con la IA'};
}
function estadoResumen(){return{articulos:db.items.slice(0,60).map(a=>({desc:a.desc,stock:a.stock,min:a.min,estado:estadoDe(a)}))}}
$('#aiSend').onclick=async()=>{
  const msg=$('#aiInput').value.trim();if(!msg)return;
  const chat=$('#aiChat');chat.innerHTML+='<div class="ai-msg user">'+esc(msg)+'</div>';$('#aiInput').value='';
  const res=await llamarQwen('Eres asistente de inventario. ESTADO: '+JSON.stringify(estadoResumen())+'. Responde breve en español. Pregunta: '+msg);
  chat.innerHTML+='<div class="ai-msg assistant">'+esc(res.ok?res.text:('⚠️ '+res.error))+'</div>';
  chat.scrollTop=chat.scrollHeight;
};

/* ── Ayuda ── */
$('#btnHelp').onclick=()=>$('#ovHelp').classList.add('show');

/* ══════════ FIN DE app.js ══════════ */

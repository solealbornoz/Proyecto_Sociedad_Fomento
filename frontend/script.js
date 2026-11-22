async function api(url, options = {}) {
    if (location.protocol === 'file:') throw new Error('Iniciá la aplicación con npm start y abrí http://localhost:3000.');
    let response;
    try { response = await fetch(url, {...options, headers:{'Content-Type':'application/json'}, body:options.body ? JSON.stringify(options.body) : undefined}); }
    catch { throw new Error('No se pudo conectar con el servidor. Iniciá la aplicación con npm start.'); }
    let data;
    try { data = await response.json(); } catch { throw new Error('El servidor no respondió correctamente.'); }
    if (!response.ok) throw new Error(data.error || 'Ocurrió un error.');
    return data;
}
const precio = n => Number(n).toLocaleString('es-AR', {style:'currency', currency:'ARS', maximumFractionDigits:0});
const fechaMostrar = fecha => fecha.split('-').reverse().join('/');
function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}
async function cargarInicio() {
    const container = document.getElementById('actividades-lista'); if (!container) return;
    try {
        const {actividades} = await api('/api/actividades'); container.replaceChildren();
        actividades.forEach((actividad, index) => {
            const card = el('article','activity-card');
            const top = el('div','card-top'); top.append(el('span','card-icon',actividad.icono), el('span','card-number',`ACTIVIDAD ${String(index+1).padStart(2,'0')}`));
            const body = el('div','card-body'); body.append(el('h3','',actividad.nombre), el('p','',actividad.descripcion));
            const list = el('ul','schedule-list');
            actividad.categorias.forEach(c => list.append(el('li','',`${c.categoria} · ${c.diaNombre} ${c.horario} hs`)));
            const value = el('p','',`${precio(actividad.precio)} · valor de ejemplo`);
            const link = el('a','card-link','Ver categorías e inscribirme ↗'); link.href = `dashboard.html?actividad=${encodeURIComponent(actividad.id)}`;
            body.append(list,value,link); card.append(top,body); container.append(card);
        });
    } catch (error) { container.textContent = error.message; }
}
cargarInicio();
const login = document.getElementById('login-form');
if (login) {
    const remembered = localStorage.getItem('usuario_recordado');
    if (remembered) { document.getElementById('email').value = remembered; document.getElementById('recordar').checked = true; }
    async function ingresar(endpoint) {
        if (!login.reportValidity()) return;
        const email = document.getElementById('email').value.trim(); const recordar = document.getElementById('recordar').checked;
        try {
            await api(endpoint,{method:'POST',body:{email,password:document.getElementById('password').value,recordar}});
            if (recordar) localStorage.setItem('usuario_recordado',email); else localStorage.removeItem('usuario_recordado');
            const actividad = sessionStorage.getItem('actividad_pendiente'); sessionStorage.removeItem('actividad_pendiente');
            location.href = actividad ? `dashboard.html?actividad=${encodeURIComponent(actividad)}` : 'dashboard.html';
        } catch (error) { document.getElementById('login-error').textContent = error.message; }
    }
    login.addEventListener('submit', e => { e.preventDefault(); ingresar('/api/login'); });
    document.getElementById('registrar').addEventListener('click', () => ingresar('/api/register'));
}
if (document.getElementById('select-actividad')) {
    const select = document.getElementById('select-actividad');
    const pago = document.getElementById('pago');
    let actividades = [], hoy = '', turnos = [], carrito = {items:[],total:0};
    const actividadElegida = new URLSearchParams(location.search).get('actividad');
    function proximaFecha(dia) {
        const fecha = new Date(hoy + 'T12:00:00Z');
        fecha.setUTCDate(fecha.getUTCDate() + (dia - fecha.getUTCDay() + 7) % 7);
        return fecha.toISOString().slice(0,10);
    }
    function detalle(item) { return `${item.categoria || ''} · ${fechaMostrar(item.fecha)} · ${item.horario} hs`; }
    function renderOpciones() {
        const box = document.getElementById('opciones-actividad'); box.replaceChildren();
        const actividad = actividades.find(a => a.id === select.value);
        if (!actividad) { box.append(el('p','', 'Seleccioná una actividad para ver sus categorías.')); return; }
        actividad.categorias.forEach(c => {
            const fecha = proximaFecha(c.dia);
            const pendiente = carrito.items.some(i => i.taller === c.id && i.fecha === fecha && i.horario === c.horario);
            const asignado = turnos.some(i => i.taller === c.id && i.fecha === fecha && i.horario === c.horario);
            const row = el('div','activity-option'); const info = el('div');
            info.append(el('strong','',c.categoria),el('small','',`${c.diaNombre} ${fechaMostrar(fecha)} · ${c.horario} hs · ${precio(actividad.precio)}`));
            const button = el('button','option-button', asignado ? 'Inscripto' : pendiente ? 'En carrito' : 'Agregar al carrito');
            button.type = 'button'; button.disabled = pendiente || asignado;
            button.addEventListener('click', async () => {
                button.disabled = true;
                try {
                    await api('/api/cart',{method:'POST',body:{taller:c.id,fecha,horario:c.horario}});
                    await actualizar(); document.getElementById('actividad-mensaje').textContent = `${actividad.nombre} se agregó al carrito.`;
                } catch (error) { button.disabled = false; document.getElementById('actividad-mensaje').textContent = error.message; }
            });
            row.append(info,button);box.append(row);
        });
    }
    function renderCarrito() {
        const box = document.getElementById('carrito-items'); box.replaceChildren();
        document.getElementById('carrito-cantidad').textContent = carrito.items.length;
        document.getElementById('cantidad-resumen').textContent = `(${carrito.items.length})`;
        document.getElementById('carrito-total').textContent = precio(carrito.total);
        document.getElementById('ir-pagar').disabled = !carrito.items.length;
        if (!carrito.items.length) box.append(el('p','small','Todavía no agregaste actividades.'));
        carrito.items.forEach(item => {
            const row = el('div','item-row'); const info = el('div','item-info');
            info.append(el('strong','',item.nombre),el('small','',`${detalle(item)} · ${precio(item.precio)}`));
            const quitar = el('button','text-button','Quitar'); quitar.type='button'; quitar.setAttribute('aria-label',`Quitar ${item.nombre} ${item.categoria}`);
            quitar.addEventListener('click',async () => { quitar.disabled=true; try { await api(`/api/cart/${item.id}`,{method:'DELETE'}); await actualizar(); document.getElementById('carrito-mensaje').textContent='Actividad quitada del carrito.'; } catch(error) { quitar.disabled=false; document.getElementById('carrito-mensaje').textContent=error.message; } });
            row.append(info,quitar);box.append(row);
        });
        if (!pago.hidden) renderPago();
    }
    function renderPago() {
        const box = document.getElementById('pago-items');box.replaceChildren();
        carrito.items.forEach(item => box.append(el('p','',`${item.nombre} · ${detalle(item)} · ${precio(item.precio)}`)));
        document.getElementById('pago-total').textContent = precio(carrito.total);
        if (!carrito.items.length) pago.hidden=true;
    }
    function renderTurnos() {
        const box = document.getElementById('mis-actividades-lista'); box.replaceChildren();
        if (!turnos.length) box.append(el('p','small','Todavía no tenés actividades asignadas.'));
        turnos.forEach(item => {
            const row=el('div','item-row'), info=el('div','item-info');
            info.append(el('strong','',item.nombre),el('small','',detalle(item)));
            const cancelar=el('button','text-button','Cancelar inscripción');cancelar.type='button';
            cancelar.addEventListener('click',async () => { cancelar.disabled=true; try { await api(`/api/bookings/${item.id}`,{method:'DELETE'}); await actualizar(); document.getElementById('confirmacion').textContent='Inscripción cancelada.'; } catch(error) { cancelar.disabled=false; document.getElementById('confirmacion').textContent=error.message; } });
            row.append(info,cancelar);box.append(row);
        });
    }
    async function actualizar() {
        [turnos,carrito] = await Promise.all([api('/api/bookings'),api('/api/cart')]);
        renderTurnos();renderCarrito();renderOpciones();
    }
    select.addEventListener('change',() => { document.getElementById('actividad-mensaje').textContent=''; renderOpciones(); });
    document.getElementById('ir-pagar').addEventListener('click',() => { if (!carrito.items.length) return; pago.hidden=false;renderPago();pago.scrollIntoView({behavior:'smooth',block:'start'}); });
    document.getElementById('volver-carrito').addEventListener('click',() => {pago.hidden=true;document.getElementById('carrito').scrollIntoView({behavior:'smooth'});});
    document.getElementById('pago-form').addEventListener('submit',async event => {
        event.preventDefault();
        const form=event.currentTarget; const button=form.querySelector('button[type="submit"]');
        button.disabled=true; document.getElementById('pago-mensaje').textContent='';
        let result;
        try { result=await api('/api/cart/checkout',{method:'POST'}); }
        catch(error) { document.getElementById('pago-mensaje').textContent=error.message;button.disabled=false;return; }
        pago.hidden=true;form.reset();button.disabled=false;
        document.getElementById('confirmacion').textContent=`¡Inscripción confirmada! Pago simulado: ${precio(result.total)}. Tus actividades aparecen aquí.`;
        try { await actualizar(); }
        catch(error) { document.getElementById('confirmacion').textContent+=' No pudimos actualizar la lista: recargá la página para verla.'; }
        document.getElementById('mis-actividades').scrollIntoView({behavior:'smooth',block:'start'});
        document.getElementById('mis-actividades').focus({preventScroll:true});
    });
    document.getElementById('cerrar-sesion').addEventListener('click',async e=>{e.preventDefault();try{await api('/api/logout',{method:'POST'});location.href='login.html';}catch(error){document.getElementById('actividad-mensaje').textContent=error.message;}});
    (async () => {
        try {
            const session=await api('/api/session');
            if (!session.user) { if (actividadElegida) sessionStorage.setItem('actividad_pendiente',actividadElegida);location.href='login.html';return; }
            const datos=await api('/api/actividades');actividades=datos.actividades;hoy=datos.hoy;
            actividades.forEach(a=>{const option=el('option','',`${a.icono} ${a.nombre}`);option.value=a.id;select.append(option);});
            if (actividades.some(a=>a.id===actividadElegida)) select.value=actividadElegida;
            await actualizar();
        } catch(error) { document.getElementById('actividad-mensaje').textContent=error.message; }
    })();
}

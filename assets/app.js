(() => {
  'use strict';

  // ===== Service Worker: registra no load (com bust de cache e auto-reload) =====
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        // mude este valor SEMPRE que alterar o service-worker.js
        const SW_VERSION = '2025-08-26-04';

        const reg = await navigator.serviceWorker.register(`./service-worker.js?v=${SW_VERSION}`, {
          updateViaCache: 'none'
        });

        // se já existe um SW novo esperando, ativa na hora
        if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING');

        // quando encontrar um SW novo instalando, força ativação ao terminar
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (sw) {
            sw.addEventListener('statechange', () => {
              if (sw.state === 'installed' && navigator.serviceWorker.controller) {
                sw.postMessage('SKIP_WAITING');
              }
            });
          }
        });

        // quando o controlador muda (novo SW assume), recarrega 1x
        let reloaded = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!reloaded) {
            reloaded = true;
            location.reload();
          }
        });
      } catch (e) {
        console.warn('[SW register]', e);
      }
    });
  }

  // ===== Overlay de erro =====
  function showErr(msg){
    try{
      const box = document.getElementById('errOverlay');
      if (!box) return;
      box.textContent = 'Erro no script: ' + msg;
      box.style.display = 'block';
      console.error('[App]', msg);
    }catch(e){}
  }
  window.addEventListener('error', e => showErr(e.message || String(e)));
  window.addEventListener('unhandledrejection', e => showErr((e && e.reason && e.reason.message) || String(e)));

  // ===== Helpers =====
  const $ = s => document.querySelector(s);
  const uid = () => Math.random().toString(36).slice(2,9);
  const escapeHtml = s => (s==null?'':String(s)).replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const absUrl = p => new URL(p, window.location.href).href;
  const sanitize = s => {
    try { return (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim(); }
    catch { return (s||'').toLowerCase().replace(/\s+/g,' ').trim(); }
  };

  // ===== Estado =====
  const LS_KEY = 'lux_acab_lista_v15_blob_full';
  const state = {
    listaNome: '',
    comodos: [],
    rascunho: { id: uid(), nome:'', itens:{}, customLabels:{} },
    alvoPersId: null
  };
  window.state = state; // debug

  const labels = {
    ts10:'Tomada simples 10A', ts20:'Tomada simples 20A',
    td10:'Tomada dupla 10A',   td20:'Tomada dupla 20A',
    tt10:'Tomada tripla 10A',  tt20:'Tomada tripla 20A',
    is:'Interruptor simples',  idu:'Interruptor duplo',  itr:'Interruptor triplo',
    isp:'Interruptor paralelo simples', idup:'Interruptor paralelo duplo', itrp:'Interruptor paralelo triplo',
    isi:'Interruptor intermediário simples', idui:'Interruptor intermediário duplo', itri:'Interruptor intermediário triplo',
    camp:'Campainha'
  };
  const KIT_SUFFIX = ' (kit completo bastidor + espelho 4x2)';
  const keyTomada = (tipo, amp) => ({
    'simples-10':'ts10','simples-20':'ts20',
    'dupla-10':'td10',  'dupla-20':'td20',
    'tripla-10':'tt10', 'tripla-20':'tt20'
  })[`${tipo}-${amp}`];

  const save = () => { try{ localStorage.setItem(LS_KEY, JSON.stringify({listaNome:state.listaNome, comodos:state.comodos})); }catch(e){} };
  const load = () => {
    try{
      const d = JSON.parse(localStorage.getItem(LS_KEY)||'null');
      if(d){ state.listaNome=d.listaNome||''; state.comodos=Array.isArray(d.comodos)?d.comodos:[]; }
    }catch(e){}
  };
  const resetAll = () => {
    state.listaNome=''; state.comodos=[];
    state.rascunho={id:uid(),nome:'',itens:{},customLabels:{}};
    state.alvoPersId=null;
    try{ localStorage.removeItem(LS_KEY); }catch(e){}
    const n1 = $('#nomeListaAcab'); if(n1) n1.value='';
    const n2 = $('#nomeComodo'); if(n2) n2.value='';
    renderItensRascunho(); renderListaComodos();
  };

  // ===== UI refs =====
  const modal = $('#modalAcab');
  const titulo = $('#tituloAcab');
  const msg = $('#msgAcab');
  const listaComodos = $('#listaComodos');
  const wrapItens = $('#wrapItensComodo');
  const blocoNormal = $('#blocoNormal');
  const blocoPers = $('#blocoPersonalizado');
  const alvoPersInfo = $('#alvoPersInfo');
  const setMsg = (t, err=false) => { if(msg){ msg.textContent=t; msg.className = err?'error':'muted'; } };

  // ===== Render rascunho =====
  function renderItensRascunho(){
    const c = state.rascunho;
    const nome = (c && c.nome) ? c.nome : '';
    const rows = [];
    if(c){
      Object.keys(c.itens).forEach(k=>{
        const v = c.itens[k];
        if(v>0){
          const isCustom = k.indexOf('c:')===0;
          const label = isCustom ? (c.customLabels && c.customLabels[k]) : (labels[k] || k);
          rows.push(
            '<tr>'
              + '<td data-label="Item">' + escapeHtml(label) + '</td>'
              + '<td data-label="Qtd">' + v + '</td>'
              + '<td data-label="Ação"><div class="act">'
              + '<button class="btn tonal small" data-edit-draft="'+k+'" type="button">Editar</button>'
              + '<button class="btn danger small" data-del-draft="'+k+'" type="button">Excluir</button>'
              + '</div></td></tr>'
          );
        }
      });
    }
    wrapItens.innerHTML =
      '<div class="card"><div class="content">'
      + '<strong>Itens de ' + escapeHtml(nome || '(sem nome)') + '</strong>'
      + '<table class="items">'
      + '<thead><tr><th>Item</th><th>Qtd</th><th>Ação</th></tr></thead>'
      + '<tbody>' + (rows.join('') || '<tr><td data-label="Item" colspan="3" class="muted">Nenhum item</td></tr>') + '</tbody>'
      + '</table></div></div>';
  }

  // ===== Render cômodos =====
  function renderListaComodos(){
    listaComodos.innerHTML = state.comodos.map(c=>{
      const rows = [];
      Object.keys(c.itens).forEach(k=>{
        const v = c.itens[k];
        if(v>0){
          const isCustom = k.indexOf('c:')===0;
          const label = isCustom ? ((c.customLabels && c.customLabels[k]) || k) : (labels[k] || k);
          rows.push(
            '<tr>'
              + '<td data-label="Item">' + escapeHtml(label) + '</td>'
              + '<td data-label="Qtd">' + v + '</td>'
              + '<td data-label="Ação"><div class="act">'
              + '<button class="btn tonal small" data-edit-item="'+c.id+':'+k+'" type="button">Editar</button>'
              + '<button class="btn danger small" data-del-item="'+c.id+':'+k+'" type="button">Excluir</button>'
              + '</div></td></tr>'
          );
        }
      });
      return ''
        + '<div class="amb-card" data-id="'+c.id+'">'
        + '<h4>' + escapeHtml(c.nome) + '</h4>'
        + '<table class="items">'
        + '<thead><tr><th>Item</th><th>Qtd</th><th>Ação</th></tr></thead>'
        + '<tbody>' + (rows.join('') || '<tr><td data-label="Item" colspan="3" class="muted">Sem itens</td></tr>') + '</tbody>'
        + '</table>'
        + '<div class="amb-actions"><button class="btn secondary" data-del-room="'+c.id+'" type="button">Excluir cômodo</button></div>'
        + '</div>';
    }).join('');
  }

  // ===== Ações principais =====
  function abrir(){
    const lista = $('#nomeListaAcab');
    if(lista) lista.value = state.listaNome || '';
    titulo.textContent = state.listaNome ? ('Lista de Acabamentos — ' + state.listaNome) : 'Lista de Acabamentos';

    $('#nomeComodo').value = state.rascunho.nome || '';
    $('#tipoTomada').value='simples';
    $('#ampTomada').value='10';
    $('#qtdTomada').value='';

    $('#tipoInt').value='is';
    $('#qtdInt').value='';

    $('#tipoIntPar').value='isp';
    $('#qtdIntPar').value='';

    $('#tipoIntMed').value='isi';
    $('#qtdIntMed').value='';

    $('#qtdCamp').value='';

    $('#bastidor').value='4x2';
    $('#qBast').value='';
    $('#espelhoTipo').value='4x2';
    $('#espelhoEsp').value='1';
    $('#qEsp').value='';
    $('#qIntS').value='';
    $('#qIntP').value='';
    $('#qIntI').value='';
    $('#qTom10').value='';
    $('#qTom20').value='';
    $('#qRJ45_5e').value='';
    $('#qRJ45_6e').value='';
    $('#qAnt').value='';
    $('#qPuls').value='';
    $('#qDimer').value='';
    $('#qCego').value='';

    blocoPers.classList.add('hidden');
    blocoNormal.classList.remove('hidden');

    renderItensRascunho();
    renderListaComodos();
    setMsg('Digite o nome do cômodo, selecione quantidades e clique em “Salvar item”.');

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }
  function fechar(){
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function mergeDraftIntoRooms(preserveName=true){
    const nome = (state.rascunho.nome || '').trim();
    if(!nome) return false;

    const keyName = sanitize(nome);
    const idx = state.comodos.findIndex(c => sanitize(c.nome)===keyName);

    if(idx>=0){
      const alvo = state.comodos[idx];
      Object.keys(state.rascunho.itens).forEach(k=>{
        const v = state.rascunho.itens[k];
        alvo.itens[k] = (alvo.itens[k]||0) + v;
        if(k.indexOf('c:')===0){
          alvo.customLabels = alvo.customLabels || {};
          alvo.customLabels[k] = state.rascunho.customLabels[k];
        }
      });
    }else{
      const novo = JSON.parse(JSON.stringify(state.rascunho));
      if(!novo.id) novo.id=uid();
      state.comodos.push(novo);
    }

    const keepName = preserveName ? nome : '';
    state.rascunho = { id: uid(), nome: keepName, itens:{}, customLabels:{} };
    $('#nomeComodo').value = keepName;
    save();
    renderItensRascunho();
    renderListaComodos();
    return true;
  }

  function salvarItem(){
    const nome = (state.rascunho.nome||'').trim();
    if(!nome){ setMsg('Informe o nome do cômodo.', true); return; }
    let added = 0;

    const tt = $('#tipoTomada').value,
          aa = $('#ampTomada').value,
          qt = Math.max(0, Number($('#qtdTomada').value||0));
    if(qt>0){ const k = keyTomada(tt, aa); state.rascunho.itens[k] = (state.rascunho.itens[k]||0)+qt; $('#qtdTomada').value=''; added+=qt; }

    const ti = $('#tipoInt').value,
          qi = Math.max(0, Number($('#qtdInt').value||0));
    if(qi>0){ state.rascunho.itens[ti] = (state.rascunho.itens[ti]||0)+qi; $('#qtdInt').value=''; added+=qi; }

    const tip = $('#tipoIntPar').value,
          qip = Math.max(0, Number($('#qtdIntPar').value||0));
    if(qip>0){ state.rascunho.itens[tip] = (state.rascunho.itens[tip]||0)+qip; $('#qtdIntPar').value=''; added+=qip; }

    const tim = $('#tipoIntMed').value,
          qim = Math.max(0, Number($('#qtdIntMed').value||0));
    if(qim>0){ state.rascunho.itens[tim] = (state.rascunho.itens[tim]||0)+qim; $('#qtdIntMed').value=''; added+=qim; }

    const qcamp = Math.max(0, Number($('#qtdCamp').value||0));
    if(qcamp>0){ state.rascunho.itens.camp = (state.rascunho.itens.camp||0)+qcamp; $('#qtdCamp').value=''; added+=qcamp; }

    if(added===0){ setMsg('Informe ao menos uma quantidade.', true); return; }

    mergeDraftIntoRooms(true);
    setMsg('Item salvo no cômodo.');
  }

  function novoComodo(){
    state.rascunho = { id: uid(), nome:'', itens:{}, customLabels:{} };
    $('#nomeComodo').value = '';
    $('#tipoTomada').value='simples'; $('#ampTomada').value='10'; $('#qtdTomada').value='';
    $('#tipoInt').value='is'; $('#qtdInt').value='';
    $('#tipoIntPar').value='isp'; $('#qtdIntPar').value='';
    $('#tipoIntMed').value='isi'; $('#qtdIntMed').value='';
    $('#qtdCamp').value='';
    renderItensRascunho();
    setMsg('Digite o nome do novo cômodo.');
  }

  // Edit/Delete rascunho
  $('#wrapItensComodo').addEventListener('click', ev=>{
    const del = ev.target.closest?.('[data-del-draft]');
    const edit = ev.target.closest?.('[data-edit-draft]');
    if(del){
      const k = del.dataset.delDraft;
      delete state.rascunho.itens[k];
      if(state.rascunho.customLabels) delete state.rascunho.customLabels[k];
      renderItensRascunho();
    }
    if(edit){
      const k2 = edit.dataset.editDraft;
      const cur = state.rascunho.itens[k2]||0;
      const nv = Number(prompt('Nova quantidade:', String(cur)));
      if(isFinite(nv)){
        if(nv<=0){ delete state.rascunho.itens[k2]; if(state.rascunho.customLabels) delete state.rascunho.customLabels[k2]; }
        else { state.rascunho.itens[k2] = Math.floor(nv); }
        renderItensRascunho();
      }
    }
  });

  // Tabelas salvas
  $('#listaComodos').addEventListener('click', ev=>{
    const delItem = ev.target.closest?.('[data-del-item]');
    if(delItem){
      const parts = delItem.dataset.delItem.split(':'), roomId = parts[0], key = parts.slice(1).join(':');
      const room = state.comodos.find(c => c.id===roomId);
      if(room){ delete room.itens[key]; if(room.customLabels) delete room.customLabels[key]; save(); renderListaComodos(); }
    }
    const editItem = ev.target.closest?.('[data-edit-item]');
    if(editItem){
      const parts2 = editItem.dataset.editItem.split(':'), roomId2 = parts2[0], key2 = parts2.slice(1).join(':');
      const room2 = state.comodos.find(c => c.id===roomId2); if(!room2) return;
      const cur2 = room2.itens[key2]||0;
      const nv2 = Number(prompt('Nova quantidade:', String(cur2)));
      if(isFinite(nv2)){
        if(nv2<=0){ delete room2.itens[key2]; if(room2.customLabels) delete room2.customLabels[key2]; }
        else { room2.itens[key2] = Math.floor(nv2); }
        save(); renderListaComodos();
      }
    }
    const delRoom = ev.target.closest?.('[data-del-room]');
    if(delRoom){
      const id = delRoom.dataset.delRoom;
      const i = state.comodos.findIndex(c => c.id===id);
      if(i>=0){ state.comodos.splice(i,1); save(); renderListaComodos(); }
    }
  });

  // Personalizado
  function abrirPersonalizado(){
    let nome = prompt('Para qual cômodo adicionar os itens personalizados?');
    if(!nome) return;
    nome = nome.trim();
    const keyName = sanitize(nome);

    const room = state.comodos.find(c => sanitize(c.nome)===keyName);
    if(room){
      state.alvoPersId = room.id;
      alvoPersInfo.textContent = 'Alvo: cômodo existente “' + room.nome + '”';
    }else{
      state.alvoPersId = null;
      state.rascunho = { id: uid(), nome: nome, itens:{}, customLabels:{} };
      $('#nomeComodo').value = nome;
      alvoPersInfo.textContent = 'Alvo: novo cômodo “' + nome + '” (será criado ao salvar)';
      renderItensRascunho();
    }

    $('#bastidor').value='4x2';
    $('#qBast').value='';
    $('#espelhoTipo').value='4x2';
    $('#espelhoEsp').value='1';
    $('#qEsp').value='';
    $('#qIntS').value='';
    $('#qIntP').value='';
    $('#qIntI').value='';
    $('#qTom10').value='';
    $('#qTom20').value='';
    $('#qRJ45_5e').value='';
    $('#qRJ45_6e').value='';
    $('#qAnt').value='';
    $('#qPuls').value='';
    $('#qDimer').value='';
    $('#qCego').value='';

    blocoNormal.classList.add('hidden');
    blocoPers.classList.remove('hidden');
    setMsg('Modo personalizado ativo.');
  }
  function voltarNormal(){
    blocoPers.classList.add('hidden');
    blocoNormal.classList.remove('hidden');
    setMsg('Voltando ao preenchimento normal.');
  }
  function addCustomEntry(label, qty){
    if(qty<=0) return 0;
    const key = 'c:' + label;
    if(state.alvoPersId){
      const room = state.comodos.find(c => c.id===state.alvoPersId);
      if(room){
        room.itens[key] = (room.itens[key]||0) + qty;
        room.customLabels = room.customLabels || {};
        room.customLabels[key] = label;
        save(); renderListaComodos();
      }
    }else{
      state.rascunho.itens[key] = (state.rascunho.itens[key]||0) + qty;
      state.rascunho.customLabels[key] = label;
      renderItensRascunho();
    }
    return qty;
  }
  function addPers(){
    const b = $('#bastidor').value;
    const espTipo = $('#espelhoTipo').value;
    const espEsp  = $('#espelhoEsp').value;

    const qBast = Math.max(0, Number($('#qBast').value||0));
    const qEsp  = Math.max(0, Number($('#qEsp').value||0));

    const qIntS = Math.max(0, Number($('#qIntS').value||0));
    const qIntP = Math.max(0, Number($('#qIntP').value||0));
    const qIntI = Math.max(0, Number($('#qIntI').value||0));
    const qTom10 = Math.max(0, Number($('#qTom10').value||0));
    const qTom20 = Math.max(0, Number($('#qTom20').value||0));
    const q5e = Math.max(0, Number($('#qRJ45_5e').value||0));
    const q6e = Math.max(0, Number($('#qRJ45_6e').value||0));
    const qAnt = Math.max(0, Number($('#qAnt').value||0));
    const qPuls = Math.max(0, Number($('#qPuls').value||0));
    const qDimer = Math.max(0, Number($('#qDimer').value||0));
    const qCego = Math.max(0, Number($('#qCego').value||0));

    let added = 0;
    added += addCustomEntry('Bastidor ' + b, qBast);
    if(espEsp === 'cego'){ added += addCustomEntry('Espelho ' + espTipo + ' cego', qEsp); }
    else { added += addCustomEntry('Espelho ' + espTipo + ' ' + espEsp + ' ' + (espEsp==='1'?'espaço':'espaços'), qEsp); }

    added += addCustomEntry('Módulo de interruptor simples', qIntS);
    added += addCustomEntry('Módulo de interruptor paralelo', qIntP);
    added += addCustomEntry('Módulo de interruptor intermediário', qIntI);
    added += addCustomEntry('Módulo de tomada 10A', qTom10);
    added += addCustomEntry('Módulo de tomada 20A', qTom20);
    added += addCustomEntry('Módulo RJ45 Cat 5e', q5e);
    added += addCustomEntry('Módulo RJ45 Cat 6e', q6e);
    added += addCustomEntry('Módulo de antena', qAnt);
    added += addCustomEntry('Botão pulsador', qPuls);
    added += addCustomEntry('Módulo dimer', qDimer);
    added += addCustomEntry('Módulo cego', qCego);

    if(added===0){ setMsg('No personalizado, informe ao menos uma quantidade.', true); return; }

    if(!state.alvoPersId){
      mergeDraftIntoRooms(true);
      setMsg('Itens personalizados adicionados (cômodo criado/atualizado).');
    } else {
      setMsg('Itens personalizados adicionados.');
    }

    ['qBast','qEsp','qIntS','qIntP','qIntI','qTom10','qTom20',
     'qRJ45_5e','qRJ45_6e','qAnt','qPuls','qDimer','qCego']
     .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

    blocoPers.classList.add('hidden');
    blocoNormal.classList.remove('hidden');
  }

  // ===== Exportar PDF (iframe + srcdoc, mesma origem) =====
  function exportarPDF(){
    if(!state.comodos.length){ setMsg('Adicione ao menos um cômodo.', true); return; }

    const fileTitle = 'Lista de Acabamentos' + (state.listaNome ? ' — ' + state.listaNome : '');

    const css = '<style>'
      + '@page{ size:A4; margin:16mm }'
      + 'body{ font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Arial; color:#111; }'
      + '.header{ display:flex; align-items:center; gap:12px; border-bottom:2px solid #e9eef6; padding-bottom:10px; margin-bottom:16px; }'
      + '.header img{ width:40px; height:40px; object-fit:contain; border-radius:8px; }'
      + 'h1{ font-size:20px; margin:0 }'
      + 'h2{ font-size:16px; margin:14px 0 8px }'
      + 'table{ width:100%; border-collapse:collapse; margin-top:6px }'
      + 'th,td{ border:1px solid #dfe7f3; padding:8px 10px; text-align:left; }'
      + 'th{ background:#f6f9fe }'
      + '.small{ font-size:12px }'
      + '</style>';

    const logoPng = absUrl('assets/img/luxcorp-logo.png');
    const logoJpg = absUrl('assets/img/luxcorp-logo.jpg');

    const rowHtml = (label, qtd, isCustom) => {
      const texto = isCustom ? label : (label + KIT_SUFFIX);
      return '<tr><td>'+escapeHtml(texto)+'</td><td>'+qtd+'</td></tr>';
    };

    const roomTable = (c) => {
      const rows = [];
      Object.keys(c.itens).forEach(k=>{
        const v = c.itens[k];
        if(v>0){
          const isCustom = k.indexOf('c:')===0;
          const label = isCustom ? ((c.customLabels && c.customLabels[k]) || k) : (labels[k] || k);
          rows.push(rowHtml(label, v, isCustom));
        }
      });
      const tbody = rows.join('') || '<tr><td colspan="2" class="small" style="color:#666">Sem itens</td></tr>';
      return '<h2>'+escapeHtml(c.nome)+'</h2>'
           + '<table><thead><tr><th>Item</th><th>Qtd</th></tr></thead><tbody>'+tbody+'</tbody></table>';
    };

    const html =
      '<!DOCTYPE html><html><head><meta charset="utf-8">'
      + '<title>'+escapeHtml(fileTitle)+'</title>'
      + '<base href="'+escapeHtml(location.href)+'">'
      + css
      + '</head><body>'
      + '<div class="header"><img src="'+logoPng+'" onerror="this.onerror=null;this.src=\''+logoJpg+'\'"><div><h1>'+escapeHtml(fileTitle)+'</h1></div></div>'
      + state.comodos.map(roomTable).join('')
      + '</body></html>';

    const iframe = document.createElement('iframe');
    Object.assign(iframe.style, {position:'fixed',right:'0',bottom:'0',width:'0',height:'0',border:'0'});
    document.body.appendChild(iframe);

    iframe.onload = () => {
      try { iframe.contentWindow.focus(); iframe.contentWindow.print(); }
      finally { setTimeout(() => { try{ iframe.remove(); }catch{} }, 1200); }
    };

    iframe.srcdoc = html;

    resetAll();
    fechar();
    setMsg('Lista exportada e zerada. Clique em “+ Lista de acabamentos” para iniciar outra.');
  }

  // ===== Eventos =====
  $('#btnAbrirAcab').addEventListener('click', abrir);
  $('#btnFecharAcab').addEventListener('click', fechar);
  $('#btnSalvarItem').addEventListener('click', salvarItem);
  $('#btnNovoComodo').addEventListener('click', novoComodo);
  $('#btnExportarAcab').addEventListener('click', exportarPDF);
  $('#btnPersonalizado').addEventListener('click', abrirPersonalizado);
  $('#btnAddPers').addEventListener('click', addPers);
  $('#btnVoltarNormal').addEventListener('click', voltarNormal);

  $('#nomeListaAcab').addEventListener('input', e=>{
    state.listaNome = (e.target.value||'').trim();
    const t = state.listaNome ? ('Lista de Acabamentos — ' + state.listaNome) : 'Lista de Acabamentos';
    $('#tituloAcab').textContent = t;
    save();
  });
  $('#nomeComodo').addEventListener('input', e=>{
    state.rascunho.nome = (e.target.value||'').trim();
    renderItensRascunho();
  });

  // ===== Boot =====
  load();
  renderListaComodos();

  // ====== Melhorias mobile ======
  // 1) Corrige 100vh no mobile
  function fixVH(){
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', vh + 'px');
  }
  window.addEventListener('resize', fixVH);
  window.addEventListener('orientationchange', fixVH);
  fixVH();

  // 2) Teclado numérico + placeholder "0" e remover "0" inicial dos inputs
  function patchNumericInputs(){
    document.querySelectorAll('input[type="number"]').forEach(el=>{
      el.setAttribute('inputmode', 'numeric');
      el.setAttribute('pattern', '[0-9]*');
      if (!el.placeholder) el.placeholder = '0';
      if (el.value === '0') el.value = '';
    });
  }
  patchNumericInputs();

  // 3) Barra de ações fixa (mobile) que espelha ações principais
  (function setupMobileFooter(){
    const ma = document.getElementById('mobileActions');
    if(!ma) return;

    const btnPrimary = document.getElementById('maPrimary');
    const btnSec = document.getElementById('maSecondary');
    const btnExp = document.getElementById('maExport');

    const btnSalvarItem = document.getElementById('btnSalvarItem');
    const btnPersonalizado = document.getElementById('btnPersonalizado');
    const btnNovoComodo = document.getElementById('btnNovoComodo');
    const btnExportarAcab = document.getElementById('btnExportarAcab');
    const btnAddPers = document.getElementById('btnAddPers');
    const btnVoltarNormal = document.getElementById('btnVoltarNormal');

    function setFooterMode(isPers){
      if(isPers){
        btnPrimary.textContent = 'Salvar kit';
        btnSec.textContent = 'Voltar';
        btnPrimary.onclick = () => btnAddPers?.click();
        btnSec.onclick = () => btnVoltarNormal?.click();
      }else{
        btnPrimary.textContent = 'Salvar item';
        btnSec.textContent = 'Personalizado';
        btnPrimary.onclick = () => btnSalvarItem?.click();
        btnSec.onclick = () => btnPersonalizado?.click();
        // long-press/ctx para adicionar novo cômodo rápido
        btnSec.oncontextmenu = (e) => { e.preventDefault(); btnNovoComodo?.click(); };
      }
      btnExp.onclick = () => btnExportarAcab?.click();

      const isOpen = modal?.classList.contains('open');
      ma.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
      ma.style.display = (isOpen && window.matchMedia('(max-width: 640px)').matches) ? 'flex' : 'none';
    }

    // Observa mudanças de modo
    const obs = new MutationObserver(() => setFooterMode(!blocoPers.classList.contains('hidden')));
    obs.observe(blocoPers, { attributes:true, attributeFilter:['class'] });

    // Observa abrir/fechar modal
    const obsModal = new MutationObserver(() => {
      setFooterMode(!blocoPers.classList.contains('hidden'));
    });
    obsModal.observe(modal, { attributes:true, attributeFilter:['class'] });

    setFooterMode(false);
  })();

  console.log('[App] init ok');
})();

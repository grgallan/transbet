// =============================================================
//  Karaokê — controle (celular)
// =============================================================
const $ = id => document.getElementById(id);
const $$ = sel => [...document.querySelectorAll(sel)];

// ---------- sala e conexão com a TV ----------
const params = new URLSearchParams(location.search);
let sala = (params.get('sala') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
try {
  if (sala) localStorage.setItem('karaoke:sala-cel', sala);
  else sala = localStorage.getItem('karaoke:sala-cel') || '';
} catch {}

// "socket" simples sobre o transporte (mesma interface usada no resto do arquivo)
const socket = {
  conn: null, ouvintes: {},
  emit(tipo, dados) { this.conn?.enviar({ tipo, dados }); },
  on(tipo, fn) { (this.ouvintes[tipo] ||= []).push(fn); },
  disparar(tipo, dados) { (this.ouvintes[tipo] || []).forEach(fn => fn(dados)); },
};
const esperando = new Map();
function pedido(nome, dados, tempo = 25000) {
  return new Promise((ok, falha) => {
    if (!socket.conn) return falha(new Error('Conecte-se a uma sala primeiro.'));
    const id = Math.random().toString(36).slice(2);
    const t = setTimeout(() => { esperando.delete(id); falha(new Error('A TV não respondeu. Confira se a tela do Karaokê está aberta.')); }, tempo);
    esperando.set(id, { ok, falha, t });
    socket.conn.enviar({ tipo: 'pedido', id, nome, dados });
  });
}
function conectarSala() {
  if (!sala) { mostrarEntrada(); return; }
  document.getElementById('codigoAtual').textContent = sala;
  socket.conn = Transporte.cliente(sala, {
    aoReceber: msg => {
      if (msg?.tipo === 'resposta') {
        const p = esperando.get(msg.id);
        if (!p) return;
        esperando.delete(msg.id); clearTimeout(p.t);
        msg.ok ? p.ok(msg.dados) : p.falha(new Error(msg.erro));
        return;
      }
      if (msg?.tipo) socket.disparar(msg.tipo, msg.dados);
    },
    aoStatus: s => {
      const on = s === 'conectado';
      document.getElementById('status').classList.toggle('on', on);
      const txt = { conectando: 'Conectando à TV…', 'tv-ausente': 'TV não encontrada. A tela do Karaokê está aberta na TV?', 'sem-rede': 'Sem internet. Tentando de novo…', desconectado: 'Conexão com a TV caiu. Reconectando…' }[s];
      const faixa = document.getElementById('faixaConexao');
      faixa.textContent = txt || '';
      faixa.classList.toggle('oculto', on || !txt);
      if (on) carregarConfig();
    },
  });
}
function mostrarEntrada() { document.getElementById('modalSala').classList.remove('oculto'); setTimeout(() => document.getElementById('campoSala').focus(), 50); }
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mostrar = (el, sim) => el.classList.toggle('oculto', !sim);
const guardar = (k, v) => { try { localStorage.setItem('karaoke:' + k, JSON.stringify(v)); } catch {} };
const lerLocal = (k, p) => { try { return JSON.parse(localStorage.getItem('karaoke:' + k)) ?? p; } catch { return p; } };

let est = { fila: [], favoritos: [], historico: [] };
let resultados = [];          // resultados atuais da busca
let proximaPagina = null, ultimaBusca = '';
let notaVista = null;
let pendenteAdicionar = null; // vídeo aguardando o nome do cantor
let periodo = 'hoje';

// ---------- abas ----------
function irPara(aba) {
  $$('.aba').forEach(a => a.classList.toggle('ativa', a.id === 'aba-' + aba));
  $$('.abas button').forEach(b => b.classList.toggle('ativa', b.dataset.aba === aba));
  window.scrollTo({ top: 0 });
}
$$('.abas button').forEach(b => b.onclick = () => irPara(b.dataset.aba));
document.addEventListener('click', e => {
  const a = e.target.closest('[data-ir]');
  if (a) { e.preventDefault(); irPara(a.dataset.ir); }
});

// ---------- nome do cantor ----------
function nome() { return lerLocal('nome', ''); }
function atualizarNome() { $('nomeCantor').textContent = nome() || 'Seu nome'; }
function pedirNome(video) {
  pendenteAdicionar = video || null;
  $('campoNome').value = nome();
  mostrar($('modalNome'), true);
  setTimeout(() => $('campoNome').focus(), 50);
}
$('btCantor').onclick = () => pedirNome(null);
$('formNome').onsubmit = e => {
  e.preventDefault();
  const n = $('campoNome').value.trim();
  if (!n) return;
  guardar('nome', n);
  atualizarNome();
  mostrar($('modalNome'), false);
  if (pendenteAdicionar) { adicionar(pendenteAdicionar); pendenteAdicionar = null; }
};
$('modalNome').onclick = e => { if (e.target.id === 'modalNome') { mostrar($('modalNome'), false); pendenteAdicionar = null; } };
atualizarNome();

function adicionar(video) {
  if (!nome()) return pedirNome(video);
  socket.emit('fila:adicionar', { video, cantor: nome() });
  if (navigator.vibrate) navigator.vibrate(30);
}

// ---------- renderização de vídeos ----------
const ehFav = id => est.favoritos.some(f => f.videoId === id);

function cartaoVideo(v, { acoes, sub, pos } = {}) {
  return `<li class="video${pos ? ' fila' : ''}" data-video="${esc(v.videoId)}">
    <div class="thumb">
      <img src="${esc(v.thumb)}" alt="" loading="lazy">
      ${v.duracao ? `<span class="dur">${esc(v.duracao)}</span>` : ''}
      ${pos ? `<span class="pos">${pos}</span>` : ''}
    </div>
    <div class="info">
      <div class="t">${esc(v.titulo)}</div>
      <div class="c">${sub ?? esc(v.canal)}</div>
    </div>
    <div class="acoes${pos ? ' linha' : ''}">${acoes}</div>
  </li>`;
}

const botoesPadrao = v => `
  <button class="add" data-acao="add" aria-label="Adicionar à fila">＋</button>
  <button class="fav${ehFav(v.videoId) ? ' on' : ''}" data-acao="fav" aria-label="Favoritar">${ehFav(v.videoId) ? '♥' : '♡'}</button>`;

// cliques nas listas (delegação)
function ligarLista(el, fonte) {
  el.addEventListener('click', e => {
    const b = e.target.closest('button[data-acao]');
    if (!b) return;
    const li = b.closest('li');
    const acao = b.dataset.acao;
    const id = li.dataset.id;
    const v = fonte().find(x => (id ? x.id === id : x.videoId === li.dataset.video));
    if (!v) return;
    if (acao === 'add') adicionar(videoBasico(v));
    if (acao === 'fav') socket.emit('favoritos:alternar', videoBasico(v));
    if (acao === 'cima') socket.emit('fila:mover', { id, direcao: -1 });
    if (acao === 'baixo') socket.emit('fila:mover', { id, direcao: 1 });
    if (acao === 'agora') socket.emit('fila:tocarAgora', { id });
    if (acao === 'remover') socket.emit('fila:remover', { id });
  });
}
const videoBasico = v => ({ videoId: v.videoId, titulo: v.titulo, canal: v.canal, thumb: v.thumb, duracao: v.duracao });

// ---------- busca ----------
const SUGESTOES = ['Evidências', 'Sertanejo', 'Pagode', 'MPB', 'Rock nacional', 'Anos 80', 'Forró', 'Internacional', 'Samba', 'Axé'];
function renderSugestoes() {
  const recentes = lerLocal('recentes', []);
  const lista = [...new Set([...recentes, ...SUGESTOES])].slice(0, 14);
  $('sugestoes').innerHTML = lista.map(s => `<button type="button">${esc(s)}</button>`).join('');
}
$('sugestoes').onclick = e => {
  const b = e.target.closest('button');
  if (b) { $('campoBusca').value = b.textContent; buscar(b.textContent); }
};

$('formBusca').onsubmit = e => {
  e.preventDefault();
  const q = $('campoBusca').value.trim();
  if (q) { $('campoBusca').blur(); buscar(q); }
};
$('btMais').onclick = () => buscar(ultimaBusca, proximaPagina);

async function buscar(q, pagina) {
  if (!pagina) {
    resultados = [];
    $('resultados').innerHTML = '<li class="carregando">Procurando músicas… 🎶</li>';
    if (!/youtu|^[\w-]{11}$/.test(q)) {
      guardar('recentes', [q, ...lerLocal('recentes', []).filter(r => r.toLowerCase() !== q.toLowerCase())].slice(0, 6));
    }
  }
  mostrar($('btMais'), false);
  ultimaBusca = q;
  try {
    const j = await pedido('buscar', { q, pagina });
    resultados = [...resultados, ...j.itens];
    proximaPagina = j.proxima;
    renderResultados();
    mostrar($('btMais'), !!proximaPagina);
    renderSugestoes();
  } catch (err) {
    $('resultados').innerHTML = `<li class="vazio"><big>😕</big>${esc(err.message)}</li>`;
  }
}

function renderResultados() {
  $('resultados').innerHTML = resultados.length
    ? resultados.map(v => cartaoVideo(v, { acoes: botoesPadrao(v) })).join('')
    : '<li class="vazio"><big>🔎</big>Nada encontrado. Tente outro nome.</li>';
}
ligarLista($('resultados'), () => resultados);

// ---------- fila ----------
function renderFila() {
  const f = est.fila;
  $('qtdFila').textContent = f.length ? `(${f.length})` : '';
  $('badgeFila').textContent = f.length;
  mostrar($('badgeFila'), f.length > 0);
  $('listaFila').innerHTML = f.length
    ? f.map((v, i) => cartaoVideo(v, {
        pos: i + 1,
        sub: `<b>🎤 ${esc(v.cantor)}</b> · ${esc(v.canal)}`,
        acoes: `<button data-acao="cima" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
                <button data-acao="baixo" ${i === f.length - 1 ? 'disabled' : ''} aria-label="Descer">↓</button>
                <button data-acao="agora" aria-label="Tocar agora">▶ Agora</button>
                <button data-acao="remover" aria-label="Remover">✕</button>`,
      }).replace('<li class', `<li data-id="${esc(v.id)}" class`)).join('')
    : '<li class="vazio"><big>📭</big>A fila está vazia.<br>Busque uma música e toque em ＋.</li>';
}
ligarLista($('listaFila'), () => est.fila);

$('btReiniciar').onclick = () => socket.emit('player:reiniciar');
$('btLimparFila').onclick = () => { if (est.fila.length && confirm('Remover todas as músicas da fila?')) socket.emit('fila:limpar'); };
let timerVol;
$('volume').oninput = e => { clearTimeout(timerVol); timerVol = setTimeout(() => socket.emit('player:volume', +e.target.value), 120); };

// ---------- favoritos ----------
function renderFavoritos() {
  $('listaFavoritos').innerHTML = est.favoritos.length
    ? est.favoritos.map(v => cartaoVideo(v, { acoes: botoesPadrao(v) })).join('')
    : '<li class="vazio"><big>💜</big>Toque em ♡ numa música para guardar aqui.</li>';
}
ligarLista($('listaFavoritos'), () => est.favoritos);

// ---------- ranking / histórico ----------
$$('.filtro button').forEach(b => b.onclick = () => {
  periodo = b.dataset.periodo;
  $$('.filtro button').forEach(x => x.classList.toggle('ativo', x === b));
  renderRanking();
});
function renderRanking() {
  const hoje = new Date().toDateString();
  const base = est.historico.filter(h => periodo === 'tudo' || new Date(h.data).toDateString() === hoje);
  const top = base.filter(h => h.nota != null).sort((a, b) => b.nota - a.nota).slice(0, 10);
  $('listaRanking').innerHTML = top.length
    ? top.map((h, i) => `<li><span class="p">${['🥇', '🥈', '🥉'][i] || i + 1}</span>
        <div class="info"><div class="n1">${esc(h.cantor)}</div><div class="n2">${esc(h.titulo)}</div></div>
        <span class="nota">${h.nota}</span></li>`).join('')
    : '<li class="vazio" style="display:block;border:0;background:none">Nenhuma nota ainda.</li>';

  const hist = base.slice(0, 50);
  $('listaHistorico').innerHTML = hist.length
    ? hist.map((h, i) => cartaoVideo(h, {
        sub: `<b>🎤 ${esc(h.cantor)}</b> · ${new Date(h.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}${h.nota != null ? ` · <span class="selo-nota">${h.nota}</span>` : h.erro ? ' · indisponível' : ''}`,
        acoes: `<button class="add" data-acao="add" aria-label="Cantar de novo">＋</button>`,
      }).replace('<li class', `<li data-hist="${i}" class`)).join('')
    : '<li class="vazio"><big>🕘</big>As músicas cantadas aparecem aqui.</li>';
}
$('listaHistorico').addEventListener('click', e => {
  const b = e.target.closest('button[data-acao="add"]');
  if (!b) return;
  const hoje = new Date().toDateString();
  const base = est.historico.filter(h => periodo === 'tudo' || new Date(h.data).toDateString() === hoje);
  const h = base[+b.closest('li').dataset.hist];
  if (h) adicionar(videoBasico(h));
});
$('btLimparHist').onclick = () => { if (confirm('Apagar histórico e ranking?')) socket.emit('historico:limpar'); };

// ---------- tocando agora ----------
function renderAgora() {
  const a = est.atual;
  mostrar($('agora'), !!a);
  if (!a) return;
  $('agoraThumb').src = a.thumb;
  $('agoraTitulo').textContent = a.titulo;
  $('agoraCantor').textContent = '🎤 ' + a.cantor;
  $('btAlternar').textContent = est.tocando ? '❚❚' : '▶';
}
socket.on('progresso', p => {
  if (est.atual && p.id === est.atual.id && p.total) $('barraProg').style.width = (p.atual / p.total * 100) + '%';
});
$('btAlternar').onclick = () => socket.emit('player:alternar');
$('btPular').onclick = () => socket.emit('player:pular');
$('btFinalizar').onclick = () => {
  if (est.modoNota === 'desligada') return socket.emit('player:pular');
  if (confirm('Finalizar a música e ver a nota?')) socket.emit('player:finalizar');
};

// ---------- nota no celular ----------
function renderNota() {
  const r = est.exibindoNota;
  if (!r) { notaVista = null; mostrar($('modalNota'), false); return; }
  if (notaVista === r.item.id) return;
  notaVista = r.item.id;
  $('mQuem').textContent = `${r.item.cantor} · ${r.item.titulo}`;
  $('mFrase').textContent = r.comentario || '';
  $('mEstrelas').innerHTML = Array.from({ length: 5 }, (_, i) => `<span class="${i < Math.round(r.nota / 20) ? 'acesa' : ''}">★</span>`).join('');
  mostrar($('modalNota'), true);
  const inicio = performance.now();
  const passo = t => {
    const p = Math.min(1, (t - inicio) / 1800);
    $('mNota').textContent = Math.round(r.nota * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
  if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
}
$('btFecharNota').onclick = () => socket.emit('player:pular');

// ---------- ajustes ----------
$$('#modoNota button').forEach(b => b.onclick = () => socket.emit('config:modoNota', b.dataset.modo));
function renderAjustes() {
  $$('#modoNota button').forEach(b => b.classList.toggle('ativo', b.dataset.modo === est.modoNota));
  mostrar($('semChave'), !est.temApiKey);
  if (document.activeElement !== $('volume')) $('volume').value = est.volume;
}

async function carregarConfig() {
  let c;
  try { c = await pedido('config:ler', {}); } catch { return; }
  $('apiStatus').textContent = c.temApiKey ? `✔ Chave configurada (${c.apiKeyMascarada})` : 'Nenhuma chave configurada';
  $('apiStatus').classList.toggle('ok', c.temApiKey);
  $('sufixo').value = c.sufixoBusca;
}
$('btSalvarApi').onclick = async () => {
  const corpo = { sufixoBusca: $('sufixo').value };
  if ($('apiKey').value.trim()) corpo.apiKey = $('apiKey').value.trim();
  $('btSalvarApi').disabled = true;
  $('btSalvarApi').textContent = 'Testando…';
  try {
    await pedido('config:salvar', corpo);
    $('apiKey').value = '';
    aviso('Configuração salva!', 'ok');
    carregarConfig();
  } catch (err) { aviso(err.message, 'erro'); }
  $('btSalvarApi').disabled = false;
  $('btSalvarApi').textContent = 'Salvar e testar';
};

// microfone deste celular
$('btMic').onclick = async () => {
  if (MicrofoneNota.ativo()) {
    MicrofoneNota.desligar();
    $('btMic').setAttribute('aria-checked', 'false');
    mostrar($('medidor'), false);
    return;
  }
  if (!window.isSecureContext) {
    mostrar($('micInseguro'), true);
    return;
  }
  try {
    await MicrofoneNota.ligar((tipo, dados) => socket.emit(tipo, dados), nivel => { $('medidor').firstElementChild.style.width = nivel * 100 + '%'; });
    MicrofoneNota.novaMusica(est.exibindoNota ? null : est.atual?.id);
    $('btMic').setAttribute('aria-checked', 'true');
    mostrar($('medidor'), true);
    if (est.modoNota !== 'microfone') aviso('Microfone ligado. Para valer na nota, escolha o modo “Microfone”.');
    else aviso('Microfone ligado! Mantenha esta tela aberta enquanto canta.', 'ok');
  } catch (err) {
    aviso(err.name === 'NotAllowedError' ? 'Permissão do microfone negada.' : err.message, 'erro');
  }
};
socket.on('comando', c => { if (c.acao === 'reiniciar') MicrofoneNota.reiniciar(); });

// ---------- conexão ----------
$('urlTv').textContent = new URL('tv.html', location.href).toString().replace(/\?.*/, '');
if (!window.isSecureContext) $('micInfo').textContent = 'Abra o app pelo endereço https para usar o microfone.';

// entrar / trocar de sala
$('formSala').onsubmit = e => {
  e.preventDefault();
  const c = $('campoSala').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.length < 4) return;
  const u = new URL(location.href);
  u.searchParams.set('sala', c);
  location.href = u.toString();
};
$('btTrocarSala').onclick = () => { $('campoSala').value = ''; mostrarEntrada(); };

// ---------- estado ----------
socket.on('estado', e => {
  const mudouMusica = e.atual?.id !== est.atual?.id;
  est = e;
  if (mudouMusica) $('barraProg').style.width = '0';
  MicrofoneNota.novaMusica(e.exibindoNota ? null : e.atual?.id);
  renderFila(); renderFavoritos(); renderRanking(); renderAgora(); renderNota(); renderAjustes();
  if (resultados.length) renderResultados(); // atualiza corações
});

function aviso(msg, tipo = 'info') {
  const d = document.createElement('div');
  d.className = 'aviso ' + tipo;
  d.textContent = msg;
  $('avisos').appendChild(d);
  while ($('avisos').children.length > 2) $('avisos').firstElementChild.remove();
  setTimeout(() => d.remove(), 4000);
}
socket.on('aviso', ({ msg, tipo }) => aviso(msg, tipo));

renderSugestoes();
conectarSala();
if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});

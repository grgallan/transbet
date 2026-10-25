// =============================================================
//  Karaokê — controle (celular)
// =============================================================
const $ = id => document.getElementById(id);
const $$ = sel => [...document.querySelectorAll(sel)];

// ---------- tudo roda neste celular ----------
// O "host" guarda fila, nota, histórico e faz a busca; esta tela conversa com ele direto.
let host = null;
const esperando = new Map();
const socket = {
  ouvintes: {},
  emit(tipo, dados) { host?.acao(tipo, dados); },
  on(tipo, fn) { (this.ouvintes[tipo] ||= []).push(fn); },
  disparar(tipo, dados) { (this.ouvintes[tipo] || []).forEach(fn => fn(dados)); },
};
const transporteLocal = {
  enviar: (_, msg) => {
    if (msg?.tipo !== 'resposta') return;
    const p = esperando.get(msg.id);
    if (!p) return;
    esperando.delete(msg.id);
    msg.ok ? p.ok(msg.dados) : p.falha(new Error(msg.erro));
  },
  todos: msg => { if (msg?.tipo === 'progresso') socket.disparar('progresso', msg.dados); },
  total: () => 1,
};
function pedido(nome, dados) {
  return new Promise((ok, falha) => {
    const id = Math.random().toString(36).slice(2);
    esperando.set(id, { ok, falha });
    host.receber('celular', { tipo: 'pedido', id, nome, dados });
  });
}
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
  guardar('aba', aba);
  window.scrollTo({ top: 0 });
  posicionarPalco();
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
  $('btAbrirYt').href = 'https://www.youtube.com/watch?v=' + a.videoId;
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

if (!window.isSecureContext) $('micInfo').textContent = 'Abra o app pelo endereço https para usar o microfone.';

// ---------- estado ----------
socket.on('estado', e => {
  const mudouMusica = e.atual?.id !== est.atual?.id;
  est = e;
  if (mudouMusica) $('barraProg').style.width = '0';
  MicrofoneNota.novaMusica(e.exibindoNota ? null : e.atual?.id);
  renderFila(); renderFavoritos(); renderRanking(); renderAgora(); renderNota(); renderAjustes();
  if (resultados.length) renderResultados(); // atualiza corações
  sincronizarPlayer(false);
});

function aviso(msg, tipo = 'info') {
  const d = document.createElement('div');
  d.className = 'aviso ' + tipo;
  d.textContent = msg;
  $('avisos').appendChild(d);
  while ($('avisos').children.length > 2) $('avisos').firstElementChild.remove();
  setTimeout(() => d.remove(), 4000);
}


// ---------- player (fica no celular; o Transmitir do YouTube manda para a TV) ----------
const YT_PLAYING = 1, YT_PAUSED = 2, YT_ENDED = 0, YT_BUFFERING = 3;
let player = null, playerPronto = false;
let idTocando = null, notaParou = null, fimEnviado = null, timerIntro = null, timerChecar = null;

window.onYouTubeIframeAPIReady = () => {
  player = new YT.Player('yt', {
    width: '100%', height: '100%',
    playerVars: { autoplay: 1, controls: 1, rel: 0, modestbranding: 1, playsinline: 1, iv_load_policy: 3, hl: 'pt-BR' },
    events: {
      onReady: () => { playerPronto = true; sincronizarPlayer(true); },
      onStateChange: e => {
        if (e.data === YT_PLAYING || e.data === YT_BUFFERING) mostrar($('tocarOverlay'), false);
        if (e.data === YT_PLAYING) host.estadoDoPlayer(true);
        if (e.data === YT_PAUSED && !est.exibindoNota) host.estadoDoPlayer(false);
        if (e.data === YT_ENDED && idTocando && fimEnviado !== idTocando) {
          fimEnviado = idTocando;
          host.fimDaMusica(idTocando);
        }
      },
      onError: e => host.erroNoVideo(idTocando, e.data),
    },
  });
};

function sincronizarPlayer(forcar) {
  posicionarPalco();
  if (est.exibindoNota) {
    if (notaParou !== est.exibindoNota.item.id) {
      notaParou = est.exibindoNota.item.id;
      clearInterval(timerIntro);
      mostrar($('intro'), false);
      if (playerPronto) player.stopVideo();
    }
    return;
  }
  notaParou = null;
  const novo = est.atual?.id || null;
  if (novo === idTocando && !forcar) return;
  const mudou = novo !== idTocando;
  idTocando = novo;
  if (!novo) {
    clearInterval(timerIntro);
    mostrar($('intro'), false);
    if (playerPronto) player.stopVideo();
    return;
  }
  if (mudou || (playerPronto && ![YT_PLAYING, YT_BUFFERING].includes(player.getPlayerState?.()))) iniciarMusica(est.atual);
}

function iniciarMusica(item) {
  clearInterval(timerIntro);
  clearTimeout(timerChecar);
  fimEnviado = null;
  mostrar($('tocarOverlay'), false);
  $('introCantor').textContent = item.cantor;
  $('introMusica').textContent = item.titulo;
  mostrar($('intro'), true);
  let n = 3;
  $('introContagem').textContent = n;
  timerIntro = setInterval(() => {
    n--;
    $('introContagem').textContent = n > 0 ? n : '🎤';
    if (n > 0) return;
    clearInterval(timerIntro);
    mostrar($('intro'), false);
    if (!playerPronto) return;
    player.setVolume(est.volume ?? 80);
    player.loadVideoById({ videoId: item.videoId });
    // se o navegador bloquear o play automático, mostra o botão de tocar
    timerChecar = setTimeout(() => {
      if (idTocando === item.id && ![YT_PLAYING, YT_BUFFERING, YT_PAUSED].includes(player.getPlayerState?.())) mostrar($('tocarOverlay'), true);
    }, 3500);
  }, 1000);
}

$('tocarOverlay').onclick = () => { if (playerPronto) player.playVideo(); mostrar($('tocarOverlay'), false); };

socket.on('comando', c => {
  if (c.acao === 'reiniciar') fimEnviado = null;
  if (!playerPronto) return;
  if (c.acao === 'pausar') player.pauseVideo();
  if (c.acao === 'continuar') player.playVideo();
  if (c.acao === 'reiniciar') { player.seekTo(0, true); player.playVideo(); }
  if (c.acao === 'volume') player.setVolume(c.valor);
});

setInterval(() => {
  if (!playerPronto || !idTocando || player.getPlayerState?.() !== YT_PLAYING) return;
  host.progresso({ id: idTocando, atual: player.getCurrentTime(), total: player.getDuration() });
}, 1000);

// O player nunca sai da página (senão a música para): fica sobre o espaço do Palco
// ou é levado para fora da tela nas outras abas.
function posicionarPalco() {
  const p = $('palco');
  const visivel = $('aba-fila').classList.contains('ativa') && !!est.atual;
  mostrar($('palcoVazio'), !est.atual);
  if (!visivel) { p.classList.add('fora'); return; }
  const r = $('palcoEspaco').getBoundingClientRect();
  p.classList.remove('fora');
  p.style.top = (r.top + scrollY) + 'px';
  p.style.left = (r.left + scrollX) + 'px';
  p.style.width = r.width + 'px';
  p.style.height = r.height + 'px';
}
addEventListener('resize', posicionarPalco);
if ('ResizeObserver' in window) new ResizeObserver(() => posicionarPalco()).observe(document.querySelector('main'));
$('agora').addEventListener('click', e => { if (!e.target.closest('button')) irPara('fila'); });

renderSugestoes();
host = KaraokeHost({
  transporte: transporteLocal,
  aoEstado: e => socket.disparar('estado', e),
  aoComando: c => socket.disparar('comando', c),
  aoAviso: (msg, tipo) => aviso(msg, tipo),
});
host.iniciar();
carregarConfig();
irPara(lerLocal('aba', null) || (est.atual ? 'fila' : 'buscar'));
if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});

// =============================================================
//  Karaokê — tela da TV (também é a anfitriã da sala)
// =============================================================
const $ = id => document.getElementById(id);
const YT_PLAYING = 1, YT_PAUSED = 2, YT_ENDED = 0;

let est = null;
let liberado = false;
let player = null, playerPronto = false;
let idAtual = null, notaMostrada = null, fimEnviado = null;
let timerIntro = null, timerDiscreto = null;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mostrar = (el, sim) => el.classList.toggle('oculto', !sim);

// ---------- código da sala ----------
const LETRAS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function novoCodigo() { return Array.from({ length: 5 }, () => LETRAS[Math.floor(Math.random() * LETRAS.length)]).join(''); }
let sala;
try { sala = localStorage.getItem('karaoke:sala'); } catch {}
if (!sala) { sala = novoCodigo(); try { localStorage.setItem('karaoke:sala', sala); } catch {} }

function linkControle() {
  const u = new URL('./', location.href);
  u.search = '';
  u.searchParams.set('sala', sala);
  if (Transporte.local) u.searchParams.set('local', '1');
  return u.toString();
}
function desenharQr() {
  const url = linkControle();
  try {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    $('qr').src = qr.createDataURL(8, 2);
  } catch { $('qr').alt = 'QR indisponível'; }
  $('url').textContent = url.replace(/^https?:\/\//, '').replace(/\?.*/, '');
  document.querySelectorAll('.codigo-sala').forEach(el => { el.textContent = sala; });
}
desenharQr();

// ---------- conexão + anfitrião ----------
const transporte = Transporte.host(sala, {
  aoReceber: (de, msg) => host.receber(de, msg),
  aoEntrar: id => { host.entrou(id); atualizarConectados(); },
  aoSair: id => { host.saiu(id); atualizarConectados(); },
  aoStatus: (s) => {
    const txt = {
      pronto: '● Sala aberta', reconectando: '● Reconectando…', 'sem-rede': '● Sem conexão com a internet',
      'aguardando-codigo': '● Abrindo a sala…', 'codigo-ocupado': '● Código em uso',
    }[s] || '';
    $('statusSala').textContent = txt;
    $('statusSala').className = 'status-sala ' + (s === 'pronto' ? 'ok' : 'alerta');
    if (s === 'codigo-ocupado') trocarCodigo();
  },
});

const host = KaraokeHost({
  transporte,
  aoEstado: e => aplicar(e, false),
  aoComando: executarComando,
  aoAviso: aviso,
});

function atualizarConectados() {
  const n = transporte.total();
  $('conectados').textContent = n ? `${n} celular${n > 1 ? 'es' : ''} conectado${n > 1 ? 's' : ''}` : 'Nenhum celular conectado';
}
atualizarConectados();

function trocarCodigo() {
  sala = novoCodigo();
  try { localStorage.setItem('karaoke:sala', sala); } catch {}
  location.reload();
}

// ---------- botão começar ----------
$('inicio').addEventListener('click', () => {
  liberado = true;
  mostrar($('inicio'), false);
  navigator.wakeLock?.request('screen').catch(() => {});
  if (est) aplicar(est, true);
});

// ---------- YouTube ----------
window.onYouTubeIframeAPIReady = () => {
  player = new YT.Player('yt', {
    width: '100%', height: '100%',
    playerVars: { autoplay: 1, controls: 0, rel: 0, modestbranding: 1, playsinline: 1, iv_load_policy: 3, fs: 0, disablekb: 1, hl: 'pt-BR' },
    events: {
      onReady: () => { playerPronto = true; if (est) aplicar(est, true); },
      onStateChange: aoMudarEstado,
      onError: e => host.erroNoVideo(idAtual, e.data),
    },
  });
};

function aoMudarEstado(e) {
  if (e.data === YT_PLAYING) { host.estadoDoPlayer(true); mostrar($('pausado'), false); }
  if (e.data === YT_PAUSED && !est?.exibindoNota) host.estadoDoPlayer(false);
  if (e.data === YT_ENDED && idAtual && fimEnviado !== idAtual) {
    fimEnviado = idAtual;
    host.fimDaMusica(idAtual);
  }
}

function iniciarMusica(item) {
  clearInterval(timerIntro);
  fimEnviado = null;
  $('introCantor').textContent = item.cantor;
  $('introMusica').textContent = item.titulo;
  mostrar($('intro'), true);
  mostrar($('ocioso'), false);
  if (playerPronto) player.stopVideo();
  let n = 4;
  $('introContagem').textContent = n;
  timerIntro = setInterval(() => {
    n--;
    $('introContagem').textContent = n > 0 ? n : '🎤';
    if (n <= 0) {
      clearInterval(timerIntro);
      mostrar($('intro'), false);
      mostrar($('player'), true);
      if (playerPronto) {
        player.setVolume(est?.volume ?? 80);
        player.loadVideoById({ videoId: item.videoId });
      }
      $('player').classList.remove('discreto');
      clearTimeout(timerDiscreto);
      timerDiscreto = setTimeout(() => $('player').classList.add('discreto'), 12000);
    }
  }, 1000);
}

function executarComando(c) {
  if (c.acao === 'reiniciar') { MicrofoneNota.reiniciar(); fimEnviado = null; }
  if (!playerPronto) return;
  if (c.acao === 'pausar') { player.pauseVideo(); mostrar($('pausado'), true); }
  if (c.acao === 'continuar') { player.playVideo(); mostrar($('pausado'), false); }
  if (c.acao === 'reiniciar') { player.seekTo(0, true); player.playVideo(); }
  if (c.acao === 'volume') player.setVolume(c.valor);
}

setInterval(() => {
  if (!playerPronto || !idAtual || player.getPlayerState?.() !== YT_PLAYING) return;
  host.progresso({ id: idAtual, atual: player.getCurrentTime(), total: player.getDuration() });
}, 1000);

// ---------- estado ----------
function aplicar(e, forcar) {
  est = e;
  renderOcioso();
  renderSelo();
  MicrofoneNota.novaMusica(e.exibindoNota ? null : e.atual?.id);
  if (!liberado) { renderFilaInicio(); return; }

  if (e.exibindoNota) {
    if (notaMostrada !== e.exibindoNota.item.id) {
      notaMostrada = e.exibindoNota.item.id;
      if (playerPronto) player.stopVideo();
      clearInterval(timerIntro);
      mostrar($('intro'), false);
      mostrarNota(e.exibindoNota);
    }
    return;
  }
  if (notaMostrada) { notaMostrada = null; mostrar($('nota'), false); }

  const novo = e.atual?.id || null;
  if (novo !== idAtual || forcar) {
    const mudou = novo !== idAtual;
    idAtual = novo;
    if (novo && (mudou || !playerPronto || player.getPlayerState?.() !== YT_PLAYING)) iniciarMusica(e.atual);
    if (!novo) {
      clearInterval(timerIntro);
      if (playerPronto) player.stopVideo();
      mostrar($('player'), false); mostrar($('intro'), false); mostrar($('ocioso'), true);
    }
  }
}

function renderFilaInicio() {
  const n = est?.fila?.length || 0;
  $('inicioFila').textContent = n ? `${n} música${n > 1 ? 's' : ''} esperando na fila.` : '';
}

function renderSelo() {
  const a = est?.atual;
  if (a) {
    $('selo').innerHTML = `<div class="avatar">${esc(a.cantor.trim()[0]?.toUpperCase() || '🎤')}</div>
      <div class="t"><b>${esc(a.cantor)}</b> · ${esc(a.titulo)}</div>`;
  }
  const prox = est?.fila?.[0];
  mostrar($('seguinte'), !!prox);
  if (prox) $('seguinte').innerHTML = `<small>A SEGUIR</small><div>${esc(prox.cantor)} — ${esc(prox.titulo)}</div>`;
}

function renderOcioso() {
  const fila = est?.fila || [];
  $('filaOcioso').innerHTML = fila.length
    ? fila.slice(0, 5).map((i, n) => `<li><span class="pos">${n + 1}</span><div class="info"><div class="t">${esc(i.titulo)}</div><div class="c">${esc(i.cantor)}</div></div></li>`).join('')
    : '<li class="vazio">Fila vazia — seja o primeiro!</li>';
  const hoje = new Date().toDateString();
  const top = (est?.historico || []).filter(h => h.nota != null && new Date(h.data).toDateString() === hoje)
    .sort((a, b) => b.nota - a.nota).slice(0, 5);
  $('ranking').innerHTML = top.length
    ? top.map((h, n) => `<li><span class="pos">${['🥇', '🥈', '🥉'][n] || n + 1}</span><div class="info"><div class="t">${esc(h.cantor)}</div><div class="c">${esc(h.titulo)}</div></div><span class="n">${h.nota}</span></li>`).join('')
    : '<li class="vazio">Ninguém cantou ainda hoje.</li>';
}

// ---------- tela de nota ----------
function mostrarNota(r) {
  mostrar($('player'), false);
  mostrar($('nota'), true);
  $('notaQuem').innerHTML = `<b>${esc(r.item.cantor)}</b> cantou “${esc(r.item.titulo)}”`;
  $('notaFrase').textContent = '';
  $('notaEstrelas').innerHTML = '<span>★</span>'.repeat(5);
  $('notaObs').textContent = r.semMic ? 'Nenhum microfone ativo — nota no modo divertido.' : (r.modo === 'microfone' ? 'Nota calculada pelo microfone' : '');
  const barras = $('notaBarras');
  mostrar(barras, !!r.detalhes);
  if (r.detalhes) {
    barras.innerHTML = [['Presença', r.detalhes.presenca], ['Afinação', r.detalhes.afinacao], ['Estabilidade', r.detalhes.estabilidade]]
      .map(([n, v]) => `<div class="barra">${n} <b>${v}%</b><div class="trilho"><i data-v="${v}"></i></div></div>`).join('');
  }
  const alvo = r.nota, inicio = performance.now(), dur = 2600;
  const passo = t => {
    const p = Math.min(1, (t - inicio) / dur);
    const val = Math.round(alvo * (1 - Math.pow(1 - p, 3)));
    $('notaNumero').textContent = val;
    [...$('notaEstrelas').children].forEach((s, i) => s.classList.toggle('acesa', i < Math.round(val / 20)));
    if (p < 1) requestAnimationFrame(passo);
    else {
      $('notaFrase').textContent = r.comentario;
      barras.querySelectorAll('i').forEach(i => { i.style.width = i.dataset.v + '%'; });
      if (alvo >= 85) confete();
    }
  };
  requestAnimationFrame(passo);
}

function confete() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cores = ['#ff2e93', '#22e4ff', '#ffd23f', '#3dffa2', '#b43dff'];
  for (let i = 0; i < 90; i++) {
    const c = document.createElement('i');
    c.className = 'confete';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = cores[i % cores.length];
    c.style.animationDuration = 2.5 + Math.random() * 2.5 + 's';
    c.style.animationDelay = Math.random() * .8 + 's';
    $('nota').appendChild(c);
    setTimeout(() => c.remove(), 6000);
  }
}

function aviso(msg, tipo = 'info') {
  const d = document.createElement('div');
  d.className = 'aviso ' + tipo;
  d.textContent = msg;
  $('avisos').appendChild(d);
  while ($('avisos').children.length > 3) $('avisos').firstElementChild.remove();
  setTimeout(() => d.remove(), 5000);
}

// ---------- ferramentas ----------
$('btTela').onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {});
};
$('btCodigo').onclick = () => { if ($('btCodigo').dataset.confirmar) trocarCodigo(); else { $('btCodigo').dataset.confirmar = '1'; $('btCodigo').textContent = 'Confirmar troca?'; setTimeout(() => { delete $('btCodigo').dataset.confirmar; $('btCodigo').textContent = '🔑 Novo código'; }, 4000); } };
$('btMic').onclick = async () => {
  if (MicrofoneNota.ativo()) {
    MicrofoneNota.desligar();
    $('btMic').classList.remove('ativo');
    mostrar($('nivelMic'), false);
    return;
  }
  try {
    await MicrofoneNota.ligar((tipo, dados) => host.acao(tipo, dados), nivel => { $('nivelMic').firstElementChild.style.height = nivel * 100 + '%'; });
    MicrofoneNota.novaMusica(est?.atual?.id);
    $('btMic').classList.add('ativo');
    mostrar($('nivelMic'), true);
    aviso('Microfone da TV ligado para a nota.', 'ok');
  } catch (err) { aviso(err.message, 'erro'); }
};

host.iniciar();

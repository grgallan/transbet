// =============================================================
//  Anfitrião (roda na TV): guarda fila, nota, histórico e busca.
//  Os celulares mandam comandos; a TV responde com o estado.
// =============================================================
window.KaraokeHost = function ({ transporte, aoEstado, aoComando, aoAviso }) {
  const CHAVE = 'karaoke:host';
  const CACHE_TTL = 12 * 60 * 60 * 1000;
  const TEMPO_TELA_NOTA = 9000;
  const limitar = (v, a, b) => Math.max(a, Math.min(b, v));
  const novoId = () => Math.random().toString(36).slice(2, 10);

  function carregar() {
    const padrao = {
      fila: [], atual: null, volume: 80, modoNota: 'microfone',
      historico: [], favoritos: [],
      config: { apiKey: '', sufixoBusca: 'karaoke', regiao: 'BR' },
    };
    try { const s = JSON.parse(localStorage.getItem(CHAVE)); return { ...padrao, ...s, config: { ...padrao.config, ...(s?.config || {}) } }; }
    catch { return padrao; }
  }
  const est = carregar();
  est.tocando = false;
  est.exibindoNota = null;
  if (est.atual) { est.fila.unshift(est.atual); est.atual = null; }

  let cache = {};
  try { cache = JSON.parse(localStorage.getItem('karaoke:cache')) || {}; } catch {}

  let timerSalvar;
  function salvar() {
    clearTimeout(timerSalvar);
    timerSalvar = setTimeout(() => {
      try {
        const { exibindoNota, tocando, ...resto } = est;
        localStorage.setItem(CHAVE, JSON.stringify(resto));
      } catch {}
    }, 300);
  }

  function publico() {
    return {
      fila: est.fila, atual: est.atual, tocando: est.tocando, volume: est.volume,
      modoNota: est.modoNota, exibindoNota: est.exibindoNota,
      historico: est.historico.slice(0, 100), favoritos: est.favoritos,
      temApiKey: !!est.config.apiKey, sufixoBusca: est.config.sufixoBusca,
    };
  }
  function emitir() {
    const p = publico();
    transporte.todos({ tipo: 'estado', dados: p });
    aoEstado(p);
    salvar();
  }
  function aviso(msg, tipo = 'info') {
    transporte.todos({ tipo: 'aviso', dados: { msg, tipo } });
    aoAviso(msg, tipo);
  }
  function comando(c) {
    transporte.todos({ tipo: 'comando', dados: c });
    aoComando(c);
  }

  // ---------- utilidades YouTube ----------
  function decodificarHtml(s = '') {
    const t = document.createElement('textarea');
    t.innerHTML = s;
    return t.value;
  }
  function formatarDuracao(iso) {
    const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '');
    if (!m) return '';
    const h = +(m[1] || 0), min = +(m[2] || 0), s = +(m[3] || 0);
    const ss = String(s).padStart(2, '0');
    return h ? `${h}:${String(min).padStart(2, '0')}:${ss}` : `${min}:${ss}`;
  }
  function extrairVideoId(texto = '') {
    const t = String(texto).trim();
    if (/^[\w-]{11}$/.test(t)) return t;
    const m = t.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/);
    return m ? m[1] : null;
  }
  function videoSeguro(v = {}) {
    const videoId = extrairVideoId(v.videoId);
    if (!videoId) return null;
    return {
      videoId,
      titulo: String(v.titulo || 'Vídeo do YouTube').slice(0, 200),
      canal: String(v.canal || '').slice(0, 100),
      thumb: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      duracao: String(v.duracao || '').slice(0, 12),
    };
  }

  async function ytApi(recurso, params, chave = est.config.apiKey) {
    if (!chave) throw new Error('Busca ainda não configurada. Cadastre a chave da API do YouTube em Ajustes.');
    const url = new URL('https://www.googleapis.com/youtube/v3/' + recurso);
    for (const [k, v] of Object.entries({ ...params, key: chave })) if (v) url.searchParams.set(k, v);
    let r;
    try { r = await fetch(url); } catch { throw new Error('A TV está sem internet ou o YouTube não respondeu.'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const motivo = j?.error?.errors?.[0]?.reason || '';
      let msg = j?.error?.message || `Erro ${r.status} na API do YouTube`;
      if (motivo === 'quotaExceeded') msg = 'A cota diária de buscas acabou (renova de madrugada). Enquanto isso, cole links do YouTube.';
      else if (motivo === 'keyInvalid' || /API key not valid/i.test(msg)) msg = 'Chave da API inválida. Confira em Ajustes.';
      else if (/referer|referrer/i.test(msg)) msg = 'A chave está restrita a outro site. Libere o endereço deste app nas restrições da chave.';
      throw new Error(msg);
    }
    return j;
  }

  async function buscar(q, pagina) {
    q = String(q || '').trim().slice(0, 120);
    if (!q) return { itens: [], proxima: null };
    const id = extrairVideoId(q);
    if (id && /youtu|^[\w-]{11}$/.test(q)) return { itens: [await videoPorLink(id)], proxima: null };

    const termo = `${q} ${est.config.sufixoBusca || ''}`.trim();
    const chave = `${termo.toLowerCase()}|${pagina || ''}`;
    if (cache[chave] && Date.now() - cache[chave].t < CACHE_TTL) return cache[chave].dados;

    const j = await ytApi('search', {
      part: 'snippet', type: 'video', videoEmbeddable: 'true', maxResults: 20,
      q: termo, regionCode: est.config.regiao, relevanceLanguage: 'pt', pageToken: pagina,
    });
    const ids = (j.items || []).map(i => i.id.videoId).filter(Boolean);
    const dur = {};
    if (ids.length) {
      try {
        const d = await ytApi('videos', { part: 'contentDetails', id: ids.join(',') });
        for (const it of d.items || []) dur[it.id] = formatarDuracao(it.contentDetails?.duration);
      } catch {}
    }
    const dados = {
      proxima: j.nextPageToken || null,
      itens: (j.items || []).filter(i => i.id.videoId).map(i => ({
        videoId: i.id.videoId,
        titulo: decodificarHtml(i.snippet.title),
        canal: decodificarHtml(i.snippet.channelTitle),
        thumb: `https://i.ytimg.com/vi/${i.id.videoId}/mqdefault.jpg`,
        duracao: dur[i.id.videoId] || '',
      })),
    };
    cache[chave] = { t: Date.now(), dados };
    for (const [k, v] of Object.entries(cache)) if (Date.now() - v.t > CACHE_TTL) delete cache[k];
    try { localStorage.setItem('karaoke:cache', JSON.stringify(cache)); } catch {}
    return dados;
  }

  async function videoPorLink(videoId) {
    const base = { videoId, thumb: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`, duracao: '', canal: '', titulo: 'Vídeo do YouTube' };
    if (est.config.apiKey) {
      try {
        const d = await ytApi('videos', { part: 'snippet,contentDetails', id: videoId });
        const it = d.items?.[0];
        if (it) return { ...base, titulo: decodificarHtml(it.snippet.title), canal: decodificarHtml(it.snippet.channelTitle), duracao: formatarDuracao(it.contentDetails.duration) };
      } catch {}
    }
    try {
      const r = await fetch('https://noembed.com/embed?url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + videoId));
      const j = await r.json();
      if (j.title) return { ...base, titulo: j.title, canal: j.author_name || '' };
    } catch {}
    return base;
  }

  // ---------- nota ----------
  let metricas = {};
  const COMENTARIOS = [
    [95, ['Lendário! O microfone pediu autógrafo.', 'Perfeito! Pode sair em turnê.', 'Show de bola! A casa veio abaixo.']],
    [85, ['Arrasou! A plateia foi à loucura.', 'Que voz! Pede bis.', 'Mandou muito bem!']],
    [70, ['Mandou bem! Tem futuro nos palcos.', 'Bonito de ver!', 'Boa! Mais uma dessas?']],
    [55, ['Boa tentativa! Mais um ensaio e chega lá.', 'Tá esquentando a voz!', 'Valeu pela coragem!']],
    [0, ['Coragem não faltou!', 'O importante é se divertir!', 'O chuveiro aprovou, a plateia ainda está pensando.']],
  ];
  const comentario = n => { const l = COMENTARIOS.find(([m]) => n >= m)[1]; return l[Math.floor(Math.random() * l.length)]; };

  function notaDivertida() {
    const r = Math.random();
    const nota = r < 0.06 ? 100 : r < 0.75 ? 80 + Math.floor(Math.random() * 20) : r < 0.95 ? 62 + Math.floor(Math.random() * 18) : 45 + Math.floor(Math.random() * 17);
    return { nota, modo: 'divertida', detalhes: null };
  }
  function notaMicrofone(itemId) {
    const lista = Object.values(metricas).filter(m => m.itemId === itemId && m.quadros > 40);
    if (!lista.length) return null;
    const m = lista.sort((a, b) => b.voz - a.voz)[0];
    const presenca = m.voz / m.quadros;
    const afinacao = m.afinados ? 1 - (m.somaDesvio / m.afinados) / 50 : 0;
    const estabilidade = m.afinados ? m.estaveis / m.afinados : 0;
    const pP = limitar(presenca / 0.45, 0, 1);
    const pA = limitar((afinacao - 0.45) / (0.82 - 0.45), 0, 1);
    const pE = limitar((estabilidade - 0.30) / (0.80 - 0.30), 0, 1);
    const nota = presenca < 0.05 ? Math.max(5, Math.round(presenca * 300)) : Math.round(40 + 60 * (0.35 * pP + 0.40 * pA + 0.25 * pE));
    return { nota: limitar(nota, 0, 100), modo: 'microfone', detalhes: { presenca: Math.round(pP * 100), afinacao: Math.round(pA * 100), estabilidade: Math.round(pE * 100) } };
  }

  // ---------- fila ----------
  let timerNota = null, finalizando = false;

  function proxima() {
    clearTimeout(timerNota);
    est.exibindoNota = null;
    finalizando = false;
    metricas = {};
    est.atual = est.fila.shift() || null;
    est.tocando = !!est.atual;
    emitir();
  }

  function finalizar(comNota) {
    if (!est.atual || finalizando) return;
    finalizando = true;
    const item = est.atual;
    let res = null;
    if (comNota && est.modoNota !== 'desligada') {
      res = est.modoNota === 'microfone' ? notaMicrofone(item.id) : notaDivertida();
      if (!res) { res = notaDivertida(); res.semMic = true; }
      res.comentario = comentario(res.nota);
    }
    est.historico.unshift({ ...item, nota: res?.nota ?? null, modo: res?.modo ?? null, data: Date.now() });
    est.historico = est.historico.slice(0, 300);
    if (res) {
      est.tocando = false;
      est.exibindoNota = { item, ...res };
      emitir();
      timerNota = setTimeout(proxima, TEMPO_TELA_NOTA);
    } else proxima();
  }

  // ---------- comandos (vindos de celulares ou da própria TV) ----------
  const acoes = {
    'fila:adicionar': ({ video, cantor } = {}) => {
      const v = videoSeguro(video);
      if (!v) return;
      const item = { id: novoId(), ...v, cantor: String(cantor || 'Convidado').slice(0, 40) };
      est.fila.push(item);
      aviso(`🎤 ${item.cantor} entrou na fila: ${item.titulo}`, 'ok');
      if (!est.atual && !est.exibindoNota) proxima(); else emitir();
    },
    'fila:remover': ({ id } = {}) => { est.fila = est.fila.filter(i => i.id !== id); emitir(); },
    'fila:mover': ({ id, direcao } = {}) => {
      const i = est.fila.findIndex(x => x.id === id), j = i + (direcao < 0 ? -1 : 1);
      if (i < 0 || j < 0 || j >= est.fila.length) return;
      [est.fila[i], est.fila[j]] = [est.fila[j], est.fila[i]];
      emitir();
    },
    'fila:tocarAgora': ({ id } = {}) => {
      const i = est.fila.findIndex(x => x.id === id);
      if (i < 0) return;
      est.fila.unshift(...est.fila.splice(i, 1));
      if (est.atual) finalizar(false); else proxima();
    },
    'fila:limpar': () => { est.fila = []; emitir(); },
    'player:pular': () => { if (est.exibindoNota) proxima(); else finalizar(false); },
    'player:finalizar': () => finalizar(true),
    'player:alternar': () => {
      if (!est.atual || est.exibindoNota) return;
      est.tocando = !est.tocando;
      comando({ acao: est.tocando ? 'continuar' : 'pausar' });
      emitir();
    },
    'player:reiniciar': () => {
      if (!est.atual) return;
      metricas = {};
      est.tocando = true;
      comando({ acao: 'reiniciar' });
      emitir();
    },
    'player:volume': v => {
      est.volume = limitar(Number(v) || 0, 0, 100);
      comando({ acao: 'volume', valor: est.volume });
      emitir();
    },
    'favoritos:alternar': video => {
      const v = videoSeguro(video);
      if (!v) return;
      const i = est.favoritos.findIndex(f => f.videoId === v.videoId);
      if (i >= 0) est.favoritos.splice(i, 1); else est.favoritos.unshift(v);
      emitir();
    },
    'config:modoNota': modo => { if (['microfone', 'divertida', 'desligada'].includes(modo)) { est.modoNota = modo; emitir(); } },
    'historico:limpar': () => { est.historico = []; emitir(); },
    'mic:metricas': (m, de) => {
      if (!m || !est.atual || m.itemId !== est.atual.id) return;
      metricas[de] = {
        itemId: m.itemId, quadros: +m.quadros || 0, voz: +m.voz || 0,
        afinados: +m.afinados || 0, somaDesvio: +m.somaDesvio || 0, estaveis: +m.estaveis || 0,
      };
    },
  };

  // pedidos com resposta (busca, configuração)
  const pedidos = {
    buscar: ({ q, pagina }) => buscar(q, pagina),
    'config:ler': () => ({
      temApiKey: !!est.config.apiKey,
      apiKeyMascarada: est.config.apiKey ? est.config.apiKey.slice(0, 6) + '…' + est.config.apiKey.slice(-4) : '',
      sufixoBusca: est.config.sufixoBusca,
    }),
    'config:salvar': async ({ apiKey, sufixoBusca } = {}) => {
      if (typeof sufixoBusca === 'string') est.config.sufixoBusca = sufixoBusca.trim().slice(0, 40);
      if (typeof apiKey === 'string' && apiKey.trim()) {
        const chave = apiKey.trim();
        await ytApi('videos', { part: 'id', id: 'dQw4w9WgXcQ' }, chave); // testa (1 unidade)
        est.config.apiKey = chave;
        cache = {};
      }
      emitir();
      return { ok: true };
    },
  };

  function receber(de, msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.tipo === 'pedido') {
      const fn = pedidos[msg.nome];
      if (!fn) return;
      Promise.resolve().then(() => fn(msg.dados || {}))
        .then(r => transporte.enviar(de, { tipo: 'resposta', id: msg.id, ok: true, dados: r }))
        .catch(e => transporte.enviar(de, { tipo: 'resposta', id: msg.id, ok: false, erro: e.message || 'Erro inesperado' }));
      return;
    }
    if (msg.tipo === 'progresso') return;
    const fn = acoes[msg.tipo];
    if (fn) fn(msg.dados, de);
  }

  return {
    receber,
    entrou: id => transporte.enviar(id, { tipo: 'estado', dados: publico() }),
    saiu: id => { /* métricas do microfone ficam até o fim da música */ },
    acao: (tipo, dados) => receber('tv', { tipo, dados }),
    // eventos do player da TV
    fimDaMusica: id => { if (est.atual && est.atual.id === id) finalizar(true); },
    erroNoVideo: (id, codigo) => {
      if (!est.atual || est.atual.id !== id) return;
      const t = est.atual.titulo;
      aviso([101, 150].includes(codigo) ? `"${t}" não pode ser exibida fora do YouTube. Pulando…` : `Não consegui tocar "${t}" (erro ${codigo}). Pulando…`, 'erro');
      est.historico.unshift({ ...est.atual, nota: null, erro: true, data: Date.now() });
      proxima();
    },
    estadoDoPlayer: tocando => {
      if (tocando !== est.tocando && !est.exibindoNota && est.atual) { est.tocando = tocando; emitir(); }
    },
    progresso: p => transporte.todos({ tipo: 'progresso', dados: p }),
    iniciar: () => { if (est.fila.length) proxima(); else emitir(); },
    estado: publico,
  };
};

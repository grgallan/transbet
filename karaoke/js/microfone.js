// =============================================================
//  Microfone de nota — análise de voz no próprio aparelho.
//  Mede: presença de voz, afinação (proximidade da nota mais
//  próxima da escala) e estabilidade (notas sustentadas).
//  Envia métricas acumuladas ao servidor a cada 2 s.
// =============================================================
window.MicrofoneNota = (function () {
  let ctx, analisador, fonte, stream, buffer, timerAnalise, timerEnvio;
  let enviarFn, itemId = null, aoNivel = null;
  let m = zerar();
  let pisoRuido = 0.008, ultimaMidi = null;

  function zerar() { return { quadros: 0, voz: 0, afinados: 0, somaDesvio: 0, estaveis: 0 }; }

  // Autocorrelação com refinamento parabólico (bom para voz 80–1000 Hz)
  function detectarFrequencia(buf, taxa) {
    const n = Math.min(buf.length, 1200); // janela curta = leve no celular
    let rms = 0;
    for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / n);
    const minLag = Math.floor(taxa / 1000), maxLag = Math.floor(taxa / 80);
    let melhorLag = -1, melhorCorr = 0;
    const corr = new Float32Array(maxLag + 2);
    for (let lag = minLag; lag <= maxLag + 1; lag++) {
      let soma = 0, e1 = 0, e2 = 0;
      for (let i = 0; i < n - lag; i++) {
        soma += buf[i] * buf[i + lag];
        e1 += buf[i] * buf[i];
        e2 += buf[i + lag] * buf[i + lag];
      }
      const c = soma / (Math.sqrt(e1 * e2) || 1);
      corr[lag] = c;
      if (lag <= maxLag && c > melhorCorr) { melhorCorr = c; melhorLag = lag; }
    }
    if (melhorLag < 0 || melhorCorr < 0.88) return { rms, freq: null };
    const a = corr[melhorLag - 1] || 0, b = corr[melhorLag], c = corr[melhorLag + 1] || 0;
    const ajuste = (a - c) / (2 * (a - 2 * b + c) || 1);
    return { rms, freq: taxa / (melhorLag + ajuste) };
  }

  function analisar() {
    if (!analisador || !itemId) return;
    analisador.getFloatTimeDomainData(buffer);
    const { rms, freq } = detectarFrequencia(buffer, ctx.sampleRate);
    m.quadros++;

    const ehVoz = rms > Math.max(0.012, pisoRuido * 2.5);
    if (!ehVoz) {
      pisoRuido = pisoRuido * 0.98 + rms * 0.02; // aprende o ruído ambiente
      ultimaMidi = null;
    } else {
      m.voz++;
      if (freq) {
        const midi = 69 + 12 * Math.log2(freq / 440);
        const desvio = Math.abs(midi - Math.round(midi)) * 100; // 0..50 cents
        m.afinados++;
        m.somaDesvio += desvio;
        if (ultimaMidi !== null && Math.abs(midi - ultimaMidi) * 100 < 35) m.estaveis++;
        ultimaMidi = midi;
      } else {
        ultimaMidi = null;
      }
    }
    if (aoNivel) aoNivel(Math.min(1, rms * 12), ehVoz);
  }

  function enviar() {
    if (enviarFn && itemId && m.quadros) enviarFn('mic:metricas', { itemId, ...m });
  }

  async function ligar(enviar, cbNivel) {
    if (!window.isSecureContext) throw new Error('O microfone só funciona quando o app é aberto pelo endereço https.');
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador não permite acesso ao microfone.');
    enviarFn = enviar; aoNivel = cbNivel;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
    });
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') await ctx.resume();
    fonte = ctx.createMediaStreamSource(stream);
    analisador = ctx.createAnalyser();
    analisador.fftSize = 2048;
    buffer = new Float32Array(analisador.fftSize);
    fonte.connect(analisador);
    timerAnalise = setInterval(analisar, 50);
    timerEnvio = setInterval(enviar, 2000);
  }

  function desligar() {
    clearInterval(timerAnalise); clearInterval(timerEnvio);
    stream?.getTracks().forEach(t => t.stop());
    ctx?.close().catch(() => {});
    ctx = analisador = fonte = stream = null;
    if (aoNivel) aoNivel(0, false);
  }

  // Chamado sempre que a música atual muda
  function novaMusica(id) {
    if (id === itemId) return;
    enviar();
    itemId = id || null;
    m = zerar();
    ultimaMidi = null;
  }

  function reiniciar() { m = zerar(); ultimaMidi = null; }

  return { ligar, desligar, novaMusica, reiniciar, ativo: () => !!analisador };
})();

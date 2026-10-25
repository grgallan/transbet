// =============================================================
//  Transporte: liga a TV (anfitriã) aos celulares sem servidor.
//  • Padrão: PeerJS (WebRTC) — funciona entre aparelhos diferentes.
//  • ?local=1: BroadcastChannel — abas do mesmo navegador (testes).
//  Mensagens: { tipo, dados }
// =============================================================
window.Transporte = (function () {
  const PREFIXO = 'karaoke-br-';
  const local = new URLSearchParams(location.search).has('local');

  // ---------------- ANFITRIÃO (TV) ----------------
  function host(sala, { aoReceber, aoEntrar, aoSair, aoStatus }) {
    const conexoes = new Map(); // id -> conn

    if (local) {
      const canal = new BroadcastChannel(PREFIXO + sala);
      canal.onmessage = ({ data }) => {
        if (data.para !== 'host') return;
        if (data.msg.tipo === '__ola') { conexoes.set(data.de, true); aoEntrar(data.de); return; }
        if (data.msg.tipo === '__tchau') { conexoes.delete(data.de); aoSair(data.de); return; }
        aoReceber(data.de, data.msg);
      };
      setTimeout(() => aoStatus('pronto', sala));
      return {
        enviar: (id, msg) => canal.postMessage({ de: 'host', para: id, msg }),
        todos: msg => canal.postMessage({ de: 'host', para: '*', msg }),
        total: () => conexoes.size,
      };
    }

    let peer, tentativas = 0;
    function abrir() {
      peer = new Peer(PREFIXO + sala, { debug: 0 });
      peer.on('open', () => { tentativas = 0; aoStatus('pronto', sala); });
      peer.on('connection', conn => {
        conn.on('open', () => { conexoes.set(conn.connectionId, conn); aoEntrar(conn.connectionId); });
        conn.on('data', msg => aoReceber(conn.connectionId, msg));
        const sair = () => { if (conexoes.delete(conn.connectionId)) aoSair(conn.connectionId); };
        conn.on('close', sair);
        conn.on('error', sair);
      });
      peer.on('disconnected', () => { aoStatus('reconectando'); setTimeout(() => !peer.destroyed && peer.reconnect(), 1500); });
      peer.on('error', err => {
        if (err.type === 'unavailable-id') {
          // o código ainda está preso de uma sessão anterior: espera e tenta de novo
          peer.destroy();
          if (++tentativas <= 6) { aoStatus('aguardando-codigo'); setTimeout(abrir, 4000); }
          else aoStatus('codigo-ocupado');
        } else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) {
          aoStatus('sem-rede');
          setTimeout(() => { if (peer.destroyed) abrir(); else if (peer.disconnected) peer.reconnect(); }, 4000);
        }
      });
    }
    abrir();
    const mandar = (conn, msg) => { try { if (conn.open) conn.send(msg); } catch {} };
    return {
      enviar: (id, msg) => { const c = conexoes.get(id); if (c) mandar(c, msg); },
      todos: msg => conexoes.forEach(c => mandar(c, msg)),
      total: () => conexoes.size,
    };
  }

  // ---------------- CLIENTE (celular) ----------------
  function cliente(sala, { aoReceber, aoStatus }) {
    if (local) {
      const eu = 'cel-' + Math.random().toString(36).slice(2, 8);
      const canal = new BroadcastChannel(PREFIXO + sala);
      canal.onmessage = ({ data }) => { if (data.para === eu || data.para === '*') aoReceber(data.msg); };
      const enviar = msg => canal.postMessage({ de: eu, para: 'host', msg });
      enviar({ tipo: '__ola' });
      addEventListener('pagehide', () => enviar({ tipo: '__tchau' }));
      setTimeout(() => aoStatus('conectado'));
      return { enviar };
    }

    let peer, conn = null, fila = [], timer = null;
    function conectar() {
      clearTimeout(timer);
      if (!peer || peer.destroyed) {
        peer = new Peer({ debug: 0 });
        peer.on('open', ligarNaTv);
        peer.on('disconnected', () => setTimeout(() => !peer.destroyed && peer.reconnect(), 1500));
        peer.on('error', err => {
          if (err.type === 'peer-unavailable') aoStatus('tv-ausente');
          else aoStatus('sem-rede');
          tentarDepois();
        });
      } else if (peer.open) ligarNaTv();
    }
    function ligarNaTv() {
      aoStatus('conectando');
      conn = peer.connect(PREFIXO + sala, { reliable: true });
      conn.on('open', () => {
        aoStatus('conectado');
        fila.splice(0).forEach(m => conn.send(m));
      });
      conn.on('data', aoReceber);
      conn.on('close', () => { aoStatus('desconectado'); tentarDepois(); });
    }
    function tentarDepois() { clearTimeout(timer); timer = setTimeout(conectar, 3000); }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !(conn && conn.open)) conectar();
    });
    conectar();
    return {
      enviar: msg => { if (conn && conn.open) conn.send(msg); else fila.push(msg); },
    };
  }

  return { host, cliente, local };
})();

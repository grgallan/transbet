# 🎤 Karaokê (versão online)

Funciona só com o navegador. **A TV abre um link uma vez, e todo o resto é controlado pelo celular**: busca, fila, pausar, pular, volume, nota e ajustes. Não precisa de PC nem de servidor.

```
 Celular(es) ── internet ──► TV (navegador)
 controle: busca, fila,      anfitriã da sala: toca o YouTube,
 nota, volume, ajustes       guarda fila, histórico e ranking
```

A TV gera um **código de sala** (ex.: `K7P2M`) e um QR code. Cada celular lê o QR code (ou digita o código) e passa a controlar a TV. A conexão entre os aparelhos é direta (WebRTC, com PeerJS), e a TV e os celulares podem até estar em redes diferentes.

## Publicar (grátis, uma vez só)

A pasta inteira é um site estático. Escolha uma das opções:

**Netlify Drop (mais fácil)**
1. No computador, acesse <https://app.netlify.com/drop>.
2. Arraste a pasta `karaoke-online` para a página.
3. Você recebe um endereço `https://….netlify.app`. Crie uma conta grátis para ele não expirar.

**GitHub Pages**
1. Crie um repositório e envie os arquivos desta pasta.
2. Em **Settings → Pages**, escolha a branch `main` e a pasta `/ (root)`.
3. O endereço fica `https://SEU-USUARIO.github.io/NOME-DO-REPO/`.

## Usar

1. **Na TV**: abra `https://SEU-ENDERECO/tv.html` no navegador e toque em **COMEÇAR**. Salve o endereço nos favoritos da TV.
2. **No celular**: leia o QR code da TV. Para instalar o controle como app, use *Adicionar à tela inicial*.
3. Em **Ajustes**, no celular, cadastre a chave da API do YouTube. A chave fica guardada só na TV.

O código da sala fica salvo na TV e não muda. Assim, quem já conectou uma vez entra direto da próxima vez. Para gerar outro código, use **🔑 Novo código** no canto da tela da TV.

## Chave da API do YouTube

1. Acesse <https://console.cloud.google.com/> e crie um projeto.
2. Vá em **APIs e serviços → Biblioteca**, procure **YouTube Data API v3** e clique em **Ativar**.
3. Vá em **Credenciais**, clique em **Criar credenciais** e depois em **Chave de API**.
4. **Recomendado:** em *Restrições de aplicativo*, escolha **Sites** e adicione `https://SEU-ENDERECO/*`.
5. Cole a chave em **Ajustes** no celular.

A cota grátis permite cerca de 100 buscas por dia, e buscas repetidas ficam guardadas por 12 horas. Sem a chave, ainda dá para colar links do YouTube na busca.

## Nota

- 🎙️ **Microfone**: ligue em **Ajustes → Microfone deste celular** no aparelho de quem está cantando. Como o site é https, funciona sem nenhum aviso de segurança.
- 🎲 **Divertida**: nota surpresa.
- 🚫 **Sem nota**

## Observações

- A tela da TV precisa ficar aberta, porque é ela que guarda a fila. O histórico, os favoritos e o ranking ficam salvos no navegador da TV.
- Alguns vídeos bloqueiam a reprodução fora do YouTube. Quando isso acontece, o app avisa e pula para a próxima.
- Para testar no computador sem internet entre aparelhos, abra `tv.html?local=1` e `index.html?local=1` em duas abas do mesmo navegador.

## Arquivos

```
index.html          controle do celular
tv.html             tela da TV (anfitriã da sala)
js/transporte.js    conexão TV ↔ celulares (PeerJS)
js/host.js          fila, nota, busca e histórico
js/tv.js            player do YouTube e telas
js/controle.js      interface do celular
js/microfone.js     análise da voz para a nota
```

# 🎤 Karaokê

App de karaokê que roda **inteiro no navegador do celular**. Busca, fila, nota, favoritos e ranking ficam no celular, e o vídeo vai para a **TV pelo Transmitir do YouTube** (Chromecast, Google TV ou Smart TV com o app do YouTube).

## Como usar

1. Abra o app no celular: `https://grgallan.github.io/transbet/karaoke/`. Para ter um ícone, use *Adicionar à tela inicial*.
2. Em **Ajustes**, cole a chave da API do YouTube (passo a passo abaixo).
3. Em **Buscar**, procure a música e toque em **＋**.
4. Em **Palco**, toque no ícone **Transmitir** do player e escolha a TV.
5. Controle tudo pela barra de baixo:
   - **❚❚** pausa e continua;
   - **⭐** finaliza a música e mostra a nota;
   - **⏭** pula.
   Quando uma música acaba, a próxima da fila começa sozinha.

**Se o ícone Transmitir não aparecer:** toque em *Abrir no app do YouTube* e transmita por lá. Quando a música acabar, volte ao Karaokê e toque em ⭐ para ver a nota e seguir a fila.

## Nota

- 🎙️ **Microfone**: em **Ajustes**, ligue *Usar o microfone*. O celular analisa presença de voz, afinação e estabilidade. Deixe o app aberto e perto de quem está cantando.
- 🎲 **Divertida**: nota surpresa.
- 🚫 **Sem nota**

## Chave da API do YouTube (grátis)

1. Acesse <https://console.cloud.google.com/> e crie um projeto.
2. Vá em **APIs e serviços → Biblioteca**, procure **YouTube Data API v3** e clique em **Ativar**.
3. Vá em **Credenciais**, clique em **Criar credenciais** e depois em **Chave de API**.
4. Recomendado: restrinja a chave a **Sites**, com `https://grgallan.github.io/*`.
5. Cole a chave em **Ajustes**.

A cota grátis permite cerca de 100 buscas por dia, e buscas repetidas ficam guardadas por 12 horas. Sem a chave, ainda dá para colar links do YouTube na busca.

## Arquivos

```
index.html        o app
js/app.js         telas, player e controles
js/host.js        fila, nota, histórico e busca no YouTube
js/microfone.js   análise da voz para a nota
css/              visual
```

Tudo fica salvo no próprio celular (localStorage).

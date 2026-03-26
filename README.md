# TimeFlow

Extensão para acompanhar o tempo gasto em atividades, com criação de cronometros.

## Requisitos

- Google Chrome, Microsoft Edge ou outro navegador baseado em Chromium
- Pasta do projeto disponível localmente (esta pasta do repositório)

## Como instalar a extensão (modo desenvolvedor)

1. Baixe/clone este repositório.
2. Extraia o zip que baixou do repositório.
3. Abra o navegador Chromium (Chrome ou Edge).
4. Entre na página de extensões:
	 - Chrome: `chrome://extensions`
	 - Edge: `edge://extensions`
5. Ative a opção **Modo do desenvolvedor** (Canto superior direito).
6. Clique em **Carregar sem compactacao** (ou **Load unpacked**) no canto superior esquerdo.
7. Selecione a pasta raiz deste projeto (A pasta que foi gerada dentro da pasta que foi descompactada).
8. Pronto: a extensao **TimeFlow** aparecerá na lista de extensoes.

## Como abrir e usar

1. Clique no icone da extensao na barra do navegador.
2. Crie um cronometro informando um nome e clicando em **Criar**.
3. Use os botoes para **Pausar/Retomar**, **Zerar** e **Excluir**.
4. Use a busca para filtrar cronometros.
5. Em **Configuracoes**, ajuste tema, agrupamento automatico e backup.

## Atualizando a extensao apos alteracoes no codigo

Sempre que fizer mudancas no projeto:

1. Volte para `chrome://extensions` ou `edge://extensions`.
2. Localize a extensao **TimeFlow**.
3. Clique em **Atualizar** (icone de recarregar/reload).

## Estrutura principal

- `manifest.json`: configuracao da extensao
- `popup.html`: interface do popup
- `popup.css`: estilos da interface
- `popup.js`: logica da interface e interacoes
- `background.js`: regras de funcionamento em segundo plano

## Solucao de problemas

- A extensao nao carrega:
	- Verifique se selecionou a pasta certa (a que contem `manifest.json`).
- Mudancas nao aparecem:
	- Recarregue a extensao na pagina de extensoes.
- Popup vazio ou erro:
	- Abra os detalhes da extensao e veja os erros de console para diagnostico.

# FigHeat – Guia de Publicação na Figma Community

## Passo 5: Obter o ID do Plugin

O manifest atual usa `REPLACE_WITH_YOUR_ID`. Para obter um ID real:

1. Abra o **Figma Desktop** (macOS ou Windows)
2. Vá em **Plugins** → **Development** → **Import plugin from manifest…**
3. Selecione o arquivo `figheat-plugin/manifest.json` deste projeto
4. O Figma criará o plugin em desenvolvimento
5. Em **Plugins** → **Development**, clique com o botão direito no FigHeat → **Copy plugin ID**
6. Abra `manifest.json` e substitua `REPLACE_WITH_YOUR_ID` pelo ID copiado

---

## Passo 6: Thumbnail e Screenshots

Para a publicação na Figma Community, prepare:

| Asset | Tamanho | Descrição |
|-------|---------|-----------|
| **Ícone** | 128 × 128 px | Ícone do plugin (use `src/assets/icon-128.png`) |
| **Thumbnail** | 1920 × 1080 px | Imagem principal na página do plugin |
| **Screenshots** | 3–9 imagens | Capturas mostrando upload, heatmap, A/B, export |

### Sugestões de screenshots

1. Tela de upload com instruções
2. Heatmap gerado sobre uma landing page
3. Painel Analysis Summary com TOP ELEMENTS
4. Modo A/B com duas variantes
5. Export para o canvas do Figma

Os arquivos podem ficar na pasta `publishing/` para referência antes de enviar no modal de publicação do Figma.

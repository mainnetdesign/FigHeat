# 🔧 Modo de Desenvolvimento - FigHeat

## Problema: Quota da API Gemini Esgotada

Se você está vendo o erro `Quota exceeded` da API do Google Gemini, use o **endpoint mock** para continuar desenvolvendo.

## ✅ Solução Rápida

### No Plugin Figma:

**Troque a URL da API de:**
```
http://localhost:3000
```

**Para:**
```
http://localhost:3000/api/cv/analyze-mock
```

ou simplesmente:
```
http://localhost:3000/api/cv/analyze-mock
```

## 🎯 O que o Mock faz:

- ✅ Retorna dados realistas de heatmap (40+ pontos)
- ✅ Retorna bounding boxes com labels
- ✅ Simula o tempo de processamento (~1.5s)
- ✅ Funciona SEM consumir quota da API
- ✅ Perfeito para testar:
  - Renderização do heatmap
  - Controle de intensidade
  - Export para Figma
  - Modo A/B
  - UI/UX do plugin

## 📊 Dados Mockados Incluem:

- **40+ Heatmap Points** distribuídos em:
  - Logo e header
  - Navigation menu
  - CTAs primários e secundários
  - Hero title e images
  - Produtos/mockups
  - Footer

- **8 Bounding Boxes** com labels:
  - Logo, Navigation, CTAs
  - Hero Title, Hero Image
  - Phone mockups (Before/After)

## 🔄 Quando usar cada endpoint:

| Endpoint | Quando usar | Training Mode |
|----------|-------------|---------------|
| `/api/cv/analyze` | Produção (com quota da API) | ❌ Normal |
| `/api/cv/analyze-mock` | Desenvolvimento (sem quota) | ❌ Normal |
| `/api/cv/analyze-variations` | Produção - Votação (com quota da API) | ✅ Training Mode |
| `/api/cv/analyze-variations-mock` | Desenvolvimento - Votação (sem quota) | ✅ Training Mode |

## 🗳️ Modo de Votação (Training Mode):

### Para usar MOCK no Training Mode:

**No Plugin Figma, use:**
```
http://localhost:3000/api/cv/analyze-variations-mock
```

**Ative Training Mode: ON** e você poderá:
- ✅ Gerar 2 variações (Conservative vs Creative)
- ✅ Comparar lado a lado
- ✅ Votar na melhor opção
- ✅ Sem limites de quota!

### Diferenças entre as variações mock:

**Opção A (Conservative):**
- ~15 pontos focados
- Atenção concentrada em elementos principais
- Menos exploração visual

**Opção B (Creative):**
- ~30+ pontos distribuídos
- Atenção mais exploratória
- Inclui elementos secundários (logo, menu, social proof)

## 🚀 Voltando para o modo real:

Quando a quota resetar ou você tiver uma nova API key, simplesmente volte a usar:
```
http://localhost:3000
```

Os endpoints reais serão usados automaticamente:
- `/api/cv/analyze` (normal)
- `/api/cv/analyze-variations` (training mode)

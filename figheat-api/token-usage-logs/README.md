# 📊 Token Usage Logs - FigHeat

Este diretório contém logs detalhados do uso de tokens da API do Google Gemini.

## 📁 Estrutura

- `usage.jsonl` - Logs em formato JSONL (JSON Lines)
  - Cada linha = uma requisição de análise completa
  - Formato permite append rápido e análise eficiente

## 📋 Formato do Log

Cada log contém:

```json
{
  "timestamp": "2026-01-27T20:00:00.000Z",
  "requestId": "uuid-aqui",
  "optionA": {
    "promptTokens": 1234,
    "completionTokens": 567,
    "totalTokens": 1801,
    "temperature": 0.3,
    "model": "gemini-2.0-flash",
    "promptType": "conservative",
    "estimatedCost": 0.000123
  },
  "optionB": {
    "promptTokens": 1456,
    "completionTokens": 789,
    "totalTokens": 2245,
    "temperature": 0.6,
    "model": "gemini-2.0-flash",
    "promptType": "creative",
    "estimatedCost": 0.000167
  },
  "totalCost": 0.000290,
  "imageSize": 524288,
  "executionTime": 8500
}
```

## 📊 Analisar Logs

Para analisar os logs e ver estatísticas detalhadas:

```bash
cd figheat-api
node scripts/analyze-token-usage.js
```

O script mostra:
- ✅ Resumo geral (total de requisições, tokens, custo)
- ✅ Comparação Conservative vs Creative
- ✅ Análise de tamanho de imagens
- ✅ Breakdown de custos (entrada vs saída)
- ✅ Projeções de custo
- ✅ Análises mais caras/baratas
- ✅ Histórico recente

## 💰 Preços Gemini 2.0 Flash

- **Entrada** (prompt + imagem): $0.075 por 1M tokens
- **Saída** (resposta): $0.30 por 1M tokens

## 🎯 O que consome mais tokens?

1. **Imagem** - Convertida em tokens (varia por tamanho)
2. **Prompt** - ~300-500 tokens por análise
3. **Resposta** - Estrutura JSON com heatmap + bounding boxes

## 📈 Otimizações Possíveis

### Reduzir custos:
- ✅ Comprimir imagens antes de enviar
- ✅ Usar prompts mais concisos
- ✅ Cachear análises repetidas
- ✅ Batch processing (analisar múltiplas áreas em uma chamada)

### Manter qualidade:
- ⚠️ Não reduzir muito o tamanho da imagem (perde detalhes)
- ⚠️ Prompt precisa ser específico para boa qualidade
- ⚠️ JSON structured output tem overhead mas garante consistência

## 🔒 Segurança

**IMPORTANTE:** Este diretório está no `.gitignore`!

Os logs podem conter:
- IDs de requisições
- Tamanhos de imagens
- Padrões de uso

**NÃO commite esses logs em repositórios públicos.**

## 📊 Exemplo de Saída da Análise

```
📊 ANÁLISE DE USO DE TOKENS - FigHeat

============================================================

📈 RESUMO GERAL:
   Total de requisições: 10
   Total de tokens: 45,230
   Custo total: $0.0068 USD
   Custo médio por análise: $0.000680 USD
   Tempo médio de execução: 8500ms

🎯 CONSERVATIVE (Opção A):
   Média de tokens: 2,100
   Prompt médio: 1,450 tokens
   Resposta média: 650 tokens
   Custo médio: $0.000300

🎨 CREATIVE (Opção B):
   Média de tokens: 2,400
   Prompt médio: 1,600 tokens
   Resposta média: 800 tokens
   Custo médio: $0.000380

💰 BREAKDOWN DE CUSTOS:
   Custo de entrada: $0.0048 (70.6%)
   Custo de saída: $0.0020 (29.4%)

📊 PROJEÇÕES:
   Custo para 100 análises: $0.07
   Custo para 1.000 análises: $0.68
   Custo para 10.000 análises: $6.80
```

## 🚀 Monitoramento em Tempo Real

Os logs são salvos **após cada análise** e incluem:
- Timestamp preciso
- Uso de tokens detalhado (entrada + saída)
- Custo estimado em USD
- Tempo de execução
- Tamanho da imagem

Use isso para:
- 📊 Monitorar custos em produção
- 🔍 Identificar imagens/análises caras
- 📈 Planejar budget
- ⚡ Otimizar performance

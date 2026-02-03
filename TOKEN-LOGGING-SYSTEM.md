# 📊 Sistema de Logging de Tokens - Implementado

## ✅ O que foi criado

Sistema completo de monitoramento e análise de consumo de tokens da API do Google Gemini, incluindo cálculo de custos e estatísticas detalhadas.

---

## 🎯 Funcionalidades Implementadas

### 1. **Logging Automático** ⚡
- ✅ Captura automática de uso de tokens em **cada análise**
- ✅ Salva logs em formato **JSONL** (JSON Lines)
- ✅ Não bloqueia a resposta ao usuário (async)
- ✅ Armazena em: `figheat-api/token-usage-logs/usage.jsonl`

### 2. **Dados Capturados por Requisição** 📋

Cada log contém:
```json
{
  "timestamp": "2026-01-27T20:00:00.000Z",
  "requestId": "uuid-da-requisição",
  "optionA": {
    "promptTokens": 1234,        // Tokens do prompt + imagem
    "completionTokens": 567,     // Tokens da resposta
    "totalTokens": 1801,
    "temperature": 0.3,
    "model": "gemini-2.0-flash",
    "promptType": "conservative",
    "estimatedCost": 0.000123    // USD
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
  "totalCost": 0.000290,         // Custo total em USD
  "imageSize": 524288,           // Tamanho da imagem em bytes
  "executionTime": 8500          // Tempo total em ms
}
```

### 3. **Cálculo de Custos** 💰

Sistema calcula custos automaticamente baseado nos preços atuais do Gemini 2.0 Flash:

| Tipo | Preço por 1M tokens |
|------|---------------------|
| **Entrada** (prompt + imagem) | $0.075 |
| **Saída** (resposta JSON) | $0.30 |

**Fórmula:**
```javascript
inputCost = (promptTokens / 1_000_000) * 0.075
outputCost = (completionTokens / 1_000_000) * 0.30
totalCost = inputCost + outputCost
```

### 4. **Script de Análise** 📊

Script completo que processa os logs e gera relatório detalhado:

**Comando:**
```bash
cd figheat-api
node scripts/analyze-token-usage.js
```

**O que mostra:**
- ✅ Resumo geral (requisições, tokens, custos)
- ✅ Comparação Conservative vs Creative
- ✅ Análise de tamanho de imagens
- ✅ Breakdown de custos (entrada vs saída)
- ✅ Projeções de custo (100, 1K, 10K análises)
- ✅ Análise mais cara vs mais barata
- ✅ Histórico das últimas 5 análises

---

## 🔍 Descobrindo o que consome tokens

### Breakdown típico de uma análise:

| Componente | Tokens aproximados | % do total | Custo |
|------------|-------------------|------------|-------|
| **Imagem** | 800-1500 | ~60-70% | ~$0.00006-0.00011 |
| **Prompt** | 300-500 | ~15-20% | ~$0.00002-0.00004 |
| **Resposta JSON** | 400-800 | ~15-25% | ~$0.00012-0.00024 |
| **TOTAL** | ~1500-2800 | 100% | ~$0.00020-0.00039 |

### 📌 Insights:

1. **Imagens grandes = mais tokens** 📸
   - Imagens são convertidas em tokens
   - Quanto maior a resolução, mais tokens
   - Comprimir pode reduzir ~30-50% do custo

2. **Prompt é fixo** 📝
   - ~300-500 tokens por análise
   - Otimizar texto pode economizar ~10-15%
   - Mas precisa manter qualidade

3. **Resposta varia** 💬
   - Depende de quantos elementos detectados
   - 50 pontos + 10 boxes ≈ 600 tokens
   - Structured output tem overhead

---

## 📈 Estatísticas Esperadas

### Por análise (estimativa):
- **Tokens**: 2,000-4,000 por análise completa (A + B)
- **Custo**: $0.0003-0.0006 por análise
- **Tempo**: 8-12 segundos

### Projeções de custo:

| Volume | Custo estimado |
|--------|----------------|
| 10 análises | $0.004-0.006 |
| 100 análises | $0.04-0.06 |
| 1.000 análises | $0.40-0.60 |
| 10.000 análises | $4.00-6.00 |

### 💡 Com R$ 1.904 de crédito:
- ~300.000 - 500.000 análises possíveis!
- Suficiente para todo o desenvolvimento e testes

---

## 🛠️ Arquivos Criados/Modificados

### Modificados:
```
figheat-api/
├── app/api/cv/analyze-variations/route.ts
│   ├── + Tipos: TokenUsageLog
│   ├── + Função: calculateCost()
│   ├── + Função: saveTokenUsageLog()
│   ├── + Captura de usage do generateObject
│   └── + Logs detalhados no console
└── .gitignore
    └── + Ignora /token-usage-logs/*.jsonl
```

### Criados:
```
figheat-api/
├── token-usage-logs/
│   ├── README.md                    # Documentação do sistema
│   └── usage.jsonl                  # Logs (criado automaticamente)
└── scripts/
    └── analyze-token-usage.js       # Script de análise
```

---

## 🚀 Como Usar

### 1. Fazer análises normalmente
O sistema loga automaticamente! Não precisa fazer nada.

### 2. Ver logs no console
Após cada análise, o backend mostra:
```
📊 Token Usage Summary:
   Option A: 1801 tokens (~$0.000123)
   Option B: 2245 tokens (~$0.000167)
   Total: 4046 tokens (~$0.000290)
   Execution Time: 8500ms
   Image Size: 512.00 KB
💰 Token usage logged: 0.000290 USD
```

### 3. Analisar logs acumulados
```bash
cd figheat-api
node scripts/analyze-token-usage.js
```

---

## 📊 Exemplo de Relatório

```
📊 ANÁLISE DE USO DE TOKENS - FigHeat

============================================================

📈 RESUMO GERAL:
   Total de requisições: 25
   Total de tokens: 102,450
   Custo total: $0.0154 USD
   Custo médio por análise: $0.000616 USD
   Tempo médio de execução: 8750ms

🎯 CONSERVATIVE (Opção A):
   Média de tokens: 1,950
   Prompt médio: 1,350 tokens
   Resposta média: 600 tokens
   Custo médio: $0.000285

🎨 CREATIVE (Opção B):
   Média de tokens: 2,148
   Prompt médio: 1,450 tokens
   Resposta média: 698 tokens
   Custo médio: $0.000331

🖼️  TAMANHO DE IMAGENS:
   Tamanho médio: 487.50 KB
   Menor imagem: 123.45 KB
   Maior imagem: 1024.00 KB

💰 BREAKDOWN DE CUSTOS:
   Custo de entrada (prompt + imagem): $0.0108 (70.1%)
   Custo de saída (resposta): $0.0046 (29.9%)

📊 PROJEÇÕES:
   Custo para 100 análises: $0.06
   Custo para 1.000 análises: $0.62
   Custo para 10.000 análises: $6.16
```

---

## 🎯 Otimizações Possíveis

### 💚 Reduzir custos sem perder qualidade:

1. **Comprimir imagens antes de enviar** (30-50% economia)
   ```typescript
   // Redimensionar para max 1920px mantendo aspect ratio
   // Comprimir JPEG para 80-85% quality
   ```

2. **Cachear análises idênticas** (100% economia em repetidas)
   ```typescript
   // Hash da imagem → cache resultado por 24h
   ```

3. **Batch processing** (40% economia)
   ```typescript
   // Analisar múltiplas áreas em uma única chamada
   ```

### ⚠️ Manter qualidade:

- ❌ Não reduzir muito resolução (perde detalhes UI)
- ❌ Não encurtar prompt demais (perde especificidade)
- ✅ Structured output é necessário (JSON confiável)

---

## 🔒 Segurança

### ⚠️ IMPORTANTE:
- Logs estão no `.gitignore`
- **NÃO commite** `usage.jsonl` em repositórios públicos
- Logs podem revelar padrões de uso e IDs

### ✅ Seguro commitar:
- `README.md` (documentação)
- Scripts de análise
- Estrutura de pastas

---

## 📊 Monitoramento Contínuo

### Em desenvolvimento:
- ✅ Console logs após cada análise
- ✅ Arquivo JSONL cresce incrementalmente
- ✅ Script de análise roda a qualquer momento

### Em produção:
- 📊 Integrar com dashboard de métricas
- 💰 Alertas de custo (threshold diário)
- 📈 Gráficos de evolução temporal
- 🔍 Análise de imagens problemáticas

---

## ✨ Benefícios

### Para Desenvolvimento:
- 🎯 Entender onde otimizar
- 💰 Planejar budget com dados reais
- 📊 Identificar análises caras
- ⚡ Medir impacto de mudanças

### Para Produção:
- 🚨 Detectar anomalias de custo
- 📈 Prever gastos mensais
- 🔍 Debugar problemas de performance
- 💡 Tomar decisões baseadas em dados

---

## 🎉 Status

- ✅ Sistema de logging implementado
- ✅ Cálculo de custos automático
- ✅ Script de análise criado
- ✅ Documentação completa
- ✅ GitIgnore configurado
- ✅ Sem erros de linter
- ✅ **Pronto para usar!**

---

**📝 Data:** 27 de Janeiro de 2026  
**👨‍💻 Desenvolvedor:** Codex AI Assistant  
**✅ Status:** Implementação Completa

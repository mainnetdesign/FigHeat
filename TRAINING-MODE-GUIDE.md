# 🗳️ Guia do Training Mode (Sistema de Votação)

## 🎯 O que é?

O Training Mode permite que você **ensine a IA** a gerar heatmaps do jeito que você prefere, votando em diferentes versões geradas.

---

## 🚀 Como Usar (Passo a Passo)

### 1. Abrir o Plugin no Figma
```
Plugins > Development > FigHeat
```

### 2. Ativar Training Mode
- Certifique-se que "A/B mode" está **OFF**
- Clique no botão **"🗳️ Training Mode: OFF"** para ativar
- O botão ficará: **"🗳️ Training Mode: ON"**

### 3. Fazer Upload da Imagem
- Arraste uma imagem ou clique em "Clique para enviar uma imagem"
- Formatos: PNG, JPG, WEBP

### 4. Clicar em "🗳️ Analyze & Vote"
- O backend vai gerar **2 versões diferentes** do heatmap
- **Opção A (Conservative):** Mais focada, menos pontos
- **Opção B (Creative):** Mais exploratória, mais pontos
- Aguarde ~15-30 segundos

### 5. Votar na Melhor
Você verá as duas opções lado a lado:

```
┌────────────────────────────────────────┐
│     Opção A         Opção B            │
│  (Conservative)   (Creative)           │
│                                        │
│   [imagem com     [imagem com         │
│    heatmap A]      heatmap B]         │
│                                        │
│  • 35 pontos      • 52 pontos         │
│  • 8 elementos    • 12 elementos      │
│                                        │
│  [✅ Votar em A]  [✅ Votar em B]     │
└────────────────────────────────────────┘

        [❌ Cancelar (nenhuma é boa)]
```

**Clique em "✅ Votar em A" ou "✅ Votar em B"**

### 6. Resultado do Voto
- O voto é salvo automaticamente em `/figheat-api/training-data/votes.jsonl`
- Você recebe feedback: **"✅ Voto registrado! Total: 1"**
- O heatmap da opção escolhida é aplicado à imagem

### 7. Repetir!
- Clique em "New image"
- Faça upload de outra imagem
- Vote novamente
- **Meta: 50-100 votos**

---

## 📊 Ver Progresso

### Endpoint de Estatísticas:
```
GET http://localhost:3000/api/save-vote
```

**Retorna:**
```json
{
  "totalVotes": 47,
  "optionAWins": 29,
  "optionBWins": 18,
  "percentageA": "61.7",
  "percentageB": "38.3",
  "readyForTraining": false,
  "message": "3 more votes needed"
}
```

### No navegador:
Abra: `http://localhost:3000/api/save-vote`

---

## 🎓 Depois de 50+ Votos

### 1. Exportar Dataset
Os votos estão em: `/figheat-api/training-data/votes.jsonl`

### 2. Preparar para Fine-tuning
Execute o script (que vamos criar):
```bash
cd figheat-api
python scripts/prepare-training-data.py
```

Isso gera: `training-data/gemini-dataset.jsonl`

### 3. Fazer Fine-Tuning no Gemini
Siga a documentação:
https://ai.google.dev/gemini-api/docs/model-tuning

```bash
# Upload dataset
gcloud ai models upload --dataset=gemini-dataset.jsonl

# Iniciar treinamento
gcloud ai models tune --base-model=gemini-2.0-flash

# Aguardar 2-6 horas
```

### 4. Usar Modelo Customizado
No código, mude:
```typescript
// figheat-api/app/api/cv/analyze/route.ts

// ANTES:
model: google("gemini-2.0-flash")

// DEPOIS:
model: google("tunedModels/figheat-custom-001")
```

---

## 💡 Dicas de Votação

### ✅ Boas Práticas:
- Vote com imagens **variadas** (landing pages, e-commerce, apps, dashboards)
- Seja **consistente** no que considera "bom"
- Se nenhuma opção estiver boa, clique "Cancelar"
- Tente votar em pelo menos **10 imagens diferentes**

### ❌ Evite:
- Votar aleatoriamente
- Sempre escolher a mesma opção
- Votar rápido demais sem analisar

---

## 🔍 Diferenças entre Opções

### Opção A (Conservative):
- **Foco:** Elementos principais (CTAs, headlines, hero)
- **Pontos:** 35-45
- **Temperatura:** 0.3 (mais conservadora)
- **Ideal para:** Landing pages simples, foco em conversão

### Opção B (Creative):
- **Foco:** Todos os elementos (inclui secundários)
- **Pontos:** 45-60
- **Temperatura:** 0.9 (mais criativa)
- **Ideal para:** Designs complexos, análise completa

---

## 📈 Exemplo de Workflow

```
Dia 1:
- Ative Training Mode
- Vote em 10 imagens
- Total: 10 votos

Dia 2:
- Vote em mais 15 imagens
- Total: 25 votos

Dia 3:
- Vote em mais 15 imagens
- Total: 40 votos

Dia 4:
- Vote em mais 10 imagens
- Total: 50 votos ✅
- Pronto para fine-tuning!

Semana 2:
- Prepare dataset
- Faça fine-tuning
- Use modelo customizado
- Heatmaps perfeitos! 🎉
```

---

## ❓ Perguntas Frequentes

**Q: Posso treinar sozinho?**
A: Sim! Você é o único votando.

**Q: Quanto tempo leva?**
A: ~50 votos × 30s = 25 minutos total.

**Q: E se eu votar errado?**
A: Não tem problema! A IA aprende com a maioria dos votos.

**Q: Posso adicionar mais pessoas votando?**
A: Sim! Compartilhe o plugin e todos votam no mesmo dataset.

**Q: Os dados são salvos onde?**
A: Localmente em `/figheat-api/training-data/votes.jsonl`

**Q: Precisa estar online?**
A: Não! Tudo roda local (exceto a chamada ao Gemini).

**Q: Quanto custa?**
A: Cada voto = 2 requisições ao Gemini. Com free tier você tem 1500/dia.

**Q: Posso exportar os dados?**
A: Sim! O arquivo `votes.jsonl` é seu.

---

## 🚀 Boa Votação!

Qualquer dúvida, consulte o README na pasta `training-data/`!

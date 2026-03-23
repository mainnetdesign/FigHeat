# Training Data - FigHeat

Esta pasta armazena os dados de treinamento coletados através do sistema de votação.

## 📁 Arquivos

### `votes.jsonl`
Contém todos os votos registrados. Cada linha é um JSON com:
- `id`: ID único do voto
- `timestamp`: Data/hora do voto
- `image`: Hash e dimensões da imagem analisada
- `options`: As duas opções geradas (A e B)
- `result`: Qual opção foi escolhida
- `metadata`: Informações adicionais

### Formato do voto:
```json
{
  "id": "uuid-here",
  "timestamp": 1737577200000,
  "image": {
    "hash": "sha256...",
    "dimensions": {"w": 1920, "h": 1080}
  },
  "options": {
    "A": {
      "heatmapPoints": [...],
      "boundingBoxes": [...],
      "metadata": {"type": "conservative", "temperature": 0.3}
    },
    "B": {
      "heatmapPoints": [...],
      "boundingBoxes": [...],
      "metadata": {"type": "creative", "temperature": 0.9}
    }
  },
  "result": {
    "chosen": "A",
    "rejected": "B"
  },
  "metadata": {
    "timestamp": 1737577200000
  }
}
```

## 📊 Estatísticas

Para ver as estatísticas de votação, acesse:
```
GET http://localhost:3000/api/save-vote
```

Retorna:
- Total de votos
- Votos para opção A vs B
- Percentuais
- Se está pronto para fine-tuning (>= 50 votos)

## 🎓 Fine-Tuning

### Quando fazer:
- Após coletar 50-100+ votos
- Quando a preferência estiver clara (ex: 60%+ em uma opção)

### Como preparar o dataset:

```python
# prepare-dataset.py
import json

votes = []
with open('votes.jsonl') as f:
    for line in f:
        votes.append(json.loads(line))

training_data = []
for vote in votes:
    winner = vote['options'][vote['result']['chosen']]
    
    training_data.append({
        "input": {
            "imageHash": vote['image']['hash'],
            "dimensions": vote['image']['dimensions']
        },
        "output": winner
    })

with open('gemini-dataset.jsonl', 'w') as f:
    for item in training_data:
        f.write(json.dumps(item) + '\n')
```

### Fazer fine-tuning:

Siga a documentação oficial do Gemini:
https://ai.google.dev/gemini-api/docs/model-tuning

Basicamente:
1. Upload do dataset
2. Iniciar treinamento
3. Aguardar (2-6 horas)
4. Usar modelo customizado: `tunedModels/figheat-custom-001`

## 🎯 Objetivo

O sistema de votação permite que você ensine a IA a gerar heatmaps no SEU estilo preferido.

**Quanto mais votos, melhor o modelo!** 🚀

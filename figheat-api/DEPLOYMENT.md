# FigHeat API – Guia de Deploy

Este guia descreve como hospedar o backend `figheat-api` para que o plugin funcione em produção.

---

## Opção 1: Vercel (recomendado)

### Pré-requisitos

- Conta [Vercel](https://vercel.com)
- Chave [Google AI API](https://aistudio.google.com/apikey)

### Passos

1. **Clone e instale** (se ainda não fez):
   ```bash
   cd figheat-api
   pnpm install
   ```

2. **Deploy via Vercel CLI**:
   ```bash
   pnpm add -g vercel
   vercel
   ```
   Ou conecte o repositório em [vercel.com/new](https://vercel.com/new).

3. **Configure a variável de ambiente**:
   - No dashboard da Vercel: **Project** → **Settings** → **Environment Variables**
   - Adicione: `GOOGLE_GENERATIVE_AI_API_KEY` = sua chave da Google AI

4. **Timeout** (plano Pro ou superior):
   - O `vercel.json` já define `maxDuration: 90` para a rota de análise
   - No plano **Hobby**, o limite é 10s; use imagens pequenas ou faça upgrade para Pro

5. **URL do backend**:
   - Após o deploy: `https://seu-projeto.vercel.app`
   - No plugin FigHeat: Settings → API Base URL → `https://seu-projeto.vercel.app`

---

## Opção 2: Railway

1. Crie conta em [railway.app](https://railway.app)
2. **New Project** → **Deploy from GitHub** → selecione o repositório
3. Configure o **Root Directory** como `figheat-api`
4. **Variables**: adicione `GOOGLE_GENERATIVE_AI_API_KEY`
5. **Build Command**: `pnpm install && pnpm run build`
6. **Start Command**: `pnpm start`
7. Gere um domínio público e use-o como API Base URL

---

## Opção 3: Fly.io

1. Instale o [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/)
2. Na pasta `figheat-api`:
   ```bash
   fly launch
   fly secrets set GOOGLE_GENERATIVE_AI_API_KEY=your_key
   fly deploy
   ```
3. Use a URL gerada (ex: `https://figheat-api.fly.dev`) como API Base URL

---

## Verificar se o backend está OK

```bash
curl https://SUA_URL/api/cv/analyze
# Resposta esperada: "ok" (ou erro 503 se a chave não estiver configurada)
```

---

## CORS

O backend já envia headers CORS (`Access-Control-Allow-Origin: *`) para permitir requisições do plugin Figma.

# FigHeat – Guia para Plugin Pago na Figma Community

Este guia descreve os passos necessários para publicar o FigHeat como plugin pago na Figma Community.

---

## Visão geral

Para vender plugins no Figma Community você precisa:

1. Ser **aprovado como criador** para vendas
2. **Ativar o Stripe** na sua conta Figma
3. **Publicar o plugin** com preço definido

---

## Passo 1: Aprovação como criador (Sell on Community)

1. Acesse [Figma Community](https://www.figma.com/community)
2. Vá no seu **perfil** → **Selling**
3. Solicite participar do programa **Sell on Community**
4. Aguarde a aprovação (pode levar alguns dias ou semanas)
5. Referência: [About selling Community resources](https://help.figma.com/hc/en-us/articles/12067637274519)

### Requisitos comuns para aprovação

- Conta Figma em boa situação
- Histórico de contribuições (plugins, arquivos, etc.)
- 2FA habilitado

---

## Passo 2: Ativar Stripe

1. Após aprovação, você receberá um **email de convite**
2. Acesse o seu **perfil** → **Metrics** (ou área de vendas)
3. Siga o fluxo para **ativar sua conta Stripe**
4. Referência: [Activate your Stripe account](https://help.figma.com/hc/en-us/articles/12730712101783-Activate-your-Stripe-account)

**Importante:** O Stripe está disponível em 80+ países. Se o seu país não for suportado, não será possível vender pelo sistema oficial do Figma.

---

## Passo 3: Publicar o plugin como pago

1. Abra o **Figma Desktop**
2. **Plugins** → **Development** → selecione o FigHeat
3. Clique em **Publish** (ou equivalente para plugins em desenvolvimento)
4. No modal de publicação:
   - Preencha descrição, tagline, categoria
   - Adicione thumbnail e screenshots
   - Ative **Sell this resource on Community**
   - Defina o **preço**:
     - **Pagamento único:** mínimo $2,00
     - **Assinatura mensal:** mínimo $2,00/mês
     - **Assinatura anual:** opcional, com desconto de 1–95%

### Trial

- Assinaturas têm **7 dias grátis** por padrão
- É possível ajustar o período de trial

---

## Passo 4: Configurações importantes

| Item | Observação |
|------|------------|
| **Preço inicial** | Escolha bem: depois de publicado como pago, não é possível voltar para gratuito |
| **Deslistar** | Plugins pagos podem ser deslistados, mas não "despublicados" |
| **Pagador** | Quem publica primeiro é o receptor dos pagamentos; não pode ser alterado depois |
| **Tipo de pagamento** | Escolha entre pagamento único ou assinatura; não dá para mudar depois |

---

## Checklist final

- [ ] Aprovação como criador obtida
- [ ] Conta Stripe ativada
- [ ] Plugin testado e funcionando
- [ ] Backend hospedado e acessível (ver `figheat-api/DEPLOYMENT.md`)
- [ ] API Base URL configurada no plugin (ou hardcoded para sua URL de produção)
- [ ] Thumbnail e screenshots prontos
- [ ] Descrição e tagline em inglês
- [ ] Preço definido ($2,00 mínimo)
- [ ] Período de trial decidido (se assinatura)

---

## Links úteis

- [Publish plugins to the Figma Community](https://help.figma.com/hc/en-us/articles/360042293394)
- [About selling Community resources](https://help.figma.com/hc/en-us/articles/12067637274519)
- [Activate your Stripe account](https://help.figma.com/hc/en-us/articles/12730712101783)

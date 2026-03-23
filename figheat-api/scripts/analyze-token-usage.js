// Script para analisar logs de uso de tokens
const fs = require('fs');
const path = require('path');

function analyzeTokenUsage() {
  const logsFile = path.join(__dirname, '../token-usage-logs/usage.jsonl');
  
  if (!fs.existsSync(logsFile)) {
    console.log('❌ Nenhum log encontrado ainda.');
    console.log('   Faça algumas análises primeiro!');
    return;
  }
  
  const logs = fs.readFileSync(logsFile, 'utf-8')
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
  
  if (logs.length === 0) {
    console.log('❌ Nenhum log encontrado.');
    return;
  }
  
  console.log('\n📊 ANÁLISE DE USO DE TOKENS - FigHeat\n');
  console.log('='.repeat(60));
  
  // Estatísticas gerais
  const totalRequests = logs.length;
  const totalCost = logs.reduce((sum, log) => sum + log.totalCost, 0);
  const totalTokens = logs.reduce((sum, log) => 
    sum + log.optionA.totalTokens + log.optionB.totalTokens, 0
  );
  const avgExecutionTime = logs.reduce((sum, log) => sum + log.executionTime, 0) / totalRequests;
  
  console.log(`\n📈 RESUMO GERAL:`);
  console.log(`   Total de requisições: ${totalRequests}`);
  console.log(`   Total de tokens: ${totalTokens.toLocaleString()}`);
  console.log(`   Custo total: $${totalCost.toFixed(4)} USD`);
  console.log(`   Custo médio por análise: $${(totalCost / totalRequests).toFixed(6)} USD`);
  console.log(`   Tempo médio de execução: ${avgExecutionTime.toFixed(0)}ms`);
  
  // Análise por tipo (Conservative vs Creative)
  const avgTokensA = logs.reduce((sum, log) => sum + log.optionA.totalTokens, 0) / totalRequests;
  const avgTokensB = logs.reduce((sum, log) => sum + log.optionB.totalTokens, 0) / totalRequests;
  const avgCostA = logs.reduce((sum, log) => sum + log.optionA.estimatedCost, 0) / totalRequests;
  const avgCostB = logs.reduce((sum, log) => sum + log.optionB.estimatedCost, 0) / totalRequests;
  
  console.log(`\n🎯 CONSERVATIVE (Opção A):`);
  console.log(`   Média de tokens: ${avgTokensA.toFixed(0)}`);
  console.log(`   Prompt médio: ${(logs.reduce((sum, log) => sum + log.optionA.promptTokens, 0) / totalRequests).toFixed(0)} tokens`);
  console.log(`   Resposta média: ${(logs.reduce((sum, log) => sum + log.optionA.completionTokens, 0) / totalRequests).toFixed(0)} tokens`);
  console.log(`   Custo médio: $${avgCostA.toFixed(6)}`);
  
  console.log(`\n🎨 CREATIVE (Opção B):`);
  console.log(`   Média de tokens: ${avgTokensB.toFixed(0)}`);
  console.log(`   Prompt médio: ${(logs.reduce((sum, log) => sum + log.optionB.promptTokens, 0) / totalRequests).toFixed(0)} tokens`);
  console.log(`   Resposta média: ${(logs.reduce((sum, log) => sum + log.optionB.completionTokens, 0) / totalRequests).toFixed(0)} tokens`);
  console.log(`   Custo médio: $${avgCostB.toFixed(6)}`);
  
  // Análise de tamanho de imagem
  const avgImageSize = logs.reduce((sum, log) => sum + log.imageSize, 0) / totalRequests;
  const minImageSize = Math.min(...logs.map(log => log.imageSize));
  const maxImageSize = Math.max(...logs.map(log => log.imageSize));
  
  console.log(`\n🖼️  TAMANHO DE IMAGENS:`);
  console.log(`   Tamanho médio: ${(avgImageSize / 1024).toFixed(2)} KB`);
  console.log(`   Menor imagem: ${(minImageSize / 1024).toFixed(2)} KB`);
  console.log(`   Maior imagem: ${(maxImageSize / 1024).toFixed(2)} KB`);
  
  // Breakdown de custos
  console.log(`\n💰 BREAKDOWN DE CUSTOS:`);
  const totalInputCost = logs.reduce((sum, log) => 
    sum + (log.optionA.promptTokens + log.optionB.promptTokens) / 1_000_000 * 0.075, 0
  );
  const totalOutputCost = logs.reduce((sum, log) => 
    sum + (log.optionA.completionTokens + log.optionB.completionTokens) / 1_000_000 * 0.30, 0
  );
  
  console.log(`   Custo de entrada (prompt + imagem): $${totalInputCost.toFixed(6)} (${((totalInputCost / totalCost) * 100).toFixed(1)}%)`);
  console.log(`   Custo de saída (resposta): $${totalOutputCost.toFixed(6)} (${((totalOutputCost / totalCost) * 100).toFixed(1)}%)`);
  
  // Projeções
  console.log(`\n📊 PROJEÇÕES:`);
  console.log(`   Custo para 100 análises: $${(totalCost / totalRequests * 100).toFixed(2)}`);
  console.log(`   Custo para 1.000 análises: $${(totalCost / totalRequests * 1000).toFixed(2)}`);
  console.log(`   Custo para 10.000 análises: $${(totalCost / totalRequests * 10000).toFixed(2)}`);
  
  // Requisições mais caras/baratas
  const sortedByPrice = [...logs].sort((a, b) => b.totalCost - a.totalCost);
  const mostExpensive = sortedByPrice[0];
  const cheapest = sortedByPrice[sortedByPrice.length - 1];
  
  console.log(`\n🔝 ANÁLISE MAIS CARA:`);
  console.log(`   ID: ${mostExpensive.requestId}`);
  console.log(`   Custo: $${mostExpensive.totalCost.toFixed(6)}`);
  console.log(`   Tokens: ${mostExpensive.optionA.totalTokens + mostExpensive.optionB.totalTokens}`);
  console.log(`   Imagem: ${(mostExpensive.imageSize / 1024).toFixed(2)} KB`);
  console.log(`   Tempo: ${mostExpensive.executionTime}ms`);
  
  console.log(`\n💚 ANÁLISE MAIS BARATA:`);
  console.log(`   ID: ${cheapest.requestId}`);
  console.log(`   Custo: $${cheapest.totalCost.toFixed(6)}`);
  console.log(`   Tokens: ${cheapest.optionA.totalTokens + cheapest.optionB.totalTokens}`);
  console.log(`   Imagem: ${(cheapest.imageSize / 1024).toFixed(2)} KB`);
  console.log(`   Tempo: ${cheapest.executionTime}ms`);
  
  // Últimas 5 análises
  console.log(`\n📋 ÚLTIMAS 5 ANÁLISES:`);
  const recent = logs.slice(-5).reverse();
  recent.forEach((log, idx) => {
    const date = new Date(log.timestamp);
    console.log(`   ${idx + 1}. ${date.toLocaleString('pt-BR')} - $${log.totalCost.toFixed(6)} (${log.optionA.totalTokens + log.optionB.totalTokens} tokens)`);
  });
  
  console.log('\n' + '='.repeat(60));
  console.log('');
}

// Executa análise
analyzeTokenUsage();

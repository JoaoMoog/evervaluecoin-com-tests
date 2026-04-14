/**
 * All LLM prompts are centralized here for easy tuning.
 */
export const PROMPTS = {

  SUGGEST_AGENTS: (repoContext: string): string => `
Você é um especialista em engenharia de software e automação com IA.

Analise o contexto deste repositório e sugira agentes de IA que seriam genuinamente úteis.
Foque em gaps reais detectados (falta de testes, docs, segurança, performance, etc.).
Seja específico sobre ESTE repositório — não sugira agentes genéricos.

Retorne APENAS JSON válido, sem markdown, sem texto adicional:

{
  "agents": [
    {
      "id": "string único kebab-case",
      "name": "Nome amigável em português",
      "emoji": "emoji representativo",
      "description": "O que ele faz em 1 frase simples",
      "why": "Por que foi sugerido para ESTE repo especificamente",
      "matchScore": 0,
      "trigger": "file_save | on_pr | manual | scheduled",
      "triggerDetail": "detalhes do trigger (ex: src/**/*.ts)",
      "skills": ["read-file", "write-file", "run-terminal"],
      "modelPreference": "gpt-4o-mini | gpt-4o",
      "promptTemplate": "System prompt sugerido em português",
      "config": {}
    }
  ]
}

Sugira entre 3 e 6 agentes. Priorize os de maior impacto real.

CONTEXTO DO REPOSITÓRIO:
${repoContext}
`.trim(),

  RUN_AGENT: (systemPrompt: string, task: string, context: string): { system: string; user: string } => ({
    system: systemPrompt,
    user: `
TAREFA: ${task}

CONTEXTO DO ARQUIVO/FUNÇÃO:
${context}

Responda de forma objetiva e direta. Se for gerar código, gere apenas o código necessário.
Use blocos de código com o caminho do arquivo no comentário inicial:
\`\`\`typescript
// path/to/file.ts
<código aqui>
\`\`\`
`.trim()
  }),

  EXPLAIN_ERROR: (error: string, file: string): string => `
Explique este erro de forma simples para um desenvolvedor:
Arquivo: ${file}
Erro: ${error}
Sugira como corrigir em no máximo 3 passos.
`.trim(),

  REVIEW_CODE: (code: string, file: string): string => `
Faça um code review objetivo do seguinte código.
Arquivo: ${file}

Pontue:
1. Bugs potenciais
2. Problemas de performance
3. Violações de boas práticas
4. Sugestões de melhoria

Seja conciso — no máximo 10 pontos.

\`\`\`
${code}
\`\`\`
`.trim(),
}

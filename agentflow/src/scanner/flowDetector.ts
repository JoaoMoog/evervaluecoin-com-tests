import * as path from 'path'
import { FunctionInfo, RouteInfo, ModelInfo } from './types'

export interface FlowInfo {
  domain: string          // machine id: 'payments'
  label: string           // display: 'Pagamentos'
  emoji: string
  files: string[]         // relative paths belonging to this flow
  functions: string[]     // function names in this flow
  routes: RouteInfo[]
  models: string[]
  agentSuggestions: FlowAgentSuggestion[]
}

export interface FlowAgentSuggestion {
  id: string
  name: string
  emoji: string
  description: string
  goalType: 'test' | 'security' | 'docs' | 'review' | 'custom'
}

// Domain heuristics: keyword → { domain, label, emoji }
const DOMAIN_RULES: Array<{
  keywords: RegExp
  domain: string
  label: string
  emoji: string
  agents: Omit<FlowAgentSuggestion, 'id'>[]
}> = [
  {
    keywords: /payment|checkout|stripe|pix|boleto|invoice|billing|cart|order|transaction|refund/i,
    domain: 'payments',
    label: 'Pagamentos',
    emoji: '💳',
    agents: [
      { name: 'Revisor de Segurança Financeira', emoji: '🛡', description: 'Detecta vazamentos de dados sensíveis e falhas em validações de pagamento', goalType: 'security' },
      { name: 'Gerador de Testes de Pagamento', emoji: '🧪', description: 'Cria testes Jest cobrindo fluxos de sucesso, falha e edge cases financeiros', goalType: 'test' },
    ],
  },
  {
    keywords: /auth|login|logout|signup|register|password|token|jwt|session|oauth|credential|permission|role/i,
    domain: 'auth',
    label: 'Autenticação',
    emoji: '🔐',
    agents: [
      { name: 'Auditor de Segurança de Auth', emoji: '🔒', description: 'Verifica vulnerabilidades em fluxos de autenticação e autorização', goalType: 'security' },
      { name: 'Documentador de Fluxo de Auth', emoji: '📝', description: 'Gera documentação clara do fluxo de autenticação para o time', goalType: 'docs' },
    ],
  },
  {
    keywords: /user|profile|account|member|customer|client|contact/i,
    domain: 'users',
    label: 'Usuários',
    emoji: '👤',
    agents: [
      { name: 'Gerador de Testes de Usuário', emoji: '🧪', description: 'Cria testes para operações CRUD de usuário', goalType: 'test' },
      { name: 'Revisor de LGPD', emoji: '🛡', description: 'Verifica conformidade com LGPD em dados pessoais tratados', goalType: 'security' },
    ],
  },
  {
    keywords: /notification|email|sms|push|webhook|event|message|alert/i,
    domain: 'notifications',
    label: 'Notificações',
    emoji: '🔔',
    agents: [
      { name: 'Revisor de Entregabilidade', emoji: '📬', description: 'Verifica tratamento de erros e retentativas em envio de notificações', goalType: 'review' },
      { name: 'Documentador de Eventos', emoji: '📋', description: 'Documenta os eventos e payloads disparados pelo sistema', goalType: 'docs' },
    ],
  },
  {
    keywords: /product|catalog|inventory|stock|item|sku|price|discount/i,
    domain: 'catalog',
    label: 'Catálogo',
    emoji: '📦',
    agents: [
      { name: 'Gerador de Testes de Catálogo', emoji: '🧪', description: 'Testa operações de produto, preço e estoque', goalType: 'test' },
    ],
  },
  {
    keywords: /report|analytics|metric|dashboard|chart|stat|insight/i,
    domain: 'analytics',
    label: 'Relatórios',
    emoji: '📊',
    agents: [
      { name: 'Revisor de Performance de Queries', emoji: '⚡', description: 'Detecta N+1 queries e consultas lentas em relatórios', goalType: 'review' },
    ],
  },
  {
    keywords: /upload|file|storage|s3|bucket|media|image|video|document/i,
    domain: 'storage',
    label: 'Arquivos',
    emoji: '📁',
    agents: [
      { name: 'Revisor de Segurança de Upload', emoji: '🛡', description: 'Verifica validações de tipo e tamanho de arquivo e proteções contra path traversal', goalType: 'security' },
    ],
  },
  {
    keywords: /api|route|controller|endpoint|handler|middleware|request|response/i,
    domain: 'api',
    label: 'API / Rotas',
    emoji: '🌐',
    agents: [
      { name: 'Gerador de Documentação OpenAPI', emoji: '📋', description: 'Gera documentação Swagger/OpenAPI a partir dos handlers detectados', goalType: 'docs' },
      { name: 'Gerador de Testes de Integração', emoji: '🧪', description: 'Cria testes de integração para os endpoints da API', goalType: 'test' },
    ],
  },
  {
    keywords: /test|spec|mock|fixture|factory|stub|fake/i,
    domain: 'testing',
    label: 'Testes',
    emoji: '🧪',
    agents: [
      { name: 'Revisor de Qualidade de Testes', emoji: '🔍', description: 'Analisa os testes existentes e sugere melhorias de cobertura e legibilidade', goalType: 'review' },
    ],
  },
]

/**
 * Groups repository files and functions into business-domain flows
 * using heuristic keyword matching on file paths and function names.
 */
export function detectFlows(
  functions: FunctionInfo[],
  routes: RouteInfo[],
  models: ModelInfo[],
): FlowInfo[] {
  const flowMap = new Map<string, FlowInfo>()

  const allItems: Array<{ text: string; file: string; name?: string }> = [
    ...functions.map(f => ({ text: f.file + ' ' + f.name, file: f.file, name: f.name })),
    ...routes.map(r => ({ text: r.file + ' ' + r.path + ' ' + r.handler, file: r.file })),
    ...models.map(m => ({ text: m.file + ' ' + m.name, file: m.file, name: m.name })),
  ]

  for (const item of allItems) {
    const domainSegment = getDomainFromPath(item.file) + ' ' + (item.name ?? '')
    const searchText = item.text + ' ' + domainSegment

    for (const rule of DOMAIN_RULES) {
      if (!rule.keywords.test(searchText)) continue

      let flow = flowMap.get(rule.domain)
      if (!flow) {
        flow = {
          domain: rule.domain,
          label: rule.label,
          emoji: rule.emoji,
          files: [],
          functions: [],
          routes: [],
          models: [],
          agentSuggestions: rule.agents.map((a, i) => ({
            ...a,
            id: `${rule.domain}-${a.goalType}-${i}`,
          })),
        }
        flowMap.set(rule.domain, flow)
      }

      if (!flow.files.includes(item.file)) flow.files.push(item.file)
      if (item.name && !flow.functions.includes(item.name)) flow.functions.push(item.name)
    }
  }

  // Attach routes and models to matching flows
  for (const route of routes) {
    for (const [, flow] of flowMap) {
      if (flow.files.includes(route.file)) {
        if (!flow.routes.find(r => r.path === route.path && r.method === route.method)) {
          flow.routes.push(route)
        }
      }
    }
  }

  for (const model of models) {
    for (const [, flow] of flowMap) {
      if (flow.files.includes(model.file)) {
        if (!flow.models.includes(model.name)) flow.models.push(model.name)
      }
    }
  }

  // Sort by number of files (most relevant first)
  return Array.from(flowMap.values())
    .sort((a, b) => b.files.length - a.files.length)
    .slice(0, 8)
}

function getDomainFromPath(filePath: string): string {
  // Extract meaningful directory segments: src/payments/checkout.ts → 'payments checkout'
  return filePath
    .split(/[/\\]/)
    .filter(seg => !['src', 'lib', 'app', 'dist', 'index', 'main'].includes(seg))
    .join(' ')
    .replace(/\.\w+$/, '')
}

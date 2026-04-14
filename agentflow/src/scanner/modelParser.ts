import { ModelInfo } from './types'

// Prisma: model User { ... }
const PRISMA_MODEL_RE = /^model\s+(\w+)\s*\{([^}]+)\}/gm

// TypeORM: @Entity() class User ...
const TYPEORM_ENTITY_RE = /@Entity\s*\([^)]*\)\s*(?:export\s+)?class\s+(\w+)/g
const TYPEORM_COLUMN_RE = /@Column[^)]*\)\s*(?:\w+\??:\s*\w+\s+)?(\w+)\s*[!?]?\s*:/g

// Mongoose: const UserSchema = new Schema({ ... })
const MONGOOSE_SCHEMA_RE = /(?:const|let)\s+(\w+)Schema\s*=\s*new\s+(?:mongoose\.)?Schema\s*\(\s*\{([^}]+)\}/gs

// Sequelize: class User extends Model { ... }
const SEQUELIZE_MODEL_RE = /class\s+(\w+)\s+extends\s+Model/g

/**
 * Parses ORM model definitions from source files.
 */
export function parseModels(content: string, filePath: string): ModelInfo[] {
  const results: ModelInfo[] = []

  // Detect ORM type from file content
  const isPrisma = filePath.endsWith('.prisma') || content.includes('datasource ')
  const isTypeORM = content.includes('@Entity') || content.includes('typeorm')
  const isMongoose = content.includes('mongoose') || content.includes('new Schema(')
  const isSequelize = content.includes('extends Model') && content.includes('sequelize')

  if (isPrisma) {
    let match: RegExpExecArray | null
    const re = new RegExp(PRISMA_MODEL_RE.source, 'gm')
    while ((match = re.exec(content)) !== null) {
      const name = match[1]
      const body = match[2]
      results.push({
        name,
        file: filePath,
        orm: 'prisma',
        fields: extractPrismaFields(body),
      })
    }
  }

  if (isTypeORM) {
    let match: RegExpExecArray | null
    const re = new RegExp(TYPEORM_ENTITY_RE.source, 'g')
    while ((match = re.exec(content)) !== null) {
      const name = match[1]
      results.push({
        name,
        file: filePath,
        orm: 'typeorm',
        fields: extractTypeORMFields(content),
      })
    }
  }

  if (isMongoose) {
    let match: RegExpExecArray | null
    const re = new RegExp(MONGOOSE_SCHEMA_RE.source, 'gs')
    while ((match = re.exec(content)) !== null) {
      const name = match[1]
      const body = match[2]
      results.push({
        name,
        file: filePath,
        orm: 'mongoose',
        fields: extractMongooseFields(body),
      })
    }
  }

  if (isSequelize) {
    let match: RegExpExecArray | null
    const re = new RegExp(SEQUELIZE_MODEL_RE.source, 'g')
    while ((match = re.exec(content)) !== null) {
      results.push({
        name: match[1],
        file: filePath,
        orm: 'sequelize',
        fields: [],
      })
    }
  }

  return results
}

function extractPrismaFields(body: string): string[] {
  return body
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('//') && !l.startsWith('@') && !l.startsWith('?'))
    .map(l => l.split(/\s+/)[0])
    .filter(f => f && /^[a-zA-Z]/.test(f))
    .slice(0, 10)
}

function extractTypeORMFields(content: string): string[] {
  const fields: string[] = []
  let match: RegExpExecArray | null
  const re = new RegExp(TYPEORM_COLUMN_RE.source, 'g')
  while ((match = re.exec(content)) !== null) {
    fields.push(match[1])
  }
  return fields.slice(0, 10)
}

function extractMongooseFields(body: string): string[] {
  const fieldRe = /(\w+)\s*:/g
  const fields: string[] = []
  let match: RegExpExecArray | null
  while ((match = fieldRe.exec(body)) !== null) {
    if (!['type', 'default', 'required', 'ref', 'enum', 'min', 'max'].includes(match[1])) {
      fields.push(match[1])
    }
  }
  return [...new Set(fields)].slice(0, 10)
}

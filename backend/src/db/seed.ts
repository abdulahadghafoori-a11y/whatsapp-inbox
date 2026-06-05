import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db } from './index.js'
import { teamMembers } from './schema.js'
import { BCRYPT_ROUNDS } from '../utils/bcrypt.js'

const DEFAULT_PASSWORD = process.env.SEED_PASSWORD ?? 'password123'

const seedMembers = [
  { name: 'Admin', email: 'admin@example.com', role: 'admin' as const },
  { name: 'Agent One', email: 'agent1@example.com', role: 'agent' as const },
  { name: 'Agent Two', email: 'agent2@example.com', role: 'agent' as const },
  { name: 'Agent Three', email: 'agent3@example.com', role: 'agent' as const },
  { name: 'Agent Four', email: 'agent4@example.com', role: 'agent' as const },
]

async function main() {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS)

  for (const m of seedMembers) {
    const existing = await db.query.teamMembers.findFirst({
      where: eq(teamMembers.email, m.email),
    })
    if (existing) {
      console.log(`skip (exists): ${m.email}`)
      continue
    }
    await db.insert(teamMembers).values({
      name: m.name,
      email: m.email,
      passwordHash,
      role: m.role,
      isOnline: false,
    })
    console.log(`created ${m.role}: ${m.email}`)
  }

  // AI agent (no password; cannot log in).
  const aiEmail = 'ai-agent@system.local'
  const aiExisting = await db.query.teamMembers.findFirst({
    where: eq(teamMembers.email, aiEmail),
  })
  if (!aiExisting) {
    await db.insert(teamMembers).values({
      name: 'AI Assistant',
      email: aiEmail,
      passwordHash: null,
      role: 'ai_agent',
      agentConfig: {
        model: 'claude-haiku-4-5-20251001',
        systemPrompt:
          'You are a friendly sales assistant for our business. Answer questions about products, pricing, and availability concisely. Be warm and helpful.',
        temperature: 0.7,
      },
    })
    console.log(`created ai_agent: ${aiEmail}`)
  } else {
    console.log(`skip (exists): ${aiEmail}`)
  }

  console.log(`\nDone. Default password for human accounts: ${DEFAULT_PASSWORD}`)
  process.exit(0)
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})

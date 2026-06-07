import { relations, sql } from 'drizzle-orm'
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  boolean,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

export const teamMembers = pgTable(
  'team_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    email: text('email').unique().notNull(),
    // Nullable: ai_agent rows do not log in.
    passwordHash: text('password_hash'),
    avatarUrl: text('avatar_url'),
    role: text('role').notNull().default('agent'), // admin | agent | ai_agent
    agentConfig: jsonb('agent_config'), // ai_agent: { model, systemPrompt, temperature }
    isOnline: boolean('is_online').notNull().default(false),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    expoPushToken: text('expo_push_token'),
    tokenRevokedAt: timestamp('token_revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    agentOnlineIdx: index('idx_team_members_agent_online')
      .on(t.isOnline)
      .where(sql`${t.role} = 'agent'`),
  }),
)

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teamMemberId: uuid('team_member_id')
      .references(() => teamMembers.id, { onDelete: 'cascade' })
      .notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    memberIdx: index('idx_refresh_tokens_member').on(t.teamMemberId),
    tokenHashIdx: index('idx_refresh_tokens_token_hash').on(t.tokenHash),
  }),
)

export const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  waId: text('wa_id').unique().notNull(),
  name: text('name'),
  profilePictureUrl: text('profile_picture_url'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .references(() => contacts.id, { onDelete: 'cascade' })
      .notNull(),
    assignedTo: uuid('assigned_to').references(() => teamMembers.id, {
      onDelete: 'set null',
    }),
    status: text('status').notNull().default('open'), // open | resolved | pending
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    lastMessagePreview: text('last_message_preview'),
    lastMessageId: uuid('last_message_id'),
    lastMessageDirection: text('last_message_direction'),
    lastMessageStatus: text('last_message_status'),
    lastMessageType: text('last_message_type'),
    pinnedAt: timestamp('pinned_at', { withTimezone: true }),
    windowExpiresAt: timestamp('window_expires_at', { withTimezone: true }),
    /** First inbound message from a CTWA / referral ad (starts 24h reply deadline for FEP). */
    ctwaStartedAt: timestamp('ctwa_started_at', { withTimezone: true }),
    /** Free entry point window end (72h from first business reply within 24h of CTWA start). */
    fepExpiresAt: timestamp('fep_expires_at', { withTimezone: true }),
    unreadCount: integer('unread_count').notNull().default(0),
    snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),

    // CTWA attribution (first-touch only)
    ctwaClid: text('ctwa_clid'),
    referralSourceUrl: text('referral_source_url'),
    referralSourceType: text('referral_source_type'), // ad | post
    adId: text('ad_id'), // referral.source_id
    adTitle: text('ad_title'), // referral.headline
    adBody: text('ad_body'), // referral.body
    referralMetadata: jsonb('referral_metadata'), // image_url, media_type, welcome_message...

    // Handoff / routing
    handoffRequestedAt: timestamp('handoff_requested_at', { withTimezone: true }),
    handoffReason: text('handoff_reason'),
    aiHandled: boolean('ai_handled').notNull().default(false),
    routingLock: text('routing_lock'), // human_only | null

    // Internal notes (never sent to the customer)
    notes: text('notes'),

    // SLA tracking
    /** First outbound (business) reply timestamp — for first-response-time metrics. */
    firstResponseAt: timestamp('first_response_at', { withTimezone: true }),
    /** When the conversation was last marked resolved. */
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),

    /** Soft delete — hidden from the inbox but retained for audit/restore. */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // One conversation per contact, ever (reopen-on-return model).
    contactUnique: uniqueIndex('uq_conversations_contact').on(t.contactId),
    statusIdx: index('idx_conversations_status').on(t.status),
    assignedToIdx: index('idx_conversations_assigned_to').on(t.assignedTo),
    lastMessageAtIdx: index('idx_conversations_last_message_at').on(t.lastMessageAt),
    inboxIdx: index('idx_conversations_inbox').on(
      t.assignedTo,
      t.status,
      t.lastMessageAt,
    ),
  }),
)

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .references(() => conversations.id, { onDelete: 'cascade' })
      .notNull(),
    waMessageId: text('wa_message_id').unique(),
    sentBy: uuid('sent_by').references(() => teamMembers.id, { onDelete: 'set null' }),
    direction: text('direction').notNull(), // inbound | outbound
    type: text('type').notNull(), // text | image | video | audio | document | sticker
    body: text('body'),
    mediaUrl: text('media_url'), // S3 key, NOT a full URL
    mediaMimeType: text('media_mime_type'),
    mediaFilename: text('media_filename'),
    mediaStatus: text('media_status'), // pending | uploaded | failed
    status: text('status').notNull().default('sent'), // sent | delivered | read | failed
    errorMessage: text('error_message'),
    replyToMessageId: uuid('reply_to_message_id'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    metadata: jsonb('metadata'),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    conversationIdx: index('idx_messages_conversation_id').on(t.conversationId),
    sentAtIdx: index('idx_messages_sent_at').on(t.sentAt),
    conversationSentAtIdx: index('idx_messages_conversation_sent_at').on(
      t.conversationId,
      t.sentAt,
    ),
    waMessageIdIdx: index('idx_messages_wa_message_id').on(t.waMessageId),
    mediaUrlIdx: index('idx_messages_media_url')
      .on(t.mediaUrl)
      .where(sql`${t.mediaUrl} is not null`),
  }),
)

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    status: text('status').notNull().default('pending'), // pending | processing | done | failed
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: text('locked_by'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusRetryIdx: index('idx_jobs_status_next_retry').on(t.status, t.nextRetryAt),
    statusCreatedIdx: index('idx_jobs_status_created').on(t.status, t.createdAt),
  }),
)

// Lightweight audit trail for assignment / resolution / handoff actions.
/** Durable webhook inbox: persist before Meta 200 ack so crashes can replay. */
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rawPayload: jsonb('raw_payload').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    error: text('error'),
  },
  (t) => ({
    receivedAtIdx: index('idx_webhook_events_received_at').on(t.receivedAt),
    unprocessedIdx: index('idx_webhook_events_unprocessed')
      .on(t.processedAt)
      .where(sql`${t.processedAt} is null`),
  }),
)

export const conversationEvents = pgTable(
  'conversation_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .references(() => conversations.id, { onDelete: 'cascade' })
      .notNull(),
    actorId: uuid('actor_id').references(() => teamMembers.id, { onDelete: 'set null' }),
    type: text('type').notNull(), // assigned | resolved | reopened | handoff | note_updated
    payload: jsonb('payload'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    conversationIdx: index('idx_conversation_events_conversation').on(t.conversationId),
  }),
)

export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').unique().notNull(),
  color: text('color'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const conversationTags = pgTable(
  'conversation_tags',
  {
    conversationId: uuid('conversation_id')
      .references(() => conversations.id, { onDelete: 'cascade' })
      .notNull(),
    tagId: uuid('tag_id')
      .references(() => tags.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: uniqueIndex('uq_conversation_tags').on(t.conversationId, t.tagId),
    tagIdx: index('idx_conversation_tags_tag').on(t.tagId),
  }),
)

/** Reusable canned responses / macros agents can insert into the composer. */
export const cannedResponses = pgTable(
  'canned_responses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    shortcut: text('shortcut'),
    createdBy: uuid('created_by').references(() => teamMembers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    shortcutIdx: index('idx_canned_responses_shortcut').on(t.shortcut),
  }),
)

export const contactsRelations = relations(contacts, ({ many }) => ({
  conversations: many(conversations),
}))

export const tagsRelations = relations(tags, ({ many }) => ({
  conversationTags: many(conversationTags),
}))

export const conversationTagsRelations = relations(conversationTags, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationTags.conversationId],
    references: [conversations.id],
  }),
  tag: one(tags, {
    fields: [conversationTags.tagId],
    references: [tags.id],
  }),
}))

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  contact: one(contacts, {
    fields: [conversations.contactId],
    references: [contacts.id],
  }),
  assignedAgent: one(teamMembers, {
    fields: [conversations.assignedTo],
    references: [teamMembers.id],
  }),
  messages: many(messages),
}))

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(teamMembers, {
    fields: [messages.sentBy],
    references: [teamMembers.id],
  }),
}))

export const teamMembersRelations = relations(teamMembers, ({ many }) => ({
  conversations: many(conversations),
}))

export type TeamMember = typeof teamMembers.$inferSelect
export type NewTeamMember = typeof teamMembers.$inferInsert
export type Contact = typeof contacts.$inferSelect
export type Conversation = typeof conversations.$inferSelect
export type Message = typeof messages.$inferSelect
export type NewMessage = typeof messages.$inferInsert
export type Job = typeof jobs.$inferSelect
export type RefreshToken = typeof refreshTokens.$inferSelect
export type Tag = typeof tags.$inferSelect
export type CannedResponse = typeof cannedResponses.$inferSelect

export interface AgentConfig {
  model: string
  systemPrompt: string
  temperature: number
}

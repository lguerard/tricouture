import {
	pgTable,
	pgEnum,
	uuid,
	text,
	varchar,
	integer,
	real,
	boolean,
	timestamp,
	date,
	jsonb,
	vector,
	index,
	uniqueIndex
} from 'drizzle-orm/pg-core';

/* ------------------------------------------------------------------ */
/* Enums                                                              */
/* ------------------------------------------------------------------ */

export const craft = pgEnum('craft', ['couture', 'tricot', 'crochet']);
export const projectStatus = pgEnum('project_status', ['idee', 'monte', 'bloque', 'fini']);
export const toolType = pgEnum('tool_type', [
	'aiguille_droite',
	'aiguille_circulaire',
	'aiguille_double_pointe',
	'crochet',
	'autre'
]);

/* ------------------------------------------------------------------ */
/* Auth                                                               */
/* ------------------------------------------------------------------ */

export const users = pgTable('users', {
	id: uuid('id').primaryKey().defaultRandom(),
	email: varchar('email', { length: 255 }).notNull().unique(),
	displayName: varchar('display_name', { length: 120 }).notNull(),
	passwordHash: text('password_hash').notNull(),
	isAdmin: boolean('is_admin').notNull().default(false),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const sessions = pgTable('sessions', {
	id: text('id').primaryKey(), // opaque token (hashed)
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

/* ------------------------------------------------------------------ */
/* Patterns                                                           */
/* ------------------------------------------------------------------ */

export const patterns = pgTable(
	'patterns',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		ownerId: uuid('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		title: varchar('title', { length: 255 }).notNull(),
		craft: craft('craft').notNull(),
		garmentType: varchar('garment_type', { length: 120 }), // sweater, sock, dress...
		designer: varchar('designer', { length: 160 }),
		source: varchar('source', { length: 255 }), // Ravelry, magazine, URL...
		language: varchar('language', { length: 16 }), // fr, en, ja...
		difficulty: integer('difficulty'), // 1-5
		sizes: text('sizes'), // free-text available sizes
		gaugeStitches: real('gauge_stitches'), // stitches / 10cm
		gaugeRows: real('gauge_rows'), // rows / 10cm
		yardageRequired: integer('yardage_required'), // meters required
		tags: jsonb('tags').$type<string[]>().notNull().default([]),
		notes: text('notes'),
		isShared: boolean('is_shared').notNull().default(false),
		extractedText: text('extracted_text'), // PDF text for FTS
		embedding: vector('embedding', { dimensions: 768 }), // semantic search (phase 3)
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({
		ownerIdx: index('patterns_owner_idx').on(t.ownerId),
		craftIdx: index('patterns_craft_idx').on(t.craft)
	})
);

export const patternFiles = pgTable(
	'pattern_files',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		patternId: uuid('pattern_id')
			.notNull()
			.references(() => patterns.id, { onDelete: 'cascade' }),
		filename: varchar('filename', { length: 255 }).notNull(),
		storedPath: text('stored_path').notNull(), // relative to MEDIA_DIR
		mimeType: varchar('mime_type', { length: 120 }).notNull(),
		sizeBytes: integer('size_bytes').notNull(),
		isPrimary: boolean('is_primary').notNull().default(false),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({
		patternIdx: index('pattern_files_pattern_idx').on(t.patternId)
	})
);

/* ------------------------------------------------------------------ */
/* Stash                                                              */
/* ------------------------------------------------------------------ */

export const yarns = pgTable(
	'yarns',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		ownerId: uuid('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		brand: varchar('brand', { length: 160 }),
		name: varchar('name', { length: 160 }),
		colorway: varchar('colorway', { length: 160 }),
		colorHex: varchar('color_hex', { length: 7 }),
		dyeLot: varchar('dye_lot', { length: 80 }), // dye lot number
		weightCategory: varchar('weight_category', { length: 40 }), // fingering, worsted...
		fiber: varchar('fiber', { length: 160 }), // e.g. 100% merino wool
		yardsPerSkein: integer('yards_per_skein'), // meters per skein
		gramsPerSkein: integer('grams_per_skein'),
		skeins: real('skeins').notNull().default(1), // quantity (skeins)
		photoPath: text('photo_path'),
		binId: uuid('bin_id'),
		notes: text('notes'),
		embedding: vector('embedding', { dimensions: 768 }), // color/texture search (phase 4)
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({ ownerIdx: index('yarns_owner_idx').on(t.ownerId) })
);

export const fabrics = pgTable(
	'fabrics',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		ownerId: uuid('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: varchar('name', { length: 160 }),
		fabricType: varchar('fabric_type', { length: 120 }), // jersey, cotton, linen...
		composition: varchar('composition', { length: 160 }),
		colorHex: varchar('color_hex', { length: 7 }),
		lengthCm: integer('length_cm'),
		widthCm: integer('width_cm'), // fabric width
		photoPath: text('photo_path'),
		binId: uuid('bin_id'),
		notes: text('notes'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({ ownerIdx: index('fabrics_owner_idx').on(t.ownerId) })
);

export const notions = pgTable(
	'notions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		ownerId: uuid('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: varchar('name', { length: 160 }).notNull(), // buttons, zipper, thread...
		category: varchar('category', { length: 80 }),
		quantity: integer('quantity').notNull().default(0),
		photoPath: text('photo_path'),
		binId: uuid('bin_id'),
		notes: text('notes'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({ ownerIdx: index('notions_owner_idx').on(t.ownerId) })
);

export const tools = pgTable(
	'tools',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		ownerId: uuid('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		type: toolType('type').notNull(),
		sizeMm: real('size_mm'), // needle/hook diameter
		lengthCm: integer('length_cm'), // cable length for circulars
		quantity: integer('quantity').notNull().default(1),
		// project currently using this tool (null = available)
		inUseProjectId: uuid('in_use_project_id'),
		binId: uuid('bin_id'),
		notes: text('notes'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({ ownerIdx: index('tools_owner_idx').on(t.ownerId) })
);

/* ------------------------------------------------------------------ */
/* Measurements & recipients                                          */
/* ------------------------------------------------------------------ */

export const measurementsProfiles = pgTable(
	'measurements_profiles',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		ownerId: uuid('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: varchar('name', { length: 120 }).notNull(),
		// measurements stored in flexible JSON (bust, waist, arm length...)
		measurements: jsonb('measurements').$type<Record<string, number>>().notNull().default({}),
		notes: text('notes'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({ ownerIdx: index('measurements_owner_idx').on(t.ownerId) })
);

export const recipients = pgTable(
	'recipients',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		ownerId: uuid('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: varchar('name', { length: 120 }).notNull(),
		profileId: uuid('profile_id').references(() => measurementsProfiles.id, {
			onDelete: 'set null'
		}),
		favoriteColors: jsonb('favorite_colors').$type<string[]>().notNull().default([]),
		fiberAllergies: text('fiber_allergies'),
		notes: text('notes'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({ ownerIdx: index('recipients_owner_idx').on(t.ownerId) })
);

/* ------------------------------------------------------------------ */
/* Projects (WIP) + Kanban                                            */
/* ------------------------------------------------------------------ */

export const projects = pgTable(
	'projects',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		ownerId: uuid('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		title: varchar('title', { length: 255 }).notNull(),
		patternId: uuid('pattern_id').references(() => patterns.id, { onDelete: 'set null' }),
		status: projectStatus('status').notNull().default('idee'),
		boardPosition: integer('board_position').notNull().default(0), // order within Kanban column
		progressPct: integer('progress_pct').notNull().default(0),
		currentRow: integer('current_row').notNull().default(0), // row counter
		totalRows: integer('total_rows'),
		timeSpentMinutes: integer('time_spent_minutes').notNull().default(0),
		costCents: integer('cost_cents').notNull().default(0), // materials cost
		retailPriceCents: integer('retail_price_cents'), // equivalent retail price (savings)
		deadline: date('deadline'),
		recipientId: uuid('recipient_id').references(() => recipients.id, { onDelete: 'set null' }),
		location: varchar('location', { length: 160 }), // where the WIP is stored
		notes: text('notes'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		finishedAt: timestamp('finished_at', { withTimezone: true })
	},
	(t) => ({
		ownerIdx: index('projects_owner_idx').on(t.ownerId),
		statusIdx: index('projects_status_idx').on(t.status)
	})
);

// Materials consumed by a project (yarn mainly)
export const projectYarns = pgTable(
	'project_yarns',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		yarnId: uuid('yarn_id').references(() => yarns.id, { onDelete: 'set null' }),
		skeinsUsed: real('skeins_used').notNull().default(0)
	},
	(t) => ({ projectIdx: index('project_yarns_project_idx').on(t.projectId) })
);

// Progress photos (timeline)
export const projectPhotos = pgTable(
	'project_photos',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		storedPath: text('stored_path').notNull(),
		caption: varchar('caption', { length: 255 }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({ projectIdx: index('project_photos_project_idx').on(t.projectId) })
);

// Work sessions -> actual pace (deadline prediction)
export const paceLogs = pgTable(
	'pace_logs',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		rowsDone: integer('rows_done').notNull(),
		minutes: integer('minutes').notNull(),
		loggedAt: timestamp('logged_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({ projectIdx: index('pace_logs_project_idx').on(t.projectId) })
);

/* ------------------------------------------------------------------ */
/* Gallery, goals, badges, inspiration, storage                       */
/* ------------------------------------------------------------------ */

export const finishedObjects = pgTable(
	'finished_objects',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		ownerId: uuid('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
		title: varchar('title', { length: 255 }).notNull(),
		photoPath: text('photo_path'),
		craft: craft('craft'),
		careInstructions: text('care_instructions'), // care label
		notes: text('notes'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({ ownerIdx: index('fo_owner_idx').on(t.ownerId) })
);

export const goals = pgTable(
	'goals',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		ownerId: uuid('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		title: varchar('title', { length: 200 }).notNull(),
		kind: varchar('kind', { length: 40 }).notNull(), // projects_year, stash_busting, monthly_challenge...
		targetValue: integer('target_value').notNull().default(1),
		currentValue: integer('current_value').notNull().default(0),
		periodStart: date('period_start'),
		periodEnd: date('period_end'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({ ownerIdx: index('goals_owner_idx').on(t.ownerId) })
);

export const achievements = pgTable(
	'achievements',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		ownerId: uuid('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		code: varchar('code', { length: 80 }).notNull(), // badge identifier
		unlockedAt: timestamp('unlocked_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({ ownerCode: uniqueIndex('achievements_owner_code').on(t.ownerId, t.code) })
);

export const moodBoards = pgTable(
	'mood_boards',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		ownerId: uuid('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		title: varchar('title', { length: 200 }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({ ownerIdx: index('mood_boards_owner_idx').on(t.ownerId) })
);

export const moodItems = pgTable(
	'mood_items',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		boardId: uuid('board_id')
			.notNull()
			.references(() => moodBoards.id, { onDelete: 'cascade' }),
		imagePath: text('image_path'),
		sourceUrl: text('source_url'),
		palette: jsonb('palette').$type<string[]>().notNull().default([]), // extracted colors
		note: text('note'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({ boardIdx: index('mood_items_board_idx').on(t.boardId) })
);

export const storageBins = pgTable(
	'storage_bins',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		ownerId: uuid('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		label: varchar('label', { length: 160 }).notNull(),
		location: varchar('location', { length: 160 }), // cupboard, shelf...
		qrCode: varchar('qr_code', { length: 80 }).notNull().unique(), // scanned identifier
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => ({ ownerIdx: index('bins_owner_idx').on(t.ownerId) })
);

/* ------------------------------------------------------------------ */
/* Inferred types                                                     */
/* ------------------------------------------------------------------ */

export type User = typeof users.$inferSelect;
export type Pattern = typeof patterns.$inferSelect;
export type PatternFile = typeof patternFiles.$inferSelect;
export type Yarn = typeof yarns.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ProjectStatus = (typeof projectStatus.enumValues)[number];
export type Craft = (typeof craft.enumValues)[number];

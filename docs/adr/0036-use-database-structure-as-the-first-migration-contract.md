# Use Database Structure as the first migration contract

The first database migration will follow `docs/database-structure.md` for table
names, column names, constraints, and indexes instead of reopening schema naming
before implementation. Minor Drizzle-specific naming adjustments and small
query-driven indexes are acceptable, but broader schema changes should be backed
by a new decision.

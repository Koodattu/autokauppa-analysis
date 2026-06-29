# Next SSR fetches through the Hono Product API

Next.js owns public rendering, while Hono owns the Product API and admin-only API
contracts. Server-rendered Next pages should fetch public analytics and Listing
data through the internal Hono Product API instead of importing Drizzle/database
access directly; this keeps data shaping, validation, and future caching/rate
limits behind one backend boundary.

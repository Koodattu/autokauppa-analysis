# Use a single Admin Password Gate for admin access first

The first version will use a deliberately minimal Admin Password Gate for the
Admin Panel and admin-only API routes instead of a full user account system. It
will compare against a plain `ADMIN_PASSWORD` environment secret and issue a
stateless HTTP-only session cookie signed with a separate `SESSION_SECRET`
rather than storing admin sessions in PostgreSQL. The cookie contains only a
small signed JSON payload with version, issued-at, expiry, and admin scope.
Analytics and Listing views are public, so this gate must stay scoped to
crawler state and admin operations and must be replaced before multi-user
access, roles, revocable/audited sessions, or stricter password-secret handling
are introduced.

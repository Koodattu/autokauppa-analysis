# Use a single Admin Password Gate for admin access first

The first version will use a deliberately minimal Admin Password Gate for the
Admin Panel and admin-only API routes instead of a full user account system.
Analytics and Listing views are public, so this gate must stay scoped to crawler
state and admin operations and must be replaced before multi-user access or roles
are introduced.

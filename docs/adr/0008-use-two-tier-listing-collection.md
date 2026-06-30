# Use two-tier Listing collection

The crawler will collect broad Search Result Data first and enrich selected
Listings with Detail Page Data second. The first implementation is limited to
current and sold Search Result Data so the full pipeline can be proven before
request volume and parser complexity increase. This still leaves room for deeper
fields such as transmission, registration number, trim, equipment, and
description later.

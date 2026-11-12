# SQL layout

The database dump `theme_park_2026-11-11_1340.sql` (submitted next to the code) is the complete, final database: schema, data, views, triggers. The files here are how it was built.
The number in a file name is its load order. Numbers are not renumbered, so "SQL/16" in code comments still means `rules/16_dependents_cancellation.sql`.

| Folder | What is in it |
|---|---|
| `schema/` | Tables and column changes: 00, 03, 04, 05, 10, 20 |
| `views/` | Report and portal views: 06, 12, 18 |
| `rules/` | Triggers and stored procedures: 08, 09, 11, 13, 14, 16, 17, 19, 28, 29, 30 |
| `migrations/` | Changes added after the first build: 15, 21 to 27 (24 and 25 hold the maintenance work report and the two graded business rules) |
| `seed/` | Reference data and extra maintenance data loaded on first start: 01, 07. The full populated data is in the dump. |
| `tests/` | Scripts that try to break a rule and roll back: 24, 25 |
| `queries/` | The five report queries the app reads at run time (copied into the app image) |

Mixed files stay whole: 05 and 16 hold tables, triggers and a view or procedures together. They sit in the folder of their main content.

## Fresh database
Docker runs the mounted files in name order on an empty volume, which builds the schema, views and triggers. Restore the dump after that to get the full data and every rule (see the main README).

## Existing database
Docker does not re-run anything. Apply a new file by hand, once, in number order.

## Known churn (not changed)
08 drops 18 triggers and 11 recreates them. Both still run, so the end state is the same as before this reorganisation. Later files (13, 14, 16, 19, 25, 27) replace individual triggers on top of that, so the dump is the one place to see the final set.

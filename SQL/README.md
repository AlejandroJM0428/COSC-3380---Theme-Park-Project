# SQL layout

The number in a file name is its load order on a fresh database. Docker mounts each file under its own name.
Numbers are not renumbered, so "SQL/16" in code comments still means `rules/16_dependents_cancellation.sql`.

| Folder | What is in it |
|---|---|
| `schema/` | Tables and column changes: 00, 03, 04, 05, 10, 20 |
| `views/` | Report and portal views: 06, 12, 18 |
| `rules/` | Triggers and stored procedures: 08, 09, 11, 13, 14, 16, 17, 19 |
| `migrations/` | One-off changes for a live database: 15, 21, 22, 23 |
| `seed/` | Generated made-up data: 00 clear, 01, 02, 07, and `history/` |
| `tools/` | Generator, history loader, checks |
| `queries/` | The five report queries the app reads at run time (copied into the app image) |

Mixed files stay whole: 05 and 16 hold tables, triggers and a view or procedures together. They sit in the folder of their main content.

## Fresh database
Docker runs 00 to 20 in name order on an empty volume. 02 is generated: run `python3 SQL/tools/gen_test_data.py` first.
Files 21, 22 and 23 are not mounted. 01 already has the new names and 05 and 11 already have the sold-out fix, so they matter only for a database that existed before.
File 15 is mounted but changes nothing on a fresh build, because 01 already has the new prices.

## Existing database
Docker does not re-run anything. Apply a new file by hand, once, in number order.

## Known churn (not changed)
08 drops 18 triggers and 11 recreates them. Both still run, so the end state is the same as before this reorganisation.

## Generated files
Everything in `seed/` comes from `tools/gen_test_data.py`. Re-run it instead of editing those files.

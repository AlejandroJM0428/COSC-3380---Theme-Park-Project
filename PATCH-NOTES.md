# Patch: "Sold out" and "Selling fast" showing together

Unzip over the project root (files keep their SQL/ paths), then on the live database run once:

    docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" theme_park' < SQL/23_sold_out_replaces_selling_fast.sql

No app rebuild or restart is needed: the fix is in the database. Reload the page afterwards (notices refresh every 5 minutes).

Files
- SQL/23_sold_out_replaces_selling_fast.sql  NEW. Live-database fix: trigger, view, one-time cleanup.
- SQL/05_notifications.sql                   v_ActiveNotifications hides a stale "Selling fast"; seed cleanup.
- SQL/11_restore_triggers.sql                trg_Ticket_AI_Notify switches off that date's "Selling fast".
(05 and 11 are the same changes, so a fresh database build is correct too.)

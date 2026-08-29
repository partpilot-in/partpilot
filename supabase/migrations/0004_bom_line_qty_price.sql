-- 0004_bom_line_qty_price.sql
-- Adds the Qty and Price columns needed by the client's BOM table.
-- Portability: pure vanilla Postgres, no Supabase-specific types or schemas.

alter table bom_lines
    add column if not exists qty integer not null default 1,
    add column if not exists unit_price numeric(12,4);

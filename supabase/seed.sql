-- FICTIONAL DEVELOPMENT DATA ONLY. Loaded only by local Supabase reset/start.
begin;
insert into public.categories(id, name) values
  ('10000000-0000-4000-8000-000000000001', 'مشروبات تجريبية'),
  ('10000000-0000-4000-8000-000000000002', 'تسالي تجريبية');
insert into public.products(id, sku, name, category_id, active) values
  ('20000000-0000-4000-8000-000000000001', 'DEMO-DRINK', 'مشروب تجريبي — بيانات خيالية', '10000000-0000-4000-8000-000000000001', true),
  ('20000000-0000-4000-8000-000000000002', 'DEMO-SNACK', 'مقرمشات تجريبية — بيانات خيالية', '10000000-0000-4000-8000-000000000002', true);
insert into public.product_units(id, product_id, name, pieces_per_unit, price_piastres) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'بالتة', 24, 24000),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'كرتونة', 48, 18000);
update public.inventory set quantity_pieces = 480, stock_updated_at = now(), version = 1;
insert into public.stock_movements(product_id, previous_quantity, new_quantity, source)
select product_id, 0, quantity_pieces, 'development_seed' from public.inventory;
-- No real delivery fees, payment destinations, customers or production passwords.
commit;

BEGIN;

-- Hotfix for 20261126032045_cattle_mixed_herds. sync_cattle_class_counts is a
-- BEFORE INSERT/UPDATE trigger on cattle_groups, so it runs as the signed-in
-- user for every direct herd add or edit. It calls _cattle_group_counts and
-- _cattle_count_column, which that migration revoked from clients, so the
-- write failed with "permission denied for function _cattle_group_counts".
-- RPC writes were unaffected (they run as the function owner). Running the
-- trigger as its owner keeps the helpers private and fixes direct writes.
-- search_path stays empty and every reference in the body is schema-qualified.
ALTER FUNCTION public.sync_cattle_class_counts() SECURITY DEFINER;
ALTER FUNCTION public.sync_cattle_class_counts() SET search_path = '';

COMMIT;

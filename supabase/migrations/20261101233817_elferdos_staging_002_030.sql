begin;
-- Tracking counterpart for the initial hosted staging bootstrap.
-- The deployment tool applied migrations 002-030 together and retained their
-- complete payload under this version in staging migration history. Original
-- versions 001-030 are also recorded. Never delete that hosted history record.
-- On a fresh/local installation the original migrations already establish the
-- schema before this marker, so no application or data operation is required.
select 1;
commit;

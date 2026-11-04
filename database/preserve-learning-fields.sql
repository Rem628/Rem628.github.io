-- Forward compatibility: older published clients discard unknown JSON fields.
-- Preserve and merge V2 fields on UPDATE before the legacy client replaces payload.
create or replace function mathbank_private.merge_learning_fields()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare field text;
begin
 foreach field in array array['events','prefs','feedback','drafts'] loop
  if new.payload ? field and jsonb_typeof(new.payload->field)<>'object' then
   raise exception 'Invalid learning field: %',field using errcode='22023';
  end if;
  -- New clients merge by event ID/per-answer clocks and use updated_at compare-and-swap.
  -- Old clients omit these keys entirely. Retain their previous server values.
  if not new.payload ? field and old.payload ? field then
   new.payload:=jsonb_set(new.payload,array[field],old.payload->field);
  end if;
 end loop;
 new.payload:=jsonb_set(new.payload,'{schema}',to_jsonb(greatest(coalesce((old.payload->>'schema')::int,2),coalesce((new.payload->>'schema')::int,2))));
 return new;
end $$;
revoke all on function mathbank_private.merge_learning_fields() from public,anon,authenticated;
create or replace trigger preserve_learning_fields before update of payload on public.user_state for each row execute function mathbank_private.merge_learning_fields();

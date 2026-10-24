-- Consul.ty update 2: real two-way messaging (no more lock after the first reply)
-- Run in Supabase SQL Editor AFTER schema.sql and update-1.sql.

-- ---------- 1) attachments can belong to a specific message ----------
alter table public.consultation_attachments
  add column message_id bigint references public.consultation_messages(id) on delete cascade;
create index on public.consultation_attachments (consultation_id);

-- ---------- 2) professors can message any time ----------
create policy "prof sends message" on public.consultation_messages
  for insert to authenticated with check (
    sender_id = auth.uid() and sender_role = 'professor'
    and exists (select 1 from public.consultations c
                 where c.id = consultation_id and c.professor_id = auth.uid()));

-- ---------- 3) status can be changed any time (replaces the one-shot professor_reply) ----------
drop function if exists public.professor_reply(bigint, text, text);

create function public.professor_set_status(p_ticket bigint, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare
  t public.consultations;
  p_name text;
begin
  if p_status not in ('pending','solved','on-site') then
    raise exception 'invalid status';
  end if;

  select * into t from public.consultations
   where id = p_ticket and professor_id = auth.uid() for update;
  if not found then raise exception 'ticket not found'; end if;

  if t.status = p_status then return; end if;

  update public.consultations set status = p_status where id = p_ticket;

  select 'Prof. ' || trim(first_name || ' ' || last_name) into p_name
    from public.professors where id = auth.uid();

  perform public.notify(
    t.student_id,
    case p_status
      when 'solved'  then format('%s marked your consultation as Solved.', p_name)
      when 'on-site' then format('%s approved your consultation request. Pick a date and time.', p_name)
      else                format('%s set your consultation back to Pending.', p_name)
    end,
    'my-tickets.html?id=' || p_ticket,
    p_ticket
  );
end $$;

revoke all on function public.professor_set_status(bigint, text) from public, anon;
grant execute on function public.professor_set_status(bigint, text) to authenticated;

-- ---------- 4) every new message notifies the other person ----------
create function public.notify_new_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  t public.consultations;
  who text;
  code text;
begin
  select * into t from public.consultations where id = new.consultation_id;
  code := lpad(t.id::text, 6, '0');

  if new.sender_role = 'student' then
    select trim(first_name || ' ' || last_name) into who from public.students where id = t.student_id;
    perform public.notify(
      t.professor_id,
      format('%s sent a message (Consultation %s).', coalesce(nullif(who, ''), 'A student'), code),
      'prof-consultations.html?id=' || t.id,
      t.id
    );
  else
    select 'Prof. ' || trim(first_name || ' ' || last_name) into who from public.professors where id = t.professor_id;
    perform public.notify(
      t.student_id,
      format('%s sent you a message (Consultation %s).', who, code),
      'my-tickets.html?id=' || t.id,
      t.id
    );
  end if;
  return new;
end $$;

create trigger message_created_notify
  after insert on public.consultation_messages
  for each row execute function public.notify_new_message();

-- ---------- 5) live chat ----------
alter publication supabase_realtime add table
  public.consultation_messages, public.consultation_attachments, public.consultations;

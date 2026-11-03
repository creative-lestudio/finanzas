import type { SupabaseClient } from '@supabase/supabase-js';
import type { SharedExpense } from './types';

// Gastos compartidos y deudas entre usuarios, guardados en Supabase (RLS: solo los miembros del grupo).
// Reutiliza el motor de saldos de shared.ts: en los tres tipos de movimiento «payer» puso el dinero
// y «shares» dice quién lo debe.

export interface CloudMember {
  userId: string;
  email: string;
  displayName: string;
}

export interface CloudGroup {
  id: string;
  name: string;
  currency: string;
  createdBy: string | null;
  members: CloudMember[];
}

export type EntryKind = 'expense' | 'debt' | 'payment';

export interface CloudEntry {
  id: string;
  groupId: string;
  createdBy: string | null;
  kind: EntryKind;
  payer: string;
  amount: number;
  description: string;
  date: string;
  shares: Record<string, number>;
  createdAt: string;
}

export interface PendingInvite {
  groupId: string;
  groupName: string;
  invitedBy: string;
}

const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};

export async function loadGroups(sb: SupabaseClient): Promise<CloudGroup[]> {
  const [g, m] = await Promise.all([
    sb.from('shared_groups').select('id, name, currency, created_by').order('created_at'),
    sb.from('shared_members').select('group_id, user_id, email, display_name'),
  ]);
  fail(g.error);
  fail(m.error);
  const members = (m.data ?? []) as { group_id: string; user_id: string; email: string; display_name: string }[];
  return ((g.data ?? []) as { id: string; name: string; currency: string; created_by: string | null }[]).map((x) => ({
    id: x.id,
    name: x.name,
    currency: x.currency,
    createdBy: x.created_by,
    members: members.filter((k) => k.group_id === x.id).map((k) => ({ userId: k.user_id, email: k.email, displayName: k.display_name })),
  }));
}

export async function loadEntries(sb: SupabaseClient, groupId: string): Promise<CloudEntry[]> {
  const { data, error } = await sb.from('shared_entries').select('*').eq('group_id', groupId).order('entry_date', { ascending: false }).order('created_at', { ascending: false });
  fail(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    groupId: String(r.group_id),
    createdBy: (r.created_by as string | null) ?? null,
    kind: r.kind as EntryKind,
    payer: String(r.payer),
    amount: Number(r.amount_cents),
    description: String(r.description ?? ''),
    date: String(r.entry_date),
    shares: (r.shares as Record<string, number>) ?? {},
    createdAt: String(r.created_at),
  }));
}

export async function createGroup(sb: SupabaseClient, name: string, currency: string, displayName: string): Promise<string> {
  const { data, error } = await sb.rpc('create_shared_group', { p_name: name, p_currency: currency, p_display_name: displayName });
  fail(error);
  return String(data);
}

export async function inviteByEmail(sb: SupabaseClient, groupId: string, email: string, userId: string): Promise<void> {
  const { error } = await sb.from('shared_invites').insert({ group_id: groupId, email: email.trim().toLowerCase(), invited_by: userId });
  if (error && error.code !== '23505') fail(error); // ya estaba invitado: no es un error
}

export async function loadGroupInvites(sb: SupabaseClient, groupId: string): Promise<{ id: string; email: string }[]> {
  const { data, error } = await sb.from('shared_invites').select('id, email').eq('group_id', groupId);
  fail(error);
  return (data ?? []) as { id: string; email: string }[];
}

export async function cancelInvite(sb: SupabaseClient, id: string): Promise<void> {
  fail((await sb.from('shared_invites').delete().eq('id', id)).error);
}

export async function pendingInvites(sb: SupabaseClient): Promise<PendingInvite[]> {
  const { data, error } = await sb.rpc('my_pending_invites');
  fail(error);
  return ((data ?? []) as { group_id: string; group_name: string; invited_by_name: string }[]).map((r) => ({ groupId: r.group_id, groupName: r.group_name, invitedBy: r.invited_by_name }));
}

export async function acceptInvite(sb: SupabaseClient, groupId: string, displayName: string): Promise<void> {
  fail((await sb.rpc('accept_invite', { p_group: groupId, p_display_name: displayName })).error);
}

export async function declineInvite(sb: SupabaseClient, groupId: string, email: string): Promise<void> {
  fail((await sb.from('shared_invites').delete().eq('group_id', groupId).eq('email', email.toLowerCase())).error);
}

export async function saveEntry(sb: SupabaseClient, e: Omit<CloudEntry, 'id' | 'createdAt' | 'createdBy'> & { id?: string }, userId: string): Promise<void> {
  const row = { group_id: e.groupId, kind: e.kind, payer: e.payer, amount_cents: e.amount, description: e.description.trim().slice(0, 200), entry_date: e.date, shares: e.shares, updated_at: new Date().toISOString() };
  const res = e.id ? await sb.from('shared_entries').update(row).eq('id', e.id) : await sb.from('shared_entries').insert({ ...row, created_by: userId });
  fail(res.error);
}

export async function deleteEntry(sb: SupabaseClient, id: string): Promise<void> {
  fail((await sb.from('shared_entries').delete().eq('id', id)).error);
}

export async function leaveGroup(sb: SupabaseClient, groupId: string, userId: string): Promise<void> {
  fail((await sb.from('shared_members').delete().eq('group_id', groupId).eq('user_id', userId)).error);
}

export async function renameMe(sb: SupabaseClient, groupId: string, userId: string, name: string): Promise<void> {
  fail((await sb.from('shared_members').update({ display_name: name.trim().slice(0, 60) }).eq('group_id', groupId).eq('user_id', userId)).error);
}

/** Avisa cuando alguien del grupo añade, cambia o borra algo. */
export function watchShared(sb: SupabaseClient, onChange: () => void): () => void {
  const ch = sb
    .channel(`shared-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_entries' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_members' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_invites' }, onChange)
    .subscribe();
  return () => {
    void sb.removeChannel(ch);
  };
}

/** Pasa los movimientos del grupo al formato del motor de saldos (shared.ts). */
export function toSharedExpenses(entries: CloudEntry[]): SharedExpense[] {
  return entries.map((e) => ({ id: e.id, groupId: e.groupId, date: e.date, description: e.description, amount: e.amount, paidBy: e.payer, shares: e.shares, settlement: e.kind === 'payment' }));
}

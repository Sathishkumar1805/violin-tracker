'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, Plus, LogOut, Pencil, X } from 'lucide-react';
import { IS_MOCK, getSupabaseClient, getProfile, getChildren, getSessions, getRewards, approveReward, createReward, updateReward } from '@/lib/supabase';
import { MOCK_PARENT_PROFILE, MOCK_PROFILE, MOCK_SESSIONS, MOCK_REWARDS } from '@/lib/mock-data';
import { calculateStreak, getPracticedMinutesToday, getPracticedMinutesThisMonth } from '@/lib/streak';
import WeeklyHistory from '@/components/WeeklyHistory';
import type { Profile, PracticeSession, Reward } from '@/lib/types';

const EMOJI_OPTS = ['🎬','🎮','🍦','🍕','🌙','🎁','🏖️','🍫','📚','🎪'];

export default function ParentClient() {
  const router = useRouter();
  const params = useSearchParams();
  const isMock = IS_MOCK || params.get('mock') === 'true';

  const [parent,   setParent]   = useState<Profile | null>(null);
  const [child,    setChild]    = useState<Profile | null>(null);
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [rewards,  setRewards]  = useState<Reward[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title,    setTitle]    = useState('');
  const [desc,     setDesc]     = useState('');
  const [cost,     setCost]     = useState(50);
  const [emoji,    setEmoji]    = useState('🎁');
  const [saving,   setSaving]   = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);

  // Reward editing
  const [editingRewardId, setEditingRewardId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc,  setEditDesc]  = useState('');
  const [editCost,  setEditCost]  = useState(50);
  const [editEmoji, setEditEmoji] = useState('🎁');
  const [editSaving, setEditSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (isMock) {
      setParent(MOCK_PARENT_PROFILE); setChild(MOCK_PROFILE);
      setSessions(MOCK_SESSIONS); setRewards(MOCK_REWARDS);
      setLoading(false); return;
    }
    const sb = getSupabaseClient();
    if (!sb) { router.push('/login'); return; }
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { router.push('/login'); return; }
    const p = await getProfile(user.id);
    if (!p || p.role !== 'parent') { router.push('/dashboard'); return; }
    const kids = await getChildren(p.id);
    const kid = kids[0] ?? null;
    setParent(p); setChild(kid);
    if (kid) {
      const [s, r] = await Promise.all([getSessions(kid.id), getRewards(kid.id)]);
      setSessions(s); setRewards(r);
    }
    setLoading(false);
  }, [isMock, router]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleApprove(id: string) {
    if (!isMock) await approveReward(id);
    setRewards(prev => prev.map(r => r.id === id ? { ...r, approved_at: new Date().toISOString() } : r));
  }

  async function handleAddReward(e: React.FormEvent) {
    e.preventDefault();
    if (!child || !parent) return;
    setSaving(true);
    const draft: Reward = {
      id: `r-${Date.now()}`, created_by: parent.id, for_user: child.id,
      title, description: desc || null, gem_cost: cost, emoji,
      is_active: true, redeemed_at: null, approved_at: null,
      created_at: new Date().toISOString(),
    };
    if (!isMock) {
      const saved = await createReward({ created_by: parent.id, for_user: child.id, title, description: desc || null, gem_cost: cost, emoji, is_active: true });
      if (saved) draft.id = saved.id;
    }
    setRewards(prev => [...prev, draft]);
    setTitle(''); setDesc(''); setCost(50); setEmoji('🎁'); setShowForm(false); setSaving(false);
  }

  function startEditReward(r: Reward) {
    setEditingRewardId(r.id);
    setEditTitle(r.title);
    setEditDesc(r.description ?? '');
    setEditCost(r.gem_cost);
    setEditEmoji(r.emoji);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingRewardId) return;
    setEditSaving(true);
    const updates = { title: editTitle, description: editDesc || null, gem_cost: editCost, emoji: editEmoji };
    if (!isMock) await updateReward(editingRewardId, updates);
    setRewards(prev => prev.map(r => r.id === editingRewardId ? { ...r, ...updates } : r));
    setEditingRewardId(null);
    setEditSaving(false);
  }

  if (loading) return (
    <div className="min-h-screen bg-violet-50 flex items-center justify-center">
      <div className="text-center"><div className="text-5xl mb-4">👩‍👧</div><p className="text-indigo-400 font-bold">Loading parent view…</p></div>
    </div>
  );

  const tz        = child?.timezone ?? 'America/Chicago';
  const streak    = calculateStreak(sessions, tz);
  const todayMins = getPracticedMinutesToday(sessions, tz);
  const monthMins = getPracticedMinutesThisMonth(sessions, tz);
  const pending   = rewards.filter(r => r.redeemed_at && !r.approved_at);

  return (
    <div className="min-h-screen bg-violet-50">
      <header className="bg-white border-b border-violet-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-lg shadow-sm">👩‍👧</div>
          <div>
            <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-wide">Parent Dashboard</p>
            <p className="text-base font-black text-indigo-900 leading-tight" style={{ fontFamily: 'Nunito, sans-serif' }}>
              {child?.display_name ?? 'No child linked'}&apos;s Progress
            </p>
          </div>
        </div>
        <button onClick={async () => { if (!isMock) await getSupabaseClient()?.auth.signOut(); router.push('/login'); }}
          className="p-2 rounded-xl text-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
          <LogOut size={18} />
        </button>
      </header>

      <main className="max-w-md mx-auto px-4 py-4 space-y-4 pb-12">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[{ icon:'🔥', val: String(streak), label:'day streak' }, { icon:'⏱️', val:`${todayMins}m`, label:'today' }, { icon:'📅', val:`${Math.floor(monthMins/60)}h${monthMins%60}m`, label:'this month' }].map(s => (
            <div key={s.label} className="bg-white rounded-2xl p-3 border border-violet-100 text-center">
              <div className="text-2xl mb-1">{s.icon}</div>
              <p className="text-xl font-black text-indigo-900" style={{ fontFamily: 'Nunito, sans-serif' }}>{s.val}</p>
              <p className="text-xs text-indigo-400 font-semibold">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Weekly history with navigation */}
        <WeeklyHistory
          sessions={sessions}
          timezone={tz}
          weekOffset={weekOffset}
          onWeekChange={setWeekOffset}
          goalMinutes={child?.daily_goal_minutes ?? 20}
        />

        {/* Pending approvals */}
        {pending.length > 0 && (
          <div className="bg-amber-50 rounded-3xl p-4 border border-amber-200">
            <h3 className="text-sm font-black text-amber-800 mb-3" style={{ fontFamily: 'Nunito, sans-serif' }}>⏳ Approval Needed ({pending.length})</h3>
            <div className="space-y-2">
              {pending.map(r => (
                <div key={r.id} className="flex items-center justify-between bg-white rounded-2xl p-3 border border-amber-100">
                  <div className="flex items-center gap-2"><span className="text-xl">{r.emoji}</span><span className="text-sm font-bold text-indigo-900">{r.title}</span></div>
                  <button onClick={() => handleApprove(r.id)}
                    className="flex items-center gap-1 bg-green-500 text-white px-3 py-1.5 rounded-xl text-xs font-black active:scale-95"
                    style={{ fontFamily: 'Nunito, sans-serif' }}>
                    <CheckCircle size={14} /> Approve
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reward management */}
        <div className="bg-white rounded-3xl p-4 border border-violet-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-black text-indigo-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Manage Rewards</h3>
            <button onClick={() => setShowForm(v => !v)}
              className="flex items-center gap-1 bg-indigo-600 text-white px-3 py-1.5 rounded-xl text-xs font-black active:scale-95"
              style={{ fontFamily: 'Nunito, sans-serif' }}>
              <Plus size={14} /> Add Reward
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleAddReward} className="bg-violet-50 rounded-2xl p-3 mb-3 space-y-3 border border-violet-100">
              <div>
                <label className="text-xs font-bold text-indigo-500 mb-1 block">Reward Name *</label>
                <input type="text" placeholder="e.g. Pick Friday movie" value={title} onChange={e => setTitle(e.target.value)} required
                  className="w-full px-3 py-2 rounded-xl border border-violet-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="text-xs font-bold text-indigo-500 mb-1 block">Description</label>
                <input type="text" placeholder="Any details…" value={desc} onChange={e => setDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-violet-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-bold text-indigo-500 mb-1 block">Gem Cost</label>
                  <input type="number" min={10} max={500} step={10} value={cost} onChange={e => setCost(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-violet-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-bold text-indigo-500 mb-1 block">Icon</label>
                  <select value={emoji} onChange={e => setEmoji(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-violet-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    {EMOJI_OPTS.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-2 rounded-xl border border-violet-200 text-sm font-bold text-indigo-400">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2 bg-indigo-600 text-white rounded-xl text-sm font-black active:scale-95 disabled:opacity-60"
                  style={{ fontFamily: 'Nunito, sans-serif' }}>{saving ? 'Saving…' : 'Add Reward'}</button>
              </div>
            </form>
          )}

          <div className="space-y-2">
            {rewards.filter(r => r.is_active).map(r => (
              <div key={r.id}>
                {editingRewardId === r.id ? (
                  <form onSubmit={handleSaveEdit} className="bg-violet-50 rounded-2xl p-3 border border-indigo-200 space-y-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-black text-indigo-500">Edit Reward</p>
                      <button type="button" onClick={() => setEditingRewardId(null)} className="text-indigo-300 hover:text-indigo-500"><X size={14} /></button>
                    </div>
                    <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} required
                      className="w-full px-3 py-2 rounded-xl border border-violet-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    <input type="text" placeholder="Description" value={editDesc} onChange={e => setEditDesc(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-violet-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="text-xs font-bold text-indigo-500 mb-1 block">Gem Cost</label>
                        <input type="number" min={10} max={500} step={10} value={editCost} onChange={e => setEditCost(Number(e.target.value))}
                          className="w-full px-3 py-2 rounded-xl border border-violet-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs font-bold text-indigo-500 mb-1 block">Icon</label>
                        <select value={editEmoji} onChange={e => setEditEmoji(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-violet-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400">
                          {EMOJI_OPTS.map(e => <option key={e} value={e}>{e}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setEditingRewardId(null)}
                        className="flex-1 py-2 rounded-xl border border-violet-200 text-sm font-bold text-indigo-400">Cancel</button>
                      <button type="submit" disabled={editSaving}
                        className="flex-1 py-2 bg-indigo-600 text-white rounded-xl text-sm font-black active:scale-95 disabled:opacity-60"
                        style={{ fontFamily: 'Nunito, sans-serif' }}>{editSaving ? 'Saving…' : 'Save'}</button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-violet-50 border border-violet-100">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{r.emoji}</span>
                      <div><p className="text-sm font-bold text-indigo-900">{r.title}</p><p className="text-xs text-indigo-400 font-semibold">{r.gem_cost} gems</p></div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${r.approved_at ? 'bg-green-100 text-green-600' : r.redeemed_at ? 'bg-amber-100 text-amber-600' : 'bg-violet-100 text-violet-500'}`}>
                        {r.approved_at ? '✓ Done' : r.redeemed_at ? 'Pending' : 'Active'}
                      </span>
                      {!r.redeemed_at && (
                        <button onClick={() => startEditReward(r)}
                          className="p-1.5 rounded-lg text-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          title="Edit reward">
                          <Pencil size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Recent sessions */}
        <div className="bg-white rounded-3xl p-4 border border-violet-100">
          <h3 className="text-sm font-black text-indigo-900 mb-3" style={{ fontFamily: 'Nunito, sans-serif' }}>Recent Sessions</h3>
          {sessions.slice(0, 7).map(s => {
            const dur = s.duration_seconds ?? 0;
            return (
              <div key={s.id} className="flex items-center justify-between py-2 border-b border-violet-50 last:border-0">
                <span className="text-sm font-semibold text-indigo-700">
                  {new Date(s.started_at).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })}
                </span>
                <span className="text-sm font-black text-indigo-900" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  {Math.floor(dur/60)}m {dur%60}s
                </span>
              </div>
            );
          })}
          {sessions.length === 0 && <p className="text-sm text-indigo-300 font-semibold text-center py-2">No sessions yet</p>}
        </div>
      </main>

      {isMock && <div className="fixed bottom-0 left-0 right-0 bg-amber-500 text-white text-center py-2 text-xs font-bold z-20">🎭 Mock Mode</div>}
    </div>
  );
}

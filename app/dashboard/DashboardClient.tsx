'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { IS_MOCK, getSupabaseClient, getProfile, getSessions, getRewards, getAchievements, updateMascot } from '@/lib/supabase';
import { MOCK_PROFILE, MOCK_SESSIONS, MOCK_REWARDS, MOCK_ACHIEVEMENTS } from '@/lib/mock-data';
import { calculateStreak, getWeekPracticeStatus, getPracticedMinutesToday, getPracticedMinutesThisMonth } from '@/lib/streak';
import { evaluateChallenges } from '@/lib/challenges';
import type { Profile, PracticeSession, Reward, Achievement } from '@/lib/types';
import StreakBanner   from '@/components/StreakBanner';
import ViolinProgress from '@/components/ViolinProgress';
import Timer          from '@/components/Timer';
import ChallengesTab  from '@/components/ChallengesTab';
import RewardStore    from '@/components/RewardStore';
import Mascot, { getMascotMood, type MascotType } from '@/components/Mascot';
import MascotPicker   from '@/components/MascotPicker';

type Tab = 'practice' | 'challenges' | 'rewards';

export default function DashboardClient() {
  const router = useRouter();
  const params = useSearchParams();
  const isMock = IS_MOCK || params.get('mock') === 'true';

  const [profile,      setProfile]      = useState<Profile | null>(null);
  const [sessions,     setSessions]     = useState<PracticeSession[]>([]);
  const [rewards,      setRewards]      = useState<Reward[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [activeTab,    setActiveTab]    = useState<Tab>('practice');
  const [loading,      setLoading]      = useState(true);
  const [mascotType,   setMascotType]   = useState<MascotType>('bird');
  const [pushEnabled,  setPushEnabled]  = useState(false);
  const [pushLoading,  setPushLoading]  = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushError,    setPushError]    = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (isMock) {
      setProfile(MOCK_PROFILE); setSessions(MOCK_SESSIONS);
      setRewards(MOCK_REWARDS); setAchievements(MOCK_ACHIEVEMENTS);
      setLoading(false); return;
    }
    const sb = getSupabaseClient();
    if (!sb) { router.push('/login'); return; }
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { router.push('/login'); return; }
    const [p, s, r, a] = await Promise.all([
      getProfile(user.id), getSessions(user.id), getRewards(user.id), getAchievements(user.id),
    ]);
    if (!p) { router.push('/login'); return; }
    if (p.role === 'parent') { router.push('/parent'); return; }
    setProfile(p); setSessions(s); setRewards(r); setAchievements(a);
    setLoading(false);
  }, [isMock, router]);

  useEffect(() => { loadData(); }, [loadData]);

  // Phase 2: sync mascot from profile (DB wins over localStorage)
  useEffect(() => {
    if (profile?.mascot_type) {
      setMascotType(profile.mascot_type as MascotType);
      localStorage.setItem('violin-mascot', profile.mascot_type);
    } else {
      const saved = localStorage.getItem('violin-mascot') as MascotType | null;
      if (saved) setMascotType(saved);
    }
  }, [profile]);

  // Phase 3: check push support and current status on mount
  useEffect(() => {
    const hasVapid = !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const hasBrowserSupport = 'serviceWorker' in navigator && 'PushManager' in window;
    setPushSupported(hasVapid && hasBrowserSupport);
    if (hasVapid && hasBrowserSupport) {
      import('@/lib/push').then(({ checkPushStatus }) => checkPushStatus().then(setPushEnabled));
    }
  }, []);

  async function handleMascotChange(type: MascotType) {
    setMascotType(type);
    localStorage.setItem('violin-mascot', type);
    if (!isMock && profile) await updateMascot(profile.id, type);
  }

  async function handleTogglePush() {
    if (!profile || !pushSupported) return;
    setPushLoading(true);
    setPushError(null);
    const { subscribeToPush, unsubscribeFromPush } = await import('@/lib/push');
    if (pushEnabled) {
      await unsubscribeFromPush(profile.id);
      setPushEnabled(false);
    } else {
      const ok = await subscribeToPush(profile.id);
      if (!ok) {
        const blocked = Notification.permission === 'denied';
        setPushError(blocked ? 'Notifications blocked — check browser settings' : 'Could not enable reminders');
      }
      setPushEnabled(ok);
    }
    setPushLoading(false);
  }

  const tz           = profile?.timezone ?? 'America/Chicago';
  const streak       = calculateStreak(sessions, tz);
  const weekStatus   = getWeekPracticeStatus(sessions, tz);
  const minutesToday = getPracticedMinutesToday(sessions, tz);
  const goalMinutes  = profile?.daily_goal_minutes ?? 20;
  const monthMinutes = getPracticedMinutesThisMonth(sessions, tz);
  const challenges   = evaluateChallenges(sessions, achievements, tz);
  const mascotMood   = getMascotMood(minutesToday, goalMinutes, streak, sessions.length > 0);

  function handleSessionComplete(session: PracticeSession, gemsEarned: number) {
    setSessions(prev => [session, ...prev]);
    setProfile(prev => prev ? { ...prev, gems: prev.gems + gemsEarned } : prev);
  }

  function handleRewardRedeemed(rewardId: string) {
    const reward = rewards.find(r => r.id === rewardId);
    if (!reward || !profile || profile.gems < reward.gem_cost) return;
    setRewards(prev => prev.map(r => r.id === rewardId ? { ...r, redeemed_at: new Date().toISOString() } : r));
    setProfile(prev => prev ? { ...prev, gems: prev.gems - reward.gem_cost } : prev);
  }

  async function signOut() {
    if (!isMock) await getSupabaseClient()?.auth.signOut();
    router.push('/login');
  }

  if (loading) return (
    <div className="min-h-screen bg-violet-50 flex items-center justify-center">
      <div className="text-center">
        <div className="text-5xl mb-4 animate-bounce">🎻</div>
        <p className="text-indigo-400 font-bold">Loading your practice…</p>
      </div>
    </div>
  );
  if (!profile) return null;

  return (
    <div className="min-h-screen bg-violet-50">
      <header className="bg-white border-b border-violet-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center text-lg shadow-sm">🎻</div>
          <div>
            <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-wide">Welcome back</p>
            <p className="text-base font-black text-indigo-900 leading-tight" style={{ fontFamily: 'Nunito, sans-serif' }}>{profile.display_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5">
            <span className="w-3.5 h-3.5 bg-amber-400 rounded-sm rotate-45 inline-block flex-shrink-0" />
            <span className="text-sm font-black text-amber-700" style={{ fontFamily: 'Nunito, sans-serif' }}>{profile.gems}</span>
          </div>
          <button onClick={signOut} className="p-2 rounded-xl text-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pb-24 space-y-3 pt-3">
        <StreakBanner streak={streak} weekStatus={weekStatus} />

        <div className="flex bg-white rounded-2xl p-1 border border-violet-100 shadow-sm">
          {(['practice', 'challenges', 'rewards'] as Tab[]).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${activeTab === tab ? 'bg-indigo-600 text-white shadow-sm' : 'text-indigo-400'}`}
              style={{ fontFamily: 'Nunito, sans-serif' }}>
              {tab === 'practice' ? '🎻 Practice' : tab === 'challenges' ? '🏆 Challenges' : '🛍️ Rewards'}
            </button>
          ))}
        </div>

        {activeTab === 'practice' && (
          <>
            <Mascot mascotType={mascotType} mood={mascotMood} streak={streak} />
            <MascotPicker current={mascotType} onChange={handleMascotChange} />

            {/* Practice reminder toggle */}
            <div className="bg-white px-4 py-3 rounded-2xl border border-violet-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{pushEnabled ? '🔔' : '🔕'}</span>
                  <div>
                    <p className="text-xs font-black text-indigo-900">Practice reminders</p>
                    <p className="text-[10px] text-indigo-400 font-medium">
                      {!pushSupported ? 'Not available in this browser' : "Daily nudge if you haven't practiced"}
                    </p>
                  </div>
                </div>
                <button onClick={handleTogglePush} disabled={pushLoading || !pushSupported}
                  className={`relative w-11 h-6 rounded-full transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${pushEnabled ? 'bg-indigo-600' : 'bg-indigo-200'}`}>
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-200 ${pushEnabled ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
              {pushError && (
                <p className="text-[10px] text-red-500 font-semibold mt-1.5">{pushError}</p>
              )}
            </div>

            <ViolinProgress minutesToday={minutesToday} goalMinutes={goalMinutes} />
            <Timer profile={profile} isMock={isMock} onSessionComplete={handleSessionComplete} />
          </>
        )}
        {activeTab === 'challenges' && (
          <ChallengesTab challenges={challenges} achievements={achievements} monthMinutes={monthMinutes} />
        )}
        {activeTab === 'rewards' && (
          <RewardStore rewards={rewards} gems={profile.gems} isMock={isMock} onRedeem={handleRewardRedeemed} />
        )}
      </main>

      {isMock && (
        <div className="fixed bottom-0 left-0 right-0 bg-amber-500 text-white text-center py-2 text-xs font-bold z-20">
          🎭 Mock Mode — connect Supabase to save real data
        </div>
      )}
    </div>
  );
}

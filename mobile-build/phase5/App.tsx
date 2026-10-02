import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StatusBar as RNStatusBar, StyleSheet, Text, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import { colors } from './src/theme';
import { HomeScreen } from './src/screens/HomeScreen';
import { AiScreen } from './src/screens/AiScreen';
import { MarketScreen } from './src/screens/MarketScreen';
import { ProjectsScreen } from './src/screens/ProjectsScreen';
import { MoreScreen } from './src/screens/MoreScreen';
import { FeedDetailScreen } from './src/screens/FeedDetailScreen';
import { PropertyDetailScreen } from './src/screens/PropertyDetailScreen';
import { NotificationsScreen } from './src/screens/NotificationsScreen';
import { AgendaDetailScreen } from './src/screens/AgendaDetailScreen';
import { LanguageProvider, useI18n } from './src/lib/i18n';
import { ConstructionCostScreen } from './src/screens/ConstructionCostScreen';
import { ProfessionalsScreen } from './src/screens/ProfessionalsScreen';
import { InAppWebScreen } from './src/screens/InAppWebScreen';
import { CreatePostScreen } from './src/screens/CreatePostScreen';
import { CreatePropertyScreen } from './src/screens/CreatePropertyScreen';
import { CreateSheet } from './src/components/CreateSheet';

type Tab = 'Home' | 'AI' | 'Market' | 'Projects' | 'More';
type Detail =
  | { kind: 'post'; id: string }
  | { kind: 'property'; id: string }
  | { kind: 'agenda'; id: string }
  | { kind: 'notifications' }
  | { kind: 'cost' }
  | { kind: 'professionals' }
  | { kind: 'web'; title: string; path: string }
  | { kind: 'createPost' }
  | { kind: 'createProperty' }
  | null;

const tabs: { key: Tab; icon: string }[] = [
  { key: 'Home', icon: '⌂' },
  { key: 'AI', icon: '✦' },
  { key: 'Market', icon: '▦' },
  { key: 'Projects', icon: '▤' },
  { key: 'More', icon: '•••' },
];

export default function App() { return <LanguageProvider><AppShell /></LanguageProvider>; }

function AppShell() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('Home');
  const [detail, setDetail] = useState<Detail>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const openWeb = (title: string, path: string) => setDetail({ kind: 'web', title, path });
  const openTab = (next: Tab) => { setDetail(null); setTab(next); };

  let screen: React.ReactNode;
  if (detail?.kind === 'post') screen = <FeedDetailScreen postId={detail.id} session={session} onBack={() => setDetail(null)} />;
  else if (detail?.kind === 'property') screen = <PropertyDetailScreen propertyId={detail.id} session={session} onBack={() => setDetail(null)} />;
  else if (detail?.kind === 'agenda') screen = <AgendaDetailScreen projectId={detail.id} onBack={() => setDetail(null)} />;
  else if (detail?.kind === 'notifications') screen = <NotificationsScreen session={session} onBack={() => setDetail(null)} />;
  else if (detail?.kind === 'cost') screen = <ConstructionCostScreen session={session} onBack={() => setDetail(null)} />;
  else if (detail?.kind === 'professionals') screen = <ProfessionalsScreen onBack={() => setDetail(null)} />;
  else if (detail?.kind === 'web') screen = <InAppWebScreen title={detail.title} path={detail.path} onBack={() => setDetail(null)} />;
  else if (detail?.kind === 'createPost') screen = <CreatePostScreen session={session} onBack={() => setDetail(null)} onCreated={(id) => setDetail({ kind: 'post', id })} />;
  else if (detail?.kind === 'createProperty') screen = <CreatePropertyScreen session={session} onBack={() => setDetail(null)} onCreated={(id) => setDetail({ kind: 'property', id })} />;
  else if (tab === 'Home') screen = <HomeScreen session={session} onOpenPost={(id) => setDetail({ kind: 'post', id })} onOpenCost={() => setDetail({ kind: 'cost' })} onOpenBoq={() => openWeb(t('boq'), '/boq')} />;
  else if (tab === 'AI') screen = <AiScreen session={session} />;
  else if (tab === 'Market') screen = <MarketScreen onOpenProperty={(id) => setDetail({ kind: 'property', id })} />;
  else if (tab === 'Projects') screen = <ProjectsScreen session={session} onOpenAgenda={(id) => setDetail({ kind: 'agenda', id })} />;
  else screen = <MoreScreen
    session={session}
    onOpenNotifications={() => setDetail({ kind: 'notifications' })}
    onOpenProjects={() => openTab('Projects')}
    onOpenProfessionals={() => setDetail({ kind: 'professionals' })}
    onOpenRealEstate={() => openTab('Market')}
    onOpenCost={() => setDetail({ kind: 'cost' })}
    onOpenWeb={openWeb}
  />;

  return (
    <View style={styles.root}>
      <RNStatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <View style={styles.safeTop} />
      <View style={styles.content}>{screen}</View>
      {!detail ? <>
        <Pressable onPress={() => setCreateOpen(true)} style={({ pressed }) => [styles.createButton, pressed && styles.createPressed]}>
          <Text style={styles.createText}>＋</Text>
        </Pressable>
        <View style={styles.nav}>
          {tabs.map((item) => {
            const active = tab === item.key;
            return (
              <Pressable key={item.key} onPress={() => setTab(item.key)} style={({ pressed }) => [styles.navItem, pressed && styles.pressed]}>
                <Text style={[styles.icon, active && styles.active]}>{item.icon}</Text>
                <Text style={[styles.label, active && styles.active]}>{item.key === 'Home' ? t('home') : item.key === 'AI' ? t('ai') : item.key === 'Market' ? t('market') : item.key === 'Projects' ? t('projects') : t('more')}</Text>
              </Pressable>
            );
          })}
        </View>
        <CreateSheet
          visible={createOpen}
          onClose={() => setCreateOpen(false)}
          onPost={() => { setCreateOpen(false); setDetail({ kind: 'createPost' }); }}
          onProperty={() => { setCreateOpen(false); setDetail({ kind: 'createProperty' }); }}
        />
      </> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safeTop: { height: Platform.OS === 'android' ? RNStatusBar.currentHeight ?? 24 : 48, backgroundColor: colors.bg },
  content: { flex: 1 },
  nav: { position: 'absolute', left: 10, right: 10, bottom: 10, minHeight: 68, borderRadius: 22, backgroundColor: '#0B1725F2', borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 5, paddingBottom: Platform.OS === 'ios' ? 6 : 0 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 16 },
  icon: { color: colors.muted, fontSize: 20, lineHeight: 22 },
  label: { color: colors.muted, fontSize: 10, fontWeight: '700', marginTop: 3 },
  active: { color: colors.blue2 },
  pressed: { backgroundColor: colors.white08 },
  createButton: { position: 'absolute', right: 20, bottom: 88, width: 58, height: 58, borderRadius: 29, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#7CC0FF', zIndex: 20, elevation: 10 },
  createText: { color: '#fff', fontSize: 34, lineHeight: 38, fontWeight: '400', marginTop: -2 },
  createPressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
});

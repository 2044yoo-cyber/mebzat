import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { colors } from '../theme';
import { EmptyState, LoadingState } from '../components/Ui';
import { useI18n } from '../lib/i18n';

type FeedPost = {
  id: string;
  kind: string | null;
  topic: string | null;
  title: string | null;
  body: string | null;
  author_id: string | null;
  company_id: string | null;
  author_name: string | null;
  author_role: string | null;
  author_avatar_url: string | null;
  city: string | null;
  tags: string[] | null;
  price_amount: number | string | null;
  price_currency: string | null;
  like_count: number | null;
  comment_count: number | null;
  save_count: number | null;
  share_count: number | null;
  boost: number | null;
  published_at: string | null;
  media?: { url: string; poster_url: string | null; kind: string | null; position: number | null }[];
};

type Preference = { kind: string | null; topic: string | null; weight: number };

type Props = {
  session: Session | null;
  onOpenPost: (postId: string) => void;
  onOpenCost: () => void;
  onOpenBoq: () => void;
};

export function HomeScreen({ session, onOpenPost, onOpenCost, onOpenBoq }: Props) {
  const { t } = useI18n();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [followedProfiles, setFollowedProfiles] = useState<Set<string>>(new Set());
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'forYou' | 'following'>('forYou');
  const [error, setError] = useState<string | null>(null);

  async function load(refresh = false) {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    const { data, error: postError } = await supabase
      .from('feed_posts')
      .select('id,kind,topic,title,body,author_id,company_id,author_name,author_role,author_avatar_url,city,tags,price_amount,price_currency,like_count,comment_count,save_count,share_count,boost,published_at')
      .order('published_at', { ascending: false })
      .limit(100);

    if (postError) {
      setError(postError.message);
      setPosts([]);
    } else {
      const base = (data ?? []) as FeedPost[];
      const ids = base.map((p) => p.id);
      const mediaByPost = new Map<string, FeedPost['media']>();
      if (ids.length) {
        const { data: media } = await supabase
          .from('feed_media')
          .select('post_id,url,poster_url,kind,position')
          .in('post_id', ids)
          .order('position', { ascending: true });
        for (const item of media ?? []) {
          const list = mediaByPost.get(item.post_id) ?? [];
          list.push({ url: item.url, poster_url: item.poster_url, kind: item.kind, position: item.position });
          mediaByPost.set(item.post_id, list);
        }
      }
      setPosts(base.map((p) => ({ ...p, media: mediaByPost.get(p.id) ?? [] })));
    }

    if (session?.user.id) {
      const userId = session.user.id;
      const [{ data: likes }, { data: saves }, { data: follows }, { data: interactions }] = await Promise.all([
        supabase.from('feed_likes').select('post_id').eq('user_id', userId),
        supabase.from('feed_saves').select('post_id').eq('user_id', userId),
        supabase.from('follows').select('target_id,target_type').eq('follower_id', userId),
        supabase.from('feed_interactions').select('post_id,weight,interaction_count').eq('user_id', userId).order('last_interacted_at', { ascending: false }).limit(80),
      ]);
      setLiked(new Set((likes ?? []).map((x) => x.post_id)));
      setSaved(new Set((saves ?? []).map((x) => x.post_id)));
      setFollowedProfiles(new Set((follows ?? []).filter((x) => x.target_type === 'profile').map((x) => x.target_id)));

      const interactionRows = interactions ?? [];
      const interactionIds = interactionRows.map((x) => x.post_id);
      if (interactionIds.length) {
        const { data: contextPosts } = await supabase.from('feed_posts').select('id,kind,topic').in('id', interactionIds);
        const byId = new Map((contextPosts ?? []).map((p) => [p.id, p]));
        setPreferences(interactionRows.map((x) => {
          const p = byId.get(x.post_id);
          return { kind: p?.kind ?? null, topic: p?.topic ?? null, weight: Number(x.weight ?? 1) * Number(x.interaction_count ?? 1) };
        }));
      } else setPreferences([]);
    } else {
      setLiked(new Set()); setSaved(new Set()); setFollowedProfiles(new Set()); setPreferences([]);
    }
    setLoading(false); setRefreshing(false);
  }

  useEffect(() => { load(); }, [session?.user.id]);

  const ranked = useMemo(() => {
    const q = query.trim().toLowerCase();
    const kindScore = new Map<string, number>();
    const topicScore = new Map<string, number>();
    for (const p of preferences) {
      if (p.kind) kindScore.set(p.kind, (kindScore.get(p.kind) ?? 0) + p.weight);
      if (p.topic) topicScore.set(p.topic, (topicScore.get(p.topic) ?? 0) + p.weight);
    }
    let items = posts.filter((p) => !q || [p.title, p.body, p.author_name, p.city, p.kind, p.topic, ...(p.tags ?? [])].some((v) => v?.toLowerCase().includes(q)));
    if (mode === 'following') items = items.filter((p) => p.author_id && followedProfiles.has(p.author_id));
    if (mode === 'forYou') {
      items = [...items].sort((a, b) => score(b) - score(a));
      // keep the feed visually mixed instead of long runs of the same content kind
      const mixed: FeedPost[] = [];
      const pool = [...items];
      while (pool.length) {
        const last1 = mixed[mixed.length - 1]?.kind;
        const last2 = mixed[mixed.length - 2]?.kind;
        let index = 0;
        if (last1 && last1 === last2) {
          const different = pool.findIndex((p) => p.kind !== last1);
          if (different >= 0) index = different;
        }
        mixed.push(pool.splice(index, 1)[0]);
      }
      items = mixed;
    }
    return items;

    function score(p: FeedPost) {
      const ageHours = p.published_at ? Math.max(0, (Date.now() - new Date(p.published_at).getTime()) / 3600000) : 1000;
      const recency = Math.max(0, 8 - ageHours / 24);
      const interest = (p.kind ? kindScore.get(p.kind) ?? 0 : 0) * 0.8 + (p.topic ? topicScore.get(p.topic) ?? 0 : 0) * 1.4;
      const following = p.author_id && followedProfiles.has(p.author_id) ? 20 : 0;
      const engagement = Math.log1p((p.like_count ?? 0) + (p.comment_count ?? 0) * 2 + (p.save_count ?? 0) * 2) * 0.8;
      return interest + following + recency + engagement + Number(p.boost ?? 0);
    }
  }, [posts, query, mode, preferences, followedProfiles]);

  async function toggleLike(post: FeedPost) {
    if (!session?.user.id) return onOpenPost(post.id);
    const was = liked.has(post.id);
    setLiked((prev) => { const next = new Set(prev); was ? next.delete(post.id) : next.add(post.id); return next; });
    setPosts((prev) => prev.map((p) => p.id === post.id ? { ...p, like_count: Math.max(0, (p.like_count ?? 0) + (was ? -1 : 1)) } : p));
    const result = was
      ? await supabase.from('feed_likes').delete().eq('post_id', post.id).eq('user_id', session.user.id)
      : await supabase.from('feed_likes').insert({ post_id: post.id, user_id: session.user.id });
    if (result.error) load();
  }

  async function toggleSave(post: FeedPost) {
    if (!session?.user.id) return onOpenPost(post.id);
    const was = saved.has(post.id);
    setSaved((prev) => { const next = new Set(prev); was ? next.delete(post.id) : next.add(post.id); return next; });
    const result = was
      ? await supabase.from('feed_saves').delete().eq('post_id', post.id).eq('user_id', session.user.id)
      : await supabase.from('feed_saves').insert({post_id: post.id,user_id: session.user.id});
    if (result.error) load();
  }

  async function toggleFollow(post: FeedPost) {
    if (!session?.user.id || !post.author_id || post.author_id === session.user.id) return;
    const was = followedProfiles.has(post.author_id);
    setFollowedProfiles((prev) => { const next = new Set(prev); was ? next.delete(post.author_id!) : next.add(post.author_id!); return next; });
    const result = was
      ? await supabase.from('follows').delete().eq('follower_id', session.user.id).eq('target_type', 'profile').eq('target_id', post.author_id)
      : await supabase.from('follows').insert({follower_id: session.user.id,target_type: 'profile',target_id: post.author_id});
    if (result.error) load();
  }

  async function sharePost(post: FeedPost) {
    const web = process.env.EXPO_PUBLIC_MEDOSHA_WEB_URL ?? 'https://medosha.net';
    await Share.share({ message: `${post.title ?? post.body ?? 'Medosha'}\n${web}/feed/${post.id}` });
  }

  if (loading) return <LoadingState label="Loading Medosha feed…" />;

  return (
    <FlatList
      data={ranked}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.blue2} />}
      contentContainerStyle={styles.list}
      ListHeaderComponent={<View style={styles.top}>
        <View style={styles.brandRow}><View style={styles.logo}><Text style={styles.logoText}>M</Text></View><View style={{ flex: 1 }}><Text style={styles.brand}>Medosha</Text><Text style={styles.tagline}>{t('tagline')}</Text></View></View>
        <TextInput value={query} onChangeText={setQuery} placeholder={t('search')} placeholderTextColor={colors.muted} style={styles.search} />
        <View style={styles.feedTabs}>
          <Pressable onPress={() => setMode('forYou')} style={[styles.feedTab, mode === 'forYou' && styles.feedTabActive]}><Text style={[styles.feedTabText, mode === 'forYou' && styles.feedTabTextActive]}>For You</Text></Pressable>
          <Pressable onPress={() => setMode('following')} style={[styles.feedTab, mode === 'following' && styles.feedTabActive]}><Text style={[styles.feedTabText, mode === 'following' && styles.feedTabTextActive]}>Following</Text></Pressable>
        </View>
        <View style={styles.quickRow}>
          <Pressable onPress={onOpenCost} style={({ pressed }) => [styles.quick, pressed && styles.pressed]}><Text style={styles.quickTitle}>{t('constructionCost')}</Text><Text style={styles.quickBody}>{t('liveMaterialData')}</Text></Pressable>
          <Pressable onPress={onOpenBoq} style={({ pressed }) => [styles.quick, pressed && styles.pressed]}><Text style={styles.quickTitle}>{t('boq')}</Text><Text style={styles.quickBody}>{t('takeoffEstimates')}</Text></Pressable>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>}
      ListEmptyComponent={<EmptyState title={mode === 'following' ? 'Nothing from people you follow yet' : 'No feed items found'} body={mode === 'following' ? 'Follow professionals from For You and their posts will appear here.' : 'Try another search.'} />}
      renderItem={({ item }) => {
        const media = item.media?.[0];
        const imageUrl = media?.kind === 'video' ? media.poster_url : media?.url;
        const isFollowing = !!item.author_id && followedProfiles.has(item.author_id);
        return <View style={styles.card}>
          <View style={styles.authorRow}>
            <Pressable onPress={() => onOpenPost(item.id)}>{item.author_avatar_url ? <Image source={{ uri: item.author_avatar_url }} style={styles.avatar} /> : <View style={styles.avatarFallback}><Text style={styles.avatarText}>{(item.author_name ?? 'M').slice(0, 1).toUpperCase()}</Text></View>}</Pressable>
            <Pressable onPress={() => onOpenPost(item.id)} style={{ flex: 1 }}><Text style={styles.author}>{item.author_name ?? 'Medosha'}</Text><Text style={styles.meta}>{[item.author_role, item.city].filter(Boolean).join(' • ') || item.kind || 'Post'}</Text></Pressable>
            {session?.user.id && item.author_id && item.author_id !== session.user.id ? <Pressable onPress={() => toggleFollow(item)} style={({ pressed }) => [styles.follow, isFollowing && styles.following, pressed && styles.pressed]}><Text style={styles.followText}>{isFollowing ? 'Following' : 'Follow'}</Text></Pressable> : null}
          </View>
          <Pressable onPress={() => onOpenPost(item.id)}>
            {item.title ? <Text style={styles.cardTitle}>{item.title}</Text> : null}
            {item.body ? <Text style={styles.body} numberOfLines={5}>{item.body}</Text> : null}
            {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.media} resizeMode="cover" /> : null}
            {item.price_amount ? <Text style={styles.price}>{item.price_currency ?? 'ETB'} {Number(item.price_amount).toLocaleString()}</Text> : null}
          </Pressable>
          <View style={styles.actions}>
            <Pressable onPress={() => toggleLike(item)} style={({ pressed }) => [styles.action, pressed && styles.pressed]}><Text style={[styles.actionText, liked.has(item.id) && styles.actionActive]}>{liked.has(item.id) ? '♥' : '☡'} {item.like_count ?? 0}</Text></Pressable>
            <Pressable onPress={() => onOpenPost(item.id)} style={({ pressed }) => [styles.action, pressed && styles.pressed]}><Text style={styles.actionText}>◯ {item.comment_count ?? 0}</Text></Pressable>
            <Pressable onPress={() => toggleSave(item)} style={({ pressed }) => [styles.action, pressed && styles.pressed]}><Text style={[styles.actionText, saved.has(item.id) && styles.actionActive]}>{saved.has(item.id) ? '★' : '☆'} Save</Text></Pressable>
            <Pressable onPress={() => sharePost(item)} style={({ pressed }) => [styles.action, pressed && styles.pressed]}><Text style={styles.actionText}>↗ Share</Text></Pressable>
          </View>
          <Text style={styles.topic}>{item.topic ?? item.kind ?? ''}</Text>
        </View>;
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 150 }, top: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 }, brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  logo: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' }, logoText: { color: '#fff', fontWeight: '900', fontSize: 24 }, brand: { color: colors.text, fontSize: 24, fontWeight: '900' }, tagline: { color: colors.muted, marginTop: 2, fontSize: 12 },
  search: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 15, color: colors.text, paddingHorizontal: 15, paddingVertical: 12, fontSize: 15 },
  feedTabs: { flexDirection: 'row', gap: 8, marginTop: 10 }, feedTab: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, backgroundColor: colors.surface }, feedTabActive: { backgroundColor: colors.blue }, feedTabText: { color: colors.muted, fontWeight: '800' }, feedTabTextActive: { color: '#fff' },
  quickRow: { flexDirection: 'row', gap: 10, marginTop: 12 }, quick: { flex: 1, backgroundColor: colors.surface2, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.border }, quickTitle: { color: colors.text, fontWeight: '800', fontSize: 14 }, quickBody: { color: colors.muted, marginTop: 4, fontSize: 11 }, error: { color: colors.danger, marginTop: 10 },
  card: { marginHorizontal: 14, marginTop: 10, backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', paddingTop: 14 }, authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 }, avatar: { width: 40, height: 40, borderRadius: 20 }, avatarFallback: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#fff', fontWeight: '800' }, author: { color: colors.text, fontWeight: '800', fontSize: 14 }, meta: { color: colors.muted, fontSize: 11, marginTop: 2 },
  follow: { borderWidth: 1, borderColor: colors.blue2, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 }, following: { backgroundColor: colors.white08, borderColor: colors.border }, followText: { color: colors.blue2, fontWeight: '800', fontSize: 12 },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '800', paddingHorizontal: 14, marginTop: 12 }, body: { color: '#D6E1EC', paddingHorizontal: 14, marginTop: 7, lineHeight: 21 }, media: { width: '100%', height: 230, marginTop: 13, backgroundColor: colors.surface2 }, price: { color: colors.blue2, fontSize: 18, fontWeight: '900', paddingHorizontal: 14, marginTop: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border, marginTop: 10, paddingHorizontal: 8, paddingTop: 4 }, action: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12 }, actionText: { color: colors.muted, fontSize: 11, fontWeight: '700' }, actionActive: { color: colors.blue2 }, topic: { color: colors.muted, fontSize: 10, paddingHorizontal: 14, paddingBottom: 12, textAlign: 'right' }, pressed: { opacity: 0.72 },
});

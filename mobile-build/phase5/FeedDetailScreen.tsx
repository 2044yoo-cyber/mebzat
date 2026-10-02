import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Image, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { colors } from '../theme';
import { EmptyState, LoadingState, PrimaryButton } from '../components/Ui';

type Post = {
  id: string; title: string | null; body: string | null; author_id: string | null; company_id: string | null; author_name: string | null; author_role: string | null;
  author_avatar_url: string | null; city: string | null; kind: string | null; topic: string | null;
  price_amount: number | string | null; price_currency: string | null; like_count: number | null; comment_count: number | null;
  save_count: number | null; share_count: number | null; published_at: string | null;
};
type Media = { id: string; url: string; poster_url: string | null; kind: string | null; position: number | null };
type Comment = { id: string; author_name: string | null; author_avatar_url: string | null; body: string; created_at: string | null; like_count: number | null };

export function FeedDetailScreen({ postId, session, onBack }: { postId: string; session: Session | null; onBack: () => void }) {
  const [post, setPost] = useState<Post | null>(null);
  const [media, setMedia] = useState<Media[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [following, setFollowing] = useState(false);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<{ full_name: string | null; username: string | null; avatar_url: string | null } | null>(null);

  async function trackView() {
    const uid = session?.user.id;
    if (!uid) return;
    const { data: existing } = await supabase.from('feed_views').select('seen_count').eq('post_id', postId).eq('user_id', uid).maybeSingle();
    if (existing) await supabase.from('feed_views').update({ seen_count: (existing.seen_count ?? 0) + 1, last_seen_at: new Date().toISOString() }).eq('post_id', postId).eq('user_id', uid);
    else await supabase.from('feed_views').insert({ post_id: postId, user_id: uid, seen_count: 1 });
  }

  async function load() {
    setLoading(true);
    const [{ data: p }, { data: m }, { data: c }] = await Promise.all([
      supabase.from('feed_posts').select('id,title,body,author_id,company_id,author_name,author_role,author_avatar_url,city,kind,topic,price_amount,price_currency,like_count,comment_count,save_count,share_count,published_at').eq('id', postId).maybeSingle(),
      supabase.from('feed_media').select('id,url,poster_url,kind,position').eq('post_id', postId).order('position', { ascending: true }),
      supabase.from('feed_comments').select('id,author_name,author_avatar_url,body,created_at,like_count').eq('post_id', postId).is('parent_id', null).order('created_at', { ascending: false }).limit(50),
    ]);
    const nextPost = (p ?? null) as Post | null;
    setPost(nextPost); setMedia((m ?? []) as Media[]); setComments((c ?? []) as Comment[]);

    if (session?.user.id) {
      const uid = session.user.id;
      const targetType = nextPost?.company_id ? 'company' : 'profile';
      const targetId = nextPost?.company_id ?? nextPost?.author_id;
      const requests: PromiseLike<any>[] = [
        supabase.from('feed_likes').select('post_id').eq('post_id', postId).eq('user_id', uid).maybeSingle(),
        supabase.from('feed_saves').select('post_id').eq('post_id', postId).eq('user_id', uid).maybeSingle(),
        supabase.from('profiles').select('full_name,username,avatar_url').eq('id', uid).maybeSingle(),
      ];
      if (targetId) requests.push(supabase.from('follows').select('target_id').eq('follower_id', uid).eq('target_type', targetType).eq('target_id', targetId).maybeSingle());
      const results = await Promise.all(requests);
      setLiked(Boolean(results[0].data)); setSaved(Boolean(results[1].data)); setProfile(results[2].data ?? null); setFollowing(targetId ? Boolean(results[3]?.data) : false);
    } else {
      setLiked(false); setSaved(false); setFollowing(false); setProfile(null);
    }
    setLoading(false);
  }

  useEffect(() => { load(); trackView(); }, [postId, session?.user.id]);

  async function toggleLike() {
    if (!session?.user.id) return Alert.alert('Sign in required', 'Sign in from More to like posts.');
    setBusy(true);
    const result = liked ? await supabase.from('feed_likes').delete().eq('post_id', postId).eq('user_id', session.user.id) : await supabase.from('feed_likes').insert({ post_id: postId, user_id: session.user.id });
    setBusy(false); if (result.error) return Alert.alert('Could not update like', result.error.message);
    setLiked(!liked); setPost((p) => p ? { ...p, like_count: Math.max(0, (p.like_count ?? 0) + (liked ? -1 : 1)) } : p);
  }

  async function toggleSave() {
    if (!session?.user.id) return Alert.alert('Sign in required', 'Sign in from More to save posts.');
    setBusy(true);
    const result = saved ? await supabase.from('feed_saves').delete().eq('post_id', postId).eq('user_id', session.user.id) : await supabase.from('feed_saves').insert({ post_id: postId, user_id: session.user.id });
    setBusy(false); if (result.error) return Alert.alert('Could not update save', result.error.message);
    setSaved(!saved); setPost((p) => p ? { ...p, save_count: Math.max(0, (p.save_count ?? 0) + (saved ? -1 : 1)) } : p);
  }

  async function toggleFollow() {
    if (!session?.user.id || !post) return Alert.alert('Sign in required', 'Sign in from More to follow people and companies.');
    const targetType = post.company_id ? 'company' : 'profile'; const targetId = post.company_id ?? post.author_id;
    if (!targetId || targetId === session.user.id) return;
    setBusy(true);
    const result = following
      ? await supabase.from('follows').delete().eq('follower_id', session.user.id).eq('target_type', targetType).eq('target_id', targetId)
      : await supabase.from('follows').insert({ follower_id: session.user.id, target_type: targetType, target_id: targetId });
    setBusy(false); if (result.error) return Alert.alert('Could not update follow', result.error.message); setFollowing(!following);
  }

  async function sharePost() {
    if (!post) return;
    await Share.share({ message: [post.title, post.body?.slice(0, 240), 'Medosha'].filter(Boolean).join('\n\n') });
  }

  async function addComment() {
    const body = comment.trim(); if (!session?.user.id) return Alert.alert('Sign in required', 'Sign in from More to comment.'); if (!body) return;
    setBusy(true); const authorName = profile?.full_name || profile?.username || session.user.email?.split('@')[0] || 'Medosha user';
    const { error } = await supabase.from('feed_comments').insert({ post_id: postId, author_id: session.user.id, author_name: authorName, author_avatar_url: profile?.avatar_url ?? null, body });
    setBusy(false); if (error) return Alert.alert('Comment failed', error.message); setComment(''); await load();
  }

  const hero = useMemo(() => { const first = media[0]; return first?.kind === 'video' ? first.poster_url : first?.url; }, [media]);
  if (loading) return <LoadingState label="Loading post…" />;
  if (!post) return <View style={{ flex: 1 }}><TopBar title="Post" onBack={onBack} /><EmptyState title="Post unavailable" /></View>;
  const canFollow = Boolean((post.company_id ?? post.author_id) && (post.company_id ?? post.author_id) !== session?.user.id);

  return <FlatList
    data={comments} keyExtractor={(x) => x.id} contentContainerStyle={{ paddingBottom: 48 }}
    ListHeaderComponent={<><TopBar title="Post" onBack={onBack} /><View style={styles.card}>
      <View style={styles.authorRow}>{post.author_avatar_url ? <Image source={{ uri: post.author_avatar_url }} style={styles.avatar} /> : <View style={styles.avatarFallback}><Text style={styles.avatarText}>{(post.author_name || 'M')[0]}</Text></View>}<View style={{ flex: 1 }}><Text style={styles.author}>{post.author_name || 'Medosha'}</Text><Text style={styles.meta}>{[post.author_role, post.city].filter(Boolean).join(' • ') || post.kind || 'Post'}</Text></View>{canFollow ? <Pressable disabled={busy} onPress={toggleFollow} style={({ pressed }) => [styles.follow, following && styles.following, pressed && styles.pressed]}><Text style={[styles.followText, following && styles.followTextActive]}>{following ? 'Following' : 'Follow'}</Text></Pressable> : null}</View>
      {post.title ? <Text style={styles.title}>{post.title}</Text> : null}{post.body ? <Text style={styles.body}>{post.body}</Text> : null}{hero ? <Image source={{ uri: hero }} style={styles.hero} resizeMode="cover" /> : null}{post.price_amount ? <Text style={styles.price}>{post.price_currency || 'ETB'} {Number(post.price_amount).toLocaleString()}</Text> : null}
      <View style={styles.actions}><Pressable disabled={busy} onPress={toggleLike} style={({ pressed }) => [styles.action, pressed && styles.pressed]}><Text style={[styles.actionText, liked && styles.active]}>♥ {post.like_count ?? 0}</Text></Pressable><Pressable disabled={busy} onPress={toggleSave} style={({ pressed }) => [styles.action, pressed && styles.pressed]}><Text style={[styles.actionText, saved && styles.active]}>{saved ? '★ Saved' : '☆ Save'}</Text></Pressable><Pressable onPress={sharePost} style={({ pressed }) => [styles.action, pressed && styles.pressed]}><Text style={styles.actionText}>↗ Share</Text></Pressable></View>
    </View><View style={styles.commentComposer}><Text style={styles.sectionTitle}>Comments</Text>{session ? <><TextInput value={comment} onChangeText={setComment} placeholder="Write a comment…" placeholderTextColor={colors.muted} multiline style={styles.input} /><PrimaryButton label={busy ? 'Posting…' : 'Post comment'} onPress={addComment} disabled={busy || !comment.trim()} /></> : <Text style={styles.meta}>Sign in from More to join the discussion.</Text>}</View></>}
    ListEmptyComponent={<Text style={styles.noComments}>No comments yet.</Text>}
    renderItem={({ item }) => <View style={styles.comment}><View style={styles.commentAvatar}><Text style={styles.avatarText}>{(item.author_name || 'M')[0]}</Text></View><View style={{ flex: 1 }}><Text style={styles.commentAuthor}>{item.author_name || 'Medosha user'}</Text><Text style={styles.commentBody}>{item.body}</Text><Text style={styles.commentMeta}>{item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}{item.like_count ? ` • ♥ ${item.like_count}` : ''}</Text></View></View>}
  />;
}

function TopBar({ title, onBack }: { title: string; onBack: () => void }) { return <View style={styles.topbar}><Pressable onPress={onBack} style={({ pressed }) => [styles.back, pressed && styles.pressed]}><Text style={styles.backText}>‹</Text></Pressable><Text style={styles.topTitle}>{title}</Text><View style={{ width: 42 }} /></View>; }

const styles = StyleSheet.create({
  topbar: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, back: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }, backText: { color: colors.text, fontSize: 34, lineHeight: 36 }, topTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  card: { margin: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 20, overflow: 'hidden', paddingTop: 14 }, authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 }, avatar: { width: 42, height: 42, borderRadius: 21 }, avatarFallback: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#fff', fontWeight: '900' }, author: { color: colors.text, fontWeight: '800' }, meta: { color: colors.muted, fontSize: 12, marginTop: 3 },
  follow: { borderWidth: 1, borderColor: colors.blue2, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999 }, following: { backgroundColor: '#173654', borderColor: colors.border }, followText: { color: colors.blue2, fontWeight: '800', fontSize: 12 }, followTextActive: { color: colors.text },
  title: { color: colors.text, fontSize: 21, lineHeight: 28, fontWeight: '900', paddingHorizontal: 14, marginTop: 14 }, body: { color: '#D8E2ED', fontSize: 15, lineHeight: 23, paddingHorizontal: 14, marginTop: 9 }, hero: { width: '100%', height: 280, marginTop: 14, backgroundColor: colors.surface2 }, price: { color: colors.blue2, fontSize: 20, fontWeight: '900', paddingHorizontal: 14, marginTop: 13 },
  actions: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginTop: 14 }, action: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center' }, actionText: { color: colors.muted, fontWeight: '800', fontSize: 12 }, active: { color: colors.blue2 }, pressed: { opacity: 0.65 },
  commentComposer: { marginHorizontal: 14, marginTop: 3, gap: 10 }, sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '900' }, input: { minHeight: 76, maxHeight: 130, color: colors.text, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 15, padding: 13, textAlignVertical: 'top' }, noComments: { color: colors.muted, textAlign: 'center', padding: 28 }, comment: { marginHorizontal: 14, marginTop: 10, padding: 13, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', gap: 10 }, commentAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' }, commentAuthor: { color: colors.text, fontWeight: '800', fontSize: 13 }, commentBody: { color: '#D8E2ED', lineHeight: 20, marginTop: 4 }, commentMeta: { color: colors.muted, fontSize: 11, marginTop: 7 },
});

import React from 'react';
import { createRoot } from 'react-dom/client';
import { House, Compass, PlusSquare, MessageCircle, Bell, UserRound, Heart, MessageSquare, Share2, Bookmark, Send, Search, RefreshCw } from 'lucide-react';
import { supabase, supabaseConfigured } from './supabase.js';
import './style.css';

const APP_URL = 'https://jerricksmith92-web.github.io/VYBORA-/';

function App() {
  const [tab, setTab] = React.useState('Home');
  const [liked, setLiked] = React.useState({});
  const [commentOpen, setCommentOpen] = React.useState({});
  const [commentsByPost, setCommentsByPost] = React.useState({});
  const [commentDrafts, setCommentDrafts] = React.useState({});
  const [commentBusy, setCommentBusy] = React.useState({});
  const [engagementError, setEngagementError] = React.useState('');
  const [draft, setDraft] = React.useState('');
  const [posts, setPosts] = React.useState([]);
  const [postBusy, setPostBusy] = React.useState(false);
  const [postError, setPostError] = React.useState('');
  const [postImage, setPostImage] = React.useState(null);
  const [postMediaType, setPostMediaType] = React.useState('');
  const [postImagePreview, setPostImagePreview] = React.useState('');
  const postFileRef = React.useRef(null);
  const [session, setSession] = React.useState(null);
  const [authMode, setAuthMode] = React.useState('signin');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [authBusy, setAuthBusy] = React.useState(false);
  const [authMessage, setAuthMessage] = React.useState('');

  const [chatLoading, setChatLoading] = React.useState(false);
  const [chatError, setChatError] = React.useState('');
  const [chatNotice, setChatNotice] = React.useState('');
  const [chatList, setChatList] = React.useState([]);
  const [activeChatId, setActiveChatId] = React.useState('');
  const [chatMessages, setChatMessages] = React.useState([]);
  const [messageDraft, setMessageDraft] = React.useState('');
  const [sendingMessage, setSendingMessage] = React.useState(false);
  const [profileSearch, setProfileSearch] = React.useState('');
  const [profiles, setProfiles] = React.useState([]);
  const [startingChatId, setStartingChatId] = React.useState('');
  const [activeStory, setActiveStory] = React.useState(null);
  const [exploreSearch, setExploreSearch] = React.useState('');
  const [notifications, setNotifications] = React.useState([]);
  const [notificationError, setNotificationError] = React.useState('');
  const [notificationLoading, setNotificationLoading] = React.useState(false);
  const [highlightedPostId, setHighlightedPostId] = React.useState('');

  React.useEffect(() => {
    if (!supabase) return undefined;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setChatList([]);
      setChatMessages([]);
      setActiveChatId('');
    });
    return () => subscription.unsubscribe();
  }, []);

  React.useEffect(() => {
    if (tab === 'Notifications' && session?.user?.id && supabase) loadNotifications();
  }, [tab, session?.user?.id]);

  React.useEffect(() => {
    if (!supabase || !session?.user?.id) return undefined;
    const channel = supabase.channel('vybora-notifications-' + session.user.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: 'recipient_id=eq.' + session.user.id
      }, () => { loadNotifications(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id]);

  React.useEffect(() => {
    if (tab !== 'Home' || !highlightedPostId) return;
    const target = document.getElementById('post-' + highlightedPostId);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('post-highlight');
      const timer = setTimeout(() => target.classList.remove('post-highlight'), 2400);
      setHighlightedPostId('');
      return () => clearTimeout(timer);
    }
  }, [tab, highlightedPostId, posts]);

  React.useEffect(() => {
    if (tab === 'Messages' && session && supabase) {
      loadChats();
      loadProfiles();
    }
  }, [tab, session?.user?.id]);

  React.useEffect(() => {
    if (session?.user?.id && supabase) loadPosts();
    else setPosts([]);
  }, [session?.user?.id]);

  React.useEffect(() => {
    return () => {
      if (postImagePreview) URL.revokeObjectURL(postImagePreview);
    };
  }, [postImagePreview]);

  async function loadPosts() {
    if (!supabase) return;
    setPostError('');
    const { data, error } = await supabase
      .from('posts')
      .select('id,user_id,content,image_url,created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      setPostError('Posts are not connected yet. Run the VYBORA social setup SQL in your Supabase SQL Editor. ' + error.message);
      return;
    }
    const postRows = data || [];
    const postIds = postRows.map((post) => post.id);
    const userIds = [...new Set(postRows.map((post) => post.user_id).filter(Boolean))];
    let profileRows = [];
    if (userIds.length) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id,username,display_name,avatar_url')
        .in('id', userIds);
      profileRows = profileData || [];
    }
    const profileMap = Object.fromEntries(profileRows.map((profile) => [profile.id, profile]));
    let likeRows = [];
    let commentRows = [];
    setEngagementError('');
    if (postIds.length) {
      const [{ data: likesData, error: likesError }, { data: commentsData, error: commentsError }] = await Promise.all([
        supabase.from('post_likes').select('post_id,user_id').in('post_id', postIds),
        supabase.from('post_comments').select('id,post_id,user_id,content,created_at').in('post_id', postIds).order('created_at', { ascending: true })
      ]);
      if (likesError || commentsError) {
        setEngagementError('Likes and comments need one-time database setup. Run supabase/social_engagement_setup.sql in Supabase SQL Editor.');
      } else {
        likeRows = likesData || [];
        commentRows = commentsData || [];
      }
    }
    const nextLiked = {};
    likeRows.forEach((like) => { if (like.user_id === session?.user?.id) nextLiked[like.post_id] = true; });
    setLiked(nextLiked);
    const likeCounts = {};
    likeRows.forEach((like) => { likeCounts[like.post_id] = (likeCounts[like.post_id] || 0) + 1; });
    const commentCounts = {};
    commentRows.forEach((comment) => { commentCounts[comment.post_id] = (commentCounts[comment.post_id] || 0) + 1; });
    setPosts(postRows.map((post) => {
      const profile = profileMap[post.user_id] || {};
      return {
        id: post.id,
        user: profile.display_name || profile.username || 'VYBORA member',
        handle: profile.username ? '@' + profile.username : 'community member',
        time: post.created_at ? new Date(post.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'just now',
        text: post.content || '',
        image_url: post.image_url || '',
        likes: likeCounts[post.id] || 0,
        comments: commentCounts[post.id] || 0
      };
    }));
    if (commentRows.length) {
      const commenterIds = [...new Set(commentRows.map((comment) => comment.user_id).filter(Boolean))];
      let commenterRows = [];
      if (commenterIds.length) {
        const { data: commenters } = await supabase.from('profiles').select('id,username,display_name').in('id', commenterIds);
        commenterRows = commenters || [];
      }
      const commenterMap = Object.fromEntries(commenterRows.map((profile) => [profile.id, profile]));
      const grouped = {};
      commentRows.forEach((comment) => {
        const profile = commenterMap[comment.user_id] || {};
        if (!grouped[comment.post_id]) grouped[comment.post_id] = [];
        grouped[comment.post_id].push({ ...comment, user: profile.display_name || profile.username || 'VYBORA member' });
      });
      setCommentsByPost(grouped);
    } else setCommentsByPost({});
  }

  async function toggleLike(post) {
    if (!session?.user?.id || !supabase) {
      setPostError('Sign in to like posts.');
      setTab('Profile');
      return;
    }
    const wasLiked = !!liked[post.id];
    setLiked((current) => ({ ...current, [post.id]: !wasLiked }));
    setPosts((current) => current.map((item) => item.id === post.id ? { ...item, likes: Math.max(0, item.likes + (wasLiked ? -1 : 1)) } : item));
    setEngagementError('');
    const result = wasLiked
      ? await supabase.from('post_likes').delete().eq('post_id', post.id).eq('user_id', session.user.id)
      : await supabase.from('post_likes').insert({ post_id: post.id, user_id: session.user.id });
    if (result.error) {
      setLiked((current) => ({ ...current, [post.id]: wasLiked }));
      setPosts((current) => current.map((item) => item.id === post.id ? { ...item, likes: Math.max(0, item.likes + (wasLiked ? 1 : -1)) } : item));
      setEngagementError(result.error.message.includes('post_likes') ? 'Run the VYBORA social engagement SQL in Supabase to enable likes and comments.' : result.error.message);
    }
  }

  async function toggleComments(post) {
    const opening = !commentOpen[post.id];
    setCommentOpen((current) => ({ ...current, [post.id]: opening }));
    if (!opening || commentsByPost[post.id]) return;
    if (!supabase) return;
    const { data, error } = await supabase.from('post_comments')
      .select('id,post_id,user_id,content,created_at')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true });
    if (error) {
      setEngagementError('Run the VYBORA social engagement SQL in Supabase to enable comments.');
      return;
    }
    const userIds = [...new Set((data || []).map((comment) => comment.user_id).filter(Boolean))];
    let rows = [];
    if (userIds.length) {
      const { data: profilesData } = await supabase.from('profiles').select('id,username,display_name').in('id', userIds);
      rows = profilesData || [];
    }
    const map = Object.fromEntries(rows.map((profile) => [profile.id, profile]));
    setCommentsByPost((current) => ({ ...current, [post.id]: (data || []).map((comment) => ({
      ...comment, user: map[comment.user_id]?.display_name || map[comment.user_id]?.username || 'VYBORA member'
    })) }));
  }

  async function submitComment(event, post) {
    event.preventDefault();
    const content = (commentDrafts[post.id] || '').trim();
    if (!content || !session?.user?.id || !supabase || commentBusy[post.id]) {
      if (!session?.user?.id) { setPostError('Sign in to comment.'); setTab('Profile'); }
      return;
    }
    setCommentBusy((current) => ({ ...current, [post.id]: true }));
    setEngagementError('');
    try {
      const { data, error } = await supabase.from('post_comments')
        .insert({ post_id: post.id, user_id: session.user.id, content })
        .select('id,post_id,user_id,content,created_at')
        .single();
      if (error) throw error;
      const profile = await supabase.from('profiles').select('username,display_name').eq('id', session.user.id).maybeSingle();
      const user = profile.data?.display_name || profile.data?.username || 'VYBORA member';
      setCommentsByPost((current) => ({ ...current, [post.id]: [...(current[post.id] || []), { ...data, user }] }));
      setPosts((current) => current.map((item) => item.id === post.id ? { ...item, comments: item.comments + 1 } : item));
      setCommentDrafts((current) => ({ ...current, [post.id]: '' }));
    } catch (err) {
      setEngagementError(err.message || 'Could not add your comment.');
    } finally {
      setCommentBusy((current) => ({ ...current, [post.id]: false }));
    }
  }

  async function loadNotifications() {
    if (!supabase || !session?.user?.id) return;
    setNotificationLoading(true);
    setNotificationError('');
    try {
      const { data, error } = await supabase.from('notifications')
        .select('id,recipient_id,actor_id,post_id,type,comment_id,is_read,created_at')
        .eq('recipient_id', session.user.id).order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      const rows = data || [];
      const actorIds = [...new Set(rows.map((row) => row.actor_id).filter(Boolean))];
      const postIds = [...new Set(rows.map((row) => row.post_id).filter(Boolean))];
      const [{ data: actorData }, { data: postData }] = await Promise.all([
        actorIds.length ? supabase.from('profiles').select('id,username,display_name,avatar_url').in('id', actorIds) : Promise.resolve({ data: [] }),
        postIds.length ? supabase.from('posts').select('id,content,image_url,user_id').in('id', postIds) : Promise.resolve({ data: [] })
      ]);
      const actorMap = Object.fromEntries((actorData || []).map((profile) => [profile.id, profile]));
      const postMap = Object.fromEntries((postData || []).map((post) => [post.id, post]));
      setNotifications(rows.map((row) => {
        const actor = actorMap[row.actor_id] || {};
        const post = postMap[row.post_id] || {};
        return { ...row, actorName: actor.display_name || actor.username || 'Someone',
          postText: post.content || '', postOwnerId: post.user_id || '' };
      }));
    } catch (err) {
      setNotificationError('Could not load notifications. Run supabase/notifications_setup.sql in Supabase SQL Editor. ' + (err.message || ''));
    } finally {
      setNotificationLoading(false);
    }
  }

  async function openNotification(notification) {
    if (!notification?.post_id) return;
    if (!notification.is_read && supabase) {
      const { error } = await supabase.from('notifications').update({ is_read: true })
        .eq('id', notification.id).eq('recipient_id', session.user.id);
      if (!error) setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, is_read: true } : item));
    }
    setHighlightedPostId(notification.post_id);
    setTab('Home');
  }

  function choosePostImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) {
      setPostError('Choose a photo or video from your library.');
      event.target.value = '';
      return;
    }
    const maxSize = isVideo ? 50 * 1024 * 1024 : 8 * 1024 * 1024;
    if (file.size > maxSize) {
      setPostError(isVideo ? 'Video must be 50 MB or smaller.' : 'Photo must be 8 MB or smaller.');
      event.target.value = '';
      return;
    }
    setPostError('');
    setPostImage(file);
    setPostMediaType(isVideo ? 'video' : 'image');
    setPostImagePreview(URL.createObjectURL(file));
  }

  async function publishPost() {
    const content = draft.trim();
    if (!session?.user?.id || !supabase) {
      setPostError('Sign in first to publish a post.');
      setTab('Profile');
      return;
    }
    if (!content && !postImage) {
      setPostError('Write something or add a photo or video before posting.');
      return;
    }
    setPostBusy(true);
    setPostError('');
    try {
      let imageUrl = '';
      if (postImage) {
        const extension = (postImage.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        const path = session.user.id + '/' + crypto.randomUUID() + '.' + extension;
        const { error: uploadError } = await supabase.storage.from('post-media').upload(path, postImage, {
          cacheControl: '3600',
          upsert: false,
          contentType: postImage.type
        });
        if (uploadError) throw uploadError;
        imageUrl = supabase.storage.from('post-media').getPublicUrl(path).data.publicUrl;
      }
      const { error: insertError } = await supabase.from('posts').insert({
        user_id: session.user.id,
        content,
        image_url: imageUrl || null
      });
      if (insertError) throw insertError;
      setDraft('');
      setPostImage(null);
      setPostMediaType('');
      setPostImagePreview('');
      if (postFileRef.current) postFileRef.current.value = '';
      await loadPosts();
    } catch (err) {
      setPostError(err.message || 'Could not publish your post. Check the Supabase setup and try again.');
    } finally {
      setPostBusy(false);
    }
  }

  React.useEffect(() => {
    if (!supabase || !session || !activeChatId) {
      setChatMessages([]);
      return undefined;
    }
    loadMessages(activeChatId);
    const channel = supabase
      .channel('vybora-chat-' + activeChatId)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: 'conversation_id=eq.' + activeChatId
      }, (payload) => {
        if (payload.eventType === 'INSERT' && payload.new) {
          setChatMessages((current) => {
            if (current.some((message) => message.id === payload.new.id)) return current;
            return [...current, payload.new].sort((a, b) => {
              const at = new Date(a.created_at || 0).getTime();
              const bt = new Date(b.created_at || 0).getTime();
              return at - bt;
            });
          });
        } else if (payload.eventType === 'UPDATE' && payload.new) {
          setChatMessages((current) => current.map((message) => message.id === payload.new.id ? payload.new : message));
        } else if (payload.eventType === 'DELETE' && payload.old) {
          setChatMessages((current) => current.filter((message) => message.id !== payload.old.id));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeChatId, session?.user?.id]);

  async function handleAuth(e) {
    e.preventDefault();
    if (!supabase) {
      setAuthMessage('Supabase is not configured yet. Check the GitHub Actions build variables.');
      return;
    }
    setAuthBusy(true);
    setAuthMessage('');
    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: APP_URL }
        });
        if (error) throw error;
        if (data.session) {
          setSession(data.session);
          setAuthMessage('Account created successfully!');
        } else {
          setAuthMessage('Check your email for a confirmation link, then sign in.');
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        setSession(data.session);
        setAuthMessage('You are signed in.');
      }
    } catch (err) {
      setAuthMessage(err.message || 'Could not complete authentication. Please try again.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
    setAuthMessage('You have signed out.');
    setTab('Profile');
  }

  async function loadChats() {
    if (!supabase || !session?.user?.id) return;
    setChatLoading(true);
    setChatError('');
    try {
      const { data: memberships, error: memberError } = await supabase
        .from('conversation_members')
        .select('conversation_id,user_id')
        .eq('user_id', session.user.id);
      if (memberError) throw memberError;
      const ids = [...new Set((memberships || []).map((row) => row.conversation_id).filter(Boolean))];
      if (!ids.length) {
        setChatList([]);
        setActiveChatId('');
        return;
      }
      const { data: conversations, error: conversationError } = await supabase
        .from('conversations')
        .select('id,is_group,title,created_at')
        .in('id', ids);
      if (conversationError) throw conversationError;
      const { data: allMembers, error: allMembersError } = await supabase
        .from('conversation_members')
        .select('conversation_id,user_id')
        .in('conversation_id', ids);
      if (allMembersError) throw allMembersError;
      const memberIds = [...new Set((allMembers || []).map((row) => row.user_id).filter((id) => id && id !== session.user.id))];
      let profileRows = [];
      if (memberIds.length) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id,username,display_name,avatar_url')
          .in('id', memberIds);
        if (error) throw error;
        profileRows = data || [];
      }
      const profileMap = Object.fromEntries(profileRows.map((profile) => [profile.id, profile]));
      const membersByConversation = {};
      (allMembers || []).forEach((member) => {
        if (!membersByConversation[member.conversation_id]) membersByConversation[member.conversation_id] = [];
        membersByConversation[member.conversation_id].push(member.user_id);
      });
      const formatted = (conversations || []).map((conversation) => {
        const otherIds = (membersByConversation[conversation.id] || []).filter((id) => id !== session.user.id);
        const otherProfiles = otherIds.map((id) => profileMap[id]).filter(Boolean);
        const label = conversation.is_group
          ? (conversation.title || 'Group conversation')
          : (otherProfiles[0]?.display_name || otherProfiles[0]?.username || 'Conversation');
        return { ...conversation, label, otherProfiles, memberIds: membersByConversation[conversation.id] || [] };
      }).sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      setChatList(formatted);
      setActiveChatId((current) => formatted.some((chat) => chat.id === current) ? current : (formatted[0]?.id || ''));
    } catch (err) {
      setChatError(err.message || 'Could not load conversations.');
    } finally {
      setChatLoading(false);
    }
  }

  async function loadProfiles() {
    if (!supabase || !session?.user?.id) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('id,username,display_name,avatar_url')
      .neq('id', session.user.id)
      .limit(100);
    if (error) {
      setChatError((current) => current || error.message || 'Could not load profiles.');
      return;
    }
    setProfiles(data || []);
  }

  async function loadMessages(conversationId) {
    if (!supabase || !conversationId) return;
    const { data, error } = await supabase
      .from('messages')
      .select('id,conversation_id,sender_id,body,created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (error) {
      setChatError(error.message || 'Could not load messages.');
      return;
    }
    setChatMessages(data || []);
  }

  async function sendMessage(e) {
    e.preventDefault();
    const body = messageDraft.trim();
    if (!body || !activeChatId || !session?.user?.id || !supabase || sendingMessage) return;
    setSendingMessage(true);
    setChatError('');
    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          id: crypto.randomUUID(),
          conversation_id: activeChatId,
          sender_id: session.user.id,
          body
        })
        .select('id,conversation_id,sender_id,body,created_at')
        .single();
      if (error) throw error;
      setChatMessages((current) => current.some((message) => message.id === data.id) ? current : [...current, data]);
      setMessageDraft('');
    } catch (err) {
      setChatError(err.message || 'Message could not be sent.');
    } finally {
      setSendingMessage(false);
    }
  }

  async function startConversation(profile) {
    if (!supabase || !session?.user?.id || startingChatId) return;
    setStartingChatId(profile.id);
    setChatError('');
    setChatNotice('');
    try {
      const { data, error } = await supabase.rpc('start_direct_conversation', { other_user_id: profile.id });
      if (error) throw error;
      const conversationId = typeof data === 'string' ? data : data?.id;
      if (!conversationId) throw new Error('The database did not return a conversation ID.');
      await loadChats();
      setActiveChatId(conversationId);
      setChatNotice('Conversation ready. You can send a message now.');
      setProfileSearch('');
    } catch (err) {
      setChatError(err.message || 'Could not start the conversation.');
    } finally {
      setStartingChatId('');
    }
  }

  const activeChat = chatList.find((chat) => chat.id === activeChatId);
  const filteredProfiles = profiles.filter((profile) => {
    const needle = profileSearch.trim().toLowerCase();
    if (!needle) return false;
    return [profile.username, profile.display_name].some((value) => (value || '').toLowerCase().includes(needle));
  });

  return <div className="app">
    <header>
      <button className="brand" onClick={() => setTab('Home')} aria-label="VYBORA home"><span className="logo">v.</span><span>vybora</span></button>
      <span className="tag">YOUR WORLD, YOUR PEOPLE</span>
      <button className="avatar header-avatar" onClick={() => setTab('Profile')} aria-label="Open profile">{session?.user?.email?.[0]?.toUpperCase() || 'V'}</button>
    </header>
    <nav>{['Home', 'Explore', 'Messages', 'Notifications', 'Profile'].map((t) =>
      <button className={tab === t ? 'active' : ''} onClick={() => setTab(t)} key={t}>
        {({ Home: <House size={18} fill="currentColor" strokeWidth={1.8} />, Explore: <Compass size={18} fill="currentColor" strokeWidth={1.8} />, Messages: <MessageCircle size={18} fill="currentColor" strokeWidth={1.8} />, Notifications: <Bell size={18} fill="currentColor" strokeWidth={1.8} />, Profile: <UserRound size={18} fill="currentColor" strokeWidth={1.8} /> })[t]} <span>{t}</span>{t === 'Notifications' && notifications.filter((n) => !n.is_read).length > 0 && <i className="nav-unread-count">{notifications.filter((n) => !n.is_read).length > 99 ? '99+' : notifications.filter((n) => !n.is_read).length}</i>}
      </button>
    )}</nav>
    <main>
      <section className="welcome">
        <p className="eyebrow">YOUR SPACE. YOUR PEOPLE.</p>
        <h1>Stay close to<br /><em>your world.</em></h1>
        <p className="muted">Share your moments. Find your people. Be yourself.</p>
        <div className="pills"><span>✦ Your community</span><span>◉ Real moments</span></div>
      </section>

      {tab === 'Home' ? <>
        <section className="stories">
          <div className="sectionhead"><h2>Stories</h2><span>See all →</span></div>
          <div className="storyrow">{['You', 'Ama', 'Kojo', 'Abena', 'Kwame'].map((n, i) =>
            <button className="story" key={n} onClick={() => setActiveStory({ name: n, initial: ['＋', 'A', 'K', 'A', 'K'][i], own: i === 0 })}>
              <div className={'ring ring' + i}><span>{['＋', 'A', 'K', 'A', 'K'][i]}</span></div><small>{n}</small>
            </button>
          )}</div>
        </section>
        <section className="composer">
          <div className="avatar">{session?.user?.email?.[0]?.toUpperCase() || 'V'}</div>
          <div className="composebody">
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={session ? "What's happening in your world?" : "Sign in to share with your world…"} />
            {postImagePreview && <div className="post-image-preview">{postMediaType === 'video' ? <video src={postImagePreview} controls playsInline preload="metadata" /> : <img src={postImagePreview} alt="Post preview" />}<button type="button" onClick={() => { setPostImage(null); setPostMediaType(''); setPostImagePreview(''); if (postFileRef.current) postFileRef.current.value = ''; }}>Remove media ×</button></div>}
            <input ref={postFileRef} className="visually-hidden-file" type="file" accept="image/*,video/*" onChange={choosePostImage} />
            <div className="composefoot"><button className="photo-pick" type="button" onClick={() => { setPostError(''); postFileRef.current?.click(); }}>＋ Photo / Video</button><span>✧ Share a moment</span><button onClick={publishPost} disabled={postBusy}>{postBusy ? 'Posting…' : 'Post ↗'}</button></div>
          </div>
        </section>
        {postError && <p className="post-alert" role="alert">{postError}</p>}
        <section className="feed">
          <div className="sectionhead"><h2>Your feed</h2><button className="refresh-button" onClick={loadPosts}><RefreshCw size={14} /> Refresh</button></div>
          {engagementError && <p className="post-alert" role="alert">{engagementError}</p>}
          {posts.length ? posts.map((p) => <article className={'post ' + (highlightedPostId === p.id ? 'post-highlight' : '')} id={'post-' + p.id} key={p.id}>
            <div className="posthead"><div className="avatar">{p.user?.[0]?.toUpperCase() || 'V'}</div><div><b>{p.user}</b><small>{p.handle} · {p.time}</small></div><button className="dots" aria-label="More post options">•••</button></div>
            {p.text && <p className="posttext">{p.text}</p>}
            {p.image_url && (p.image_url.match(/\.(mp4|mov|webm|m4v)(\?|$)/i) ? <video className="post-image post-video" src={p.image_url} controls playsInline preload="metadata" /> : <img className="post-image" src={p.image_url} alt={'Photo shared by ' + p.user} loading="lazy" />)}
            <div className="postactions">
              <button onClick={() => toggleLike(p)} className={liked[p.id] ? 'liked' : ''}>{liked[p.id] ? <Heart size={17} fill="currentColor" /> : <Heart size={17} />} {p.likes}</button>
              <button onClick={() => toggleComments(p)}><MessageSquare size={16} fill="currentColor" /> Comment {p.comments || 0}</button>
              <button onClick={() => { if (p.image_url) { navigator.clipboard?.writeText(p.image_url); setChatNotice('Post media link copied when clipboard access is available.'); } else setChatNotice('Share links are coming in a future VYBORA update.'); }}><Share2 size={16} fill="currentColor" /> Share</button>
              <button onClick={(e) => e.currentTarget.classList.toggle('saved')}><Bookmark size={16} fill="currentColor" /> Save</button>
            </div>
            {commentOpen[p.id] && <section className="comments-panel" aria-label="Post comments">
              <div className="comments-list">{(commentsByPost[p.id] || []).length ? commentsByPost[p.id].map((comment) => <div className="comment-item" key={comment.id}><span className="comment-avatar">{comment.user?.[0]?.toUpperCase() || 'V'}</span><div><b>{comment.user}</b><p>{comment.content}</p><small>{comment.created_at ? new Date(comment.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'just now'}</small></div></div>) : <p className="comments-empty">No comments yet. Start the conversation ✦</p>}</div>
              <form className="comment-composer" onSubmit={(event) => submitComment(event, p)}>
                <input value={commentDrafts[p.id] || ''} onChange={(event) => setCommentDrafts((current) => ({ ...current, [p.id]: event.target.value }))} placeholder={session ? 'Write a comment…' : 'Sign in to comment…'} maxLength={1000} aria-label="Write a comment" />
                <button type="submit" disabled={!!commentBusy[p.id] || !(commentDrafts[p.id] || '').trim()}>{commentBusy[p.id] ? 'Sending…' : 'Send'}</button>
              </form>
            </section>}
          </article>) : <div className="feed-empty"><span>✦</span><b>Your feed starts here</b><p>Share the first moment with your people.</p></div>}
        </section>
      </> : tab === 'Messages' ? <section className="messages-panel">
        <div className="messages-heading"><div><p className="eyebrow">PRIVATE CONVERSATIONS</p><h2>Messages</h2></div><button className="refresh-button" onClick={() => { loadChats(); loadProfiles(); }}>Refresh</button></div>
        {!session ? <div className="chat-empty"><div className="bigicon">✉</div><h3>Sign in to message</h3><p>Your conversations will appear here after you sign in.</p><button onClick={() => setTab('Profile')}>Go to sign in</button></div> : <>
          {chatError && <p className="chat-alert" role="alert">{chatError}</p>}
          {chatNotice && <p className="chat-notice" role="status">{chatNotice}</p>}
          <div className="new-chat">
            <label htmlFor="profile-search">Start a conversation</label>
            <input id="profile-search" value={profileSearch} onChange={(e) => setProfileSearch(e.target.value)} placeholder="Search username or display name" />
            {profileSearch.trim() && <div className="profile-results">
              {filteredProfiles.length ? filteredProfiles.map((profile) => <div className="profile-result" key={profile.id}>
                <div className="mini-avatar">{(profile.display_name || profile.username || '?')[0].toUpperCase()}</div>
                <div className="profile-result-name"><b>{profile.display_name || profile.username || 'VYBORA user'}</b><small>{profile.username ? '@' + profile.username : ''}</small></div>
                <button disabled={!!startingChatId} onClick={() => startConversation(profile)}>{startingChatId === profile.id ? 'Opening…' : 'Message'}</button>
              </div>) : <p className="search-hint">No matching profiles found.</p>}
            </div>}
          </div>
          <div className="chat-layout">
            <aside className="chat-list">
              <div className="chat-list-heading">Your chats {chatLoading ? '· Loading…' : ''}</div>
              {chatList.length ? chatList.map((chat) => <button key={chat.id} className={'chat-list-item ' + (chat.id === activeChatId ? 'selected' : '')} onClick={() => { setActiveChatId(chat.id); setChatError(''); setChatNotice(''); }}>
                <div className="mini-avatar">{(chat.label || 'C')[0].toUpperCase()}</div><span className="chat-list-label">{chat.label}</span>{chat.is_group && <small>Group</small>}
              </button>) : !chatLoading ? <p className="search-hint">No conversations yet. Search for a person above to start one.</p> : null}
            </aside>
            <section className="chat-thread">
              {activeChat ? <>
                <div className="thread-heading"><div className="mini-avatar">{(activeChat.label || 'C')[0].toUpperCase()}</div><div><b>{activeChat.label}</b><small>{activeChat.is_group ? 'Group conversation' : 'Private conversation'}</small></div></div>
                <div className="message-list" aria-live="polite">
                  {chatMessages.length ? chatMessages.map((message) => <div key={message.id} className={'message-row ' + (message.sender_id === session.user.id ? 'mine' : 'theirs')}>
                    <div className="message-bubble"><p>{message.body}</p><small>{message.created_at ? new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</small></div>
                  </div>) : <p className="search-hint thread-empty">No messages yet. Say hello 👋</p>}
                </div>
                <form className="message-composer" onSubmit={sendMessage}>
                  <input value={messageDraft} onChange={(e) => setMessageDraft(e.target.value)} maxLength={5000} placeholder="Write a message…" aria-label="Write a message" />
                  <button type="submit" disabled={sendingMessage || !messageDraft.trim()}>{sendingMessage ? 'Sending…' : <><Send size={16} fill="currentColor" /> Send</>}</button>
                </form>
              </> : <div className="chat-empty"><div className="bigicon">✉</div><h3>Your conversations</h3><p>Choose a chat or search for a person above to begin.</p></div>}
            </section>
          </div>
        </>}
      </section> : tab === 'Notifications' ? <section className="messages-panel notifications-panel">
        <div className="messages-heading"><div><p className="eyebrow">YOUR COMMUNITY</p><h2>Notifications</h2></div><button className="refresh-button" onClick={loadNotifications}>Refresh ↻</button></div>
        {!session ? <div className="chat-empty"><div className="bigicon">♡</div><h3>Sign in to see notifications</h3><p>Likes and comments on your posts will show up here.</p><button onClick={() => setTab('Profile')}>Go to sign in</button></div> : <>
          {notificationError && <p className="chat-alert" role="alert">{notificationError}</p>}
          {notificationLoading && !notifications.length ? <p className="search-hint">Loading your activity…</p> : notifications.length ? <div className="notifications-list">
            {notifications.map((notification) => <button key={notification.id} className={'notification-item ' + (notification.is_read ? '' : 'unread')} onClick={() => openNotification(notification)} disabled={!notification.post_id}>
              <span className={'notification-icon ' + (notification.type === 'like' ? 'notification-like' : 'notification-comment')}>{notification.type === 'like' ? '♥' : '▢'}</span>
              <span className="notification-copy"><b>{notification.actorName}</b> {notification.type === 'like' ? 'liked your post.' : 'commented on your post.'}<small>{notification.created_at ? new Date(notification.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'just now'} · Tap to view post</small>{notification.postText && <span className="notification-preview">{notification.postText}</span>}</span>
              {!notification.is_read && <span className="notification-unread-dot" aria-label="Unread" />}
              <span className="notification-arrow">↗</span>
            </button>)}
          </div> : !notificationError ? <div className="chat-empty"><div className="bigicon">♡</div><h3>You’re all caught up</h3><p>When someone likes or comments on your posts, you’ll see it here. Tap any notification to jump straight to that post.</p></div> : null}
        </>}
      </section> : tab === 'Profile' ? <section className="placeholder auth-panel">
        <div className="bigicon">◉</div><h2>{session ? 'Your account' : 'Join VYBORA'}</h2>
        {session ? <><p>You are signed in as <b>{session.user.email}</b>.</p><button onClick={handleSignOut}>Sign out</button></> : <>
          <p>Create an account or sign in to message your people.</p>
          <div className="auth-tabs">
            <button className={authMode === 'signin' ? 'selected' : ''} onClick={() => { setAuthMode('signin'); setAuthMessage(''); }}>Sign in</button>
            <button className={authMode === 'signup' ? 'selected' : ''} onClick={() => { setAuthMode('signup'); setAuthMessage(''); }}>Create account</button>
          </div>
          <form className="auth-form" onSubmit={handleAuth}>
            <label>Email address</label><input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            <label>Password</label><input type="password" autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
            <button type="submit" disabled={authBusy}>{authBusy ? 'Please wait…' : authMode === 'signup' ? 'Create account' : 'Sign in'}</button>
          </form>
        </>}
        {authMessage && <p className="auth-message" role="status">{authMessage}</p>}
        {!supabaseConfigured && <p className="auth-message">Connection settings were not included in this build. Check repository variables and the latest deployment.</p>}
      </section> : <section className="placeholder discovery-panel"><div className="bigicon">{tab === 'Explore' ? <Search size={34} fill="currentColor" /> : <Bell size={34} fill="currentColor" />}</div><p className="eyebrow">{tab === 'Explore' ? 'FIND YOUR NEXT FAVOURITE' : 'THE LITTLE THINGS THAT CONNECT US'}</p><h2>{tab === 'Explore' ? 'Explore your world.' : 'Your activity.'}</h2><p>{tab === 'Explore' ? 'Discover moments, people and new perspectives. Search the community below.' : 'You’re all caught up. Updates will appear here as your community grows.'}</p>{tab === 'Explore' && <input className="explore-input" value={exploreSearch} onChange={(e) => setExploreSearch(e.target.value)} placeholder="Search posts or people…" />}{tab === 'Explore' && <div className="explore-results">{posts.filter(p => !exploreSearch.trim() || (p.text + ' ' + p.user).toLowerCase().includes(exploreSearch.toLowerCase())).map(p => <article className="post" key={p.id}><b>{p.user}</b><p className="posttext">{p.text}</p></article>)}</div>}<button onClick={() => setTab('Home')}>Back to home</button></section>}
      <footer>VYBORA © 2026 <span>Made for your world ✦</span></footer>
    </main>
    <nav className="mobile-nav">{[['Home',<House size={21} fill="currentColor" />],['Explore',<Compass size={21} fill="currentColor" />],['Create',<PlusSquare size={22} fill="currentColor" />],['Notifications',<Bell size={21} fill="currentColor" />],['Messages',<MessageCircle size={21} fill="currentColor" />],['Profile',<UserRound size={21} fill="currentColor" />]].map(([name,icon]) => <button key={name} className={tab === name ? 'active' : ''} onClick={() => name === 'Create' ? (setTab('Home'), document.querySelector('.composebody textarea')?.focus()) : setTab(name)}><span>{icon}{name === 'Notifications' && notifications.filter((n) => !n.is_read).length > 0 && <i className="mobile-unread-count">{notifications.filter((n) => !n.is_read).length > 99 ? '99+' : notifications.filter((n) => !n.is_read).length}</i>}</span><small>{name === 'Create' ? 'Post' : name}</small></button>)}</nav>
    {activeStory && <div className="story-overlay" role="dialog" aria-modal="true" aria-label="Story viewer" onClick={() => setActiveStory(null)}><div className="story-viewer" onClick={(e) => e.stopPropagation()}><div className="story-viewer-top"><span className="story-progress"><i /></span><button onClick={() => setActiveStory(null)} aria-label="Close story">×</button></div><div className="story-viewer-content"><span className="story-viewer-avatar">{activeStory.initial}</span><p>{activeStory.own ? 'Your moment starts here.' : activeStory.name + '’s story'}</p><small>{activeStory.own ? 'Share the little things as they happen.' : 'A moment shared with the VYBORA community ✦'}</small>{activeStory.own && <button onClick={() => { setActiveStory(null); setTab('Home'); document.querySelector('.composebody textarea')?.focus(); }}>Create a post ↗</button>}</div></div></div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);

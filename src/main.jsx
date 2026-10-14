import React from 'react';
import { createRoot } from 'react-dom/client';
import { House, Compass, Play, PlusSquare, MessageCircle, Bell, UserRound, Heart, MessageSquare, Share2, Bookmark, Send, Search, RefreshCw, ImagePlus, X, Volume2, VolumeX } from 'lucide-react';
import { supabase, supabaseConfigured } from './supabase.js';
import './style.css';

const APP_URL = 'https://jerricksmith92-web.github.io/VYBORA-/';

// Keep generated database suffixes out of every visible username.
// This changes display only; account IDs and stored usernames remain untouched.
function cleanUsername(value) {
  return String(value || '').replace(/_[a-f0-9]{6}$/i, '');
}


function ReelsPanel({ session }) {
  const [reels, setReels] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [uploadBusy, setUploadBusy] = React.useState(false);
  const [file, setFile] = React.useState(null);
  const [caption, setCaption] = React.useState('');
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [commentDrafts, setCommentDrafts] = React.useState({});
  const [openComments, setOpenComments] = React.useState({});
  const [soundOn, setSoundOn] = React.useState(false);
  const fileRef = React.useRef(null);

  const loadReels = React.useCallback(async () => {
    if (!supabase || !session?.user?.id) { setReels([]); return; }
    setBusy(true);
    setError('');
    try {
      const { data, error: reelError } = await supabase.from('reels')
        .select('id,user_id,video_url,caption,created_at')
        .order('created_at', { ascending: false }).limit(60);
      if (reelError) throw reelError;
      const rows = data || [];
      // Personalize the Reels feed: put followed creators first while
      // preserving newest-first order within both groups.
      let followedIds = new Set();
      try {
        const { data: followRows } = await supabase.from('follows')
          .select('following_id').eq('follower_id', session.user.id);
        followedIds = new Set((followRows || []).map(row => row.following_id));
      } catch (_) {}
      rows.sort((a, b) => {
        const aFollowed = followedIds.has(a.user_id) ? 1 : 0;
        const bFollowed = followedIds.has(b.user_id) ? 1 : 0;
        return bFollowed - aFollowed;
      });
      const ids = rows.map((r) => r.id);
      const userIds = [...new Set(rows.map((r) => r.user_id))];
      const [{ data: people, error: peopleError }, { data: likeRows, error: likesError }, { data: commentRows, error: commentsError }] = await Promise.all([
        userIds.length ? supabase.from('profiles').select('id,username,display_name,avatar_url').in('id', userIds) : Promise.resolve({data:[],error:null}),
        ids.length ? supabase.from('reels_likes').select('reel_id,user_id').in('reel_id', ids) : Promise.resolve({data:[],error:null}),
        ids.length ? supabase.from('reels_comments').select('id,reel_id,user_id,content,created_at').in('reel_id', ids).order('created_at', {ascending:true}) : Promise.resolve({data:[],error:null})
      ]);
      if (peopleError) throw peopleError;
      if (likesError) throw likesError;
      if (commentsError) throw commentsError;
      const profilesById = Object.fromEntries((people || []).map(p => [p.id,p]));
      const likerIds = [...new Set((likeRows || []).map(l => l.user_id))];
      const commenterIds = [...new Set((commentRows || []).map(c => c.user_id))];
      const extraIds = [...new Set([...likerIds,...commenterIds])].filter(id => !profilesById[id]);
      if (extraIds.length) {
        const {data: extraProfiles} = await supabase.from('profiles').select('id,username,display_name,avatar_url').in('id',extraIds);
        (extraProfiles || []).forEach(p => {profilesById[p.id]=p;});
      }
      const next = rows.map(r => ({
        ...r, profile: profilesById[r.user_id] || {},
        likes: (likeRows || []).filter(l => l.reel_id === r.id).length,
        liked: (likeRows || []).some(l => l.reel_id === r.id && l.user_id === session.user.id),
        comments: (commentRows || []).filter(c => c.reel_id === r.id).map(c => ({...c, profile:profilesById[c.user_id] || {}}))
      }));
      setReels(next);
    } catch (e) {
      setError('Could not load Reels: ' + (e.message || 'Please try again.'));
    } finally { setBusy(false); }
  }, [session?.user?.id]);

  React.useEffect(() => { loadReels(); }, [loadReels]);

  React.useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const videos = Array.from(document.querySelectorAll('.reel-video'));
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const video = entry.target;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          video.preload = 'auto';
          video.play().catch(() => {});
        } else {
          video.pause();
          // Avoid downloading every Reel before the user reaches it.
          video.preload = 'none';
        }
      });
    }, { threshold: [0, 0.6, 1] });
    videos.forEach((video) => observer.observe(video));
    return () => { observer.disconnect(); videos.forEach((video) => video.pause()); };
  }, [reels]);

  React.useEffect(() => {
    document.querySelectorAll(".reel-video").forEach(video => { video.muted = !soundOn; });
  }, [soundOn, reels]);

  async function publishReel(event) {
    event.preventDefault();
    if (!session?.user?.id || !file || uploadBusy) return;
    if (!file.type.startsWith('video/')) { setError('Choose a video file.'); return; }
    if (file.size > 50 * 1024 * 1024) { setError('Reel videos must be 50 MB or smaller.'); return; }
    setUploadBusy(true); setError(''); setNotice('');
    try {
      const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g,'') || 'mp4';
      const path = session.user.id + '/reels/' + crypto.randomUUID() + '.' + ext;
      const {error: uploadError} = await supabase.storage.from('post-media').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});
      if (uploadError) throw uploadError;
      const videoUrl = supabase.storage.from('post-media').getPublicUrl(path).data.publicUrl;
      const {error: insertError} = await supabase.from('reels').insert({user_id:session.user.id,video_url:videoUrl,caption:caption.trim()});
      if (insertError) throw insertError;
      setFile(null); setCaption('');
      if (fileRef.current) fileRef.current.value = '';
      setNotice('Your Reel is live!');
      await loadReels();
    } catch(e) { setError('Could not publish Reel: ' + (e.message || 'Please try again.')); }
    finally { setUploadBusy(false); }
  }

  async function toggleReelLike(reel) {
    if (!session?.user?.id) return;
    const wasLiked = reel.liked;
    setReels(current => current.map(r => r.id === reel.id ? {...r,liked:!wasLiked,likes:Math.max(0,r.likes+(wasLiked?-1:1))} : r));
    const result = wasLiked
      ? await supabase.from('reels_likes').delete().eq('reel_id',reel.id).eq('user_id',session.user.id)
      : await supabase.from('reels_likes').insert({reel_id:reel.id,user_id:session.user.id});
    if (result.error) {
      setReels(current => current.map(r => r.id === reel.id ? {...r,liked:wasLiked,likes:Math.max(0,r.likes+(wasLiked?1:-1))} : r));
      setError('Could not update like: ' + result.error.message);
    }
  }

  async function submitReelComment(event,reel) {
    event.preventDefault();
    const content=(commentDrafts[reel.id] || '').trim();
    if (!content || !session?.user?.id) return;
    const {data,error:commentError}=await supabase.from('reels_comments').insert({reel_id:reel.id,user_id:session.user.id,content}).select('id,reel_id,user_id,content,created_at').single();
    if (commentError) {setError('Could not add comment: '+commentError.message);return;}
    const {data:person}=await supabase.from('profiles').select('id,username,display_name,avatar_url').eq('id',session.user.id).maybeSingle();
    setReels(current=>current.map(r=>r.id===reel.id?{...r,comments:[...r.comments,{...data,profile:person||{}}]}:r));
    setCommentDrafts(current=>({...current,[reel.id]:''}));
  }

  if (!session) return <section className="reels-page"><div className="reels-title"><span>VYBORA REELS</span><h2>Videos made for your world.</h2></div><p className="reels-muted">Sign in to watch and share Reels.</p></section>;

  return <section className="reels-page">
    <div className="reels-title"><div className="reels-heading-copy"><span className="reels-clapper" aria-hidden="true">▣▶</span><div><h2>Reels</h2><p>Create short videos. Be creative 🔥</p></div></div><span className="reels-share-hint">▣ &nbsp; Share your moments</span></div>
    <form className="reel-upload" onSubmit={publishReel}>
      <label className="reel-gallery-pick" onClick={() => fileRef.current?.click()}><span>＋</span></label>
      <input ref={fileRef} type="file" accept="video/*" onChange={e=>{setFile(e.target.files?.[0]||null);setError('');}} />
      <div className="reel-file-copy"><b>{file ? file.name : 'Choose a video from your gallery'}</b><small>▤ &nbsp; Supports up to 50 MB</small></div>
      <button type="submit" disabled={!file||uploadBusy}>{uploadBusy?'Uploading…':<>▣{' '}Share Reel</>}</button>
    </form>
    {error && <p className="reel-alert" role="alert">{error}</p>}
    {notice && <p className="reel-notice" role="status">{notice}</p>}
    {busy && !reels.length && <p className="reels-muted">Loading Reels…</p>}
    {!busy && !reels.length && !error && <div className="reels-empty"><span>▶</span><h3>Your next favourite video goes here.</h3><p>Be the first to share a Reel with the VYBORA community.</p></div>}
    <div className="reels-feed">{reels.map((reel,index)=><article className="reel-card" key={reel.id}>
      <video className="reel-video" src={reel.video_url} autoPlay muted={!soundOn} playsInline disablePictureInPicture preload={index===0?"auto":"none"} loop controls={false} onClick={e=>{const v=e.currentTarget;if(v.paused)v.play().catch(()=>{});else v.pause();}} onLoadedData={e=>{if(e.currentTarget.closest(".reel-card")?.getBoundingClientRect().top < window.innerHeight * 0.65)e.currentTarget.play().catch(()=>{});}} />
      <button type="button" className="reel-sound-toggle" aria-label={soundOn?"Mute Reel sound":"Turn Reel sound on"} onClick={()=>setSoundOn(current=>!current)}>{soundOn?<Volume2 size={22}/>:<VolumeX size={22}/>}<span>{soundOn?"Sound on":"Sound off"}</span></button>
      <div className="reel-overlay-bottom">
        <div className="reel-author"><span className="reel-avatar">{reel.profile?.avatar_url?<img src={reel.profile.avatar_url} alt="" />:(reel.profile?.display_name||cleanUsername(reel.profile?.username)||'V')[0].toUpperCase()}</span><span><b>{reel.profile?.display_name||cleanUsername(reel.profile?.username)||'VYBORA member'}</b><small>@{cleanUsername(reel.profile?.username)||'member'}</small></span></div>
        {reel.caption && <p className="reel-caption">{reel.caption}</p>}
      </div>
      <div className="reel-action-rail">
        <button type="button" className={reel.liked?'is-liked':''} onClick={()=>toggleReelLike(reel)}><Heart size={28} fill={reel.liked?'currentColor':'white'}/><b>{reel.likes}</b></button>
        <button type="button" onClick={()=>setOpenComments(current=>({...current,[reel.id]:!current[reel.id]}))}><MessageSquare size={27}/><b>{reel.comments.length}</b></button>
        <button type="button" onClick={async()=>{try{if(navigator.share)await navigator.share({title:'VYBORA Reel',text:reel.caption||'Watch this Reel on VYBORA',url:reel.video_url});else{await navigator.clipboard.writeText(reel.video_url);setNotice('Reel link copied!');}}catch(e){if(e.name!=='AbortError')setNotice('Unable to share this Reel on this device.');}}}><Share2 size={26}/><b>Share</b></button>
      </div>
      {openComments[reel.id] && <div className="reel-comments-sheet"><div className="reel-comments-head"><b>Comments · {reel.comments.length}</b><button type="button" onClick={()=>setOpenComments(current=>({...current,[reel.id]:false}))}>✕</button></div><div className="reel-comments-list">{reel.comments.map(c=><p key={c.id}><b>{c.profile?.display_name||cleanUsername(c.profile?.username)||'Member'}</b> {c.content}</p>)}</div><form onSubmit={e=>submitReelComment(e,reel)}><input value={commentDrafts[reel.id]||''} onChange={e=>setCommentDrafts(current=>({...current,[reel.id]:e.target.value}))} maxLength={500} placeholder="Add a comment…" /><button type="submit" disabled={!(commentDrafts[reel.id]||'').trim()}>Post</button></form></div>}
    </article>)}</div>
  </section>;
}

function App() {
  React.useEffect(() => {
    // Close any stale iOS Safari Picture-in-Picture window left over from before the fix.
    const closeFloatingVideo = () => {
      const activeVideo = document.pictureInPictureElement;
      if (activeVideo && document.exitPictureInPicture) document.exitPictureInPicture().catch(() => {});
    };
    closeFloatingVideo();
    document.addEventListener('visibilitychange', closeFloatingVideo);
    return () => document.removeEventListener('visibilitychange', closeFloatingVideo);
  }, []);
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
  const messageListRef = React.useRef(null);
  const [messageDraft, setMessageDraft] = React.useState('');
  const [messageImage, setMessageImage] = React.useState(null);
  const [messageImagePreview, setMessageImagePreview] = React.useState('');
  const messageFileRef = React.useRef(null);
  const [typingUserId, setTypingUserId] = React.useState('');
  const typingChannelRef = React.useRef(null);
  const typingChannelReadyRef = React.useRef(false);
  const typingStopTimerRef = React.useRef(null);
  const [sendingMessage, setSendingMessage] = React.useState(false);
  const [profileSearch, setProfileSearch] = React.useState('');
  const [profiles, setProfiles] = React.useState([]);
  const [startingChatId, setStartingChatId] = React.useState('');
  const [activeStory, setActiveStory] = React.useState(null);
  const [stories, setStories] = React.useState([]);
  const [storyFile, setStoryFile] = React.useState(null);
  const [storyCaption, setStoryCaption] = React.useState('');
  const [storyTextMode, setStoryTextMode] = React.useState(false);
  const [storyBusy, setStoryBusy] = React.useState(false);
  const [storyError, setStoryError] = React.useState('');
  const [storyNotice, setStoryNotice] = React.useState('');
  const storyFileRef = React.useRef(null);
  const [exploreSearch, setExploreSearch] = React.useState('');
  const [exploreVideoMuted, setExploreVideoMuted] = React.useState({});
  const [notifications, setNotifications] = React.useState([]);
  const [notificationError, setNotificationError] = React.useState('');
  const [notificationLoading, setNotificationLoading] = React.useState(false);
  const [pushBusy, setPushBusy] = React.useState(false);
  const [pushStatus, setPushStatus] = React.useState('');
  const [highlightedPostId, setHighlightedPostId] = React.useState('');
  const [myProfile, setMyProfile] = React.useState(null);
  const [followStats, setFollowStats] = React.useState({ followers: 0, following: 0 });
  const [followingIds, setFollowingIds] = React.useState([]);
  const [followBusyId, setFollowBusyId] = React.useState('');
  const [followError, setFollowError] = React.useState('');
  const [viewedProfile, setViewedProfile] = React.useState(null);
  const [viewedProfileStats, setViewedProfileStats] = React.useState({ posts: 0, followers: 0, following: 0 });
const [profileEditOpen, setProfileEditOpen] = React.useState(false);
  const [profileNameDraft, setProfileNameDraft] = React.useState('');
  const [profileAvatarFile, setProfileAvatarFile] = React.useState(null);
  const [profileAvatarPreview, setProfileAvatarPreview] = React.useState('');
  const [profileSaveBusy, setProfileSaveBusy] = React.useState(false);
  const [profileSaveMessage, setProfileSaveMessage] = React.useState('');



  React.useEffect(() => {
    if (!profileAvatarPreview) return undefined;
    return () => URL.revokeObjectURL(profileAvatarPreview);
  }, [profileAvatarPreview]);

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
    if (!supabase || !session?.user?.id) { setMyProfile(null); return undefined; }
    let cancelled = false;
    supabase.from('profiles').select('id,username,display_name,avatar_url')
      .eq('id', session.user.id).maybeSingle()
      .then(({ data, error }) => { if (!cancelled && !error) setMyProfile(data || {}); });
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  // Preload notifications as soon as the signed-in session is ready, so
  // opening the Notifications tab does not have to wait for the first fetch.
  React.useEffect(() => {
    if (session?.user?.id && supabase) loadNotifications();
  }, [session?.user?.id]);

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
    if (['Messages', 'Explore', 'Profile'].includes(tab) && session && supabase) loadProfiles();
    if (tab === 'Messages' && session && supabase) loadChats();
    if (tab === 'Profile' && session && supabase) loadFollowData();
  }, [tab, session?.user?.id]);

  // Keep the unread-message total available even when the Messages screen is closed.
  React.useEffect(() => {
    if (!session?.user?.id || !supabase) return;
    loadChats();
  }, [session?.user?.id]);

  React.useEffect(() => {
    if (!supabase || !session?.user?.id) return undefined;
    const channel = supabase.channel('vybora-unread-message-count-' + session.user.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        if (payload.new?.sender_id && payload.new.sender_id !== session.user.id) loadChats();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id]);

  React.useEffect(() => {
    if (!supabase || !session?.user?.id) return undefined;
    let active = true;
    const heartbeat = async () => {
      const { error } = await supabase.rpc('vybora_update_last_seen');
      if (error && active) console.warn('VYBORA presence heartbeat failed:', error.message);
    };
    heartbeat();
    const timer = setInterval(heartbeat, 30000);
    return () => { active = false; clearInterval(timer); };
  }, [session?.user?.id]);

  React.useEffect(() => {
    if (tab !== 'Messages' || !session?.user?.id || !supabase) return undefined;
    const timer = setInterval(() => { loadChats(); loadProfiles(); }, 30000);
    return () => clearInterval(timer);
  }, [tab, session?.user?.id]);

  React.useEffect(() => {
    if (session?.user?.id && supabase) loadPosts();
    else setPosts([]);
  }, [session?.user?.id]);

  // Pause feed videos when they scroll mostly out of view, so their audio
  // never keeps playing behind the next posts.
  React.useEffect(() => {
    const videos = Array.from(document.querySelectorAll('.post-video'));
    if (!videos.length) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      return () => videos.forEach((video) => video.pause());
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.intersectionRatio < 0.35) entry.target.pause();
      });
    }, { threshold: [0, 0.35, 0.6, 1] });
    videos.forEach((video) => observer.observe(video));
    return () => {
      observer.disconnect();
      videos.forEach((video) => video.pause());
    };
  }, [posts, tab]);
  
  React.useEffect(() => {
    if (!session?.user?.id || !supabase) { setStories([]); return undefined; }
    loadStories();
    const timer = setInterval(loadStories, 60000);
    return () => clearInterval(timer);
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
        user_id: post.user_id,
        avatar_url: profile.avatar_url || '',
        profile_username: cleanUsername(profile.username),
        user: profile.display_name || cleanUsername(profile.username) || 'VYBORA member',
        handle: profile.username ? '@' + cleanUsername(profile.username) : 'community member',
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
        grouped[comment.post_id].push({ ...comment, user: profile.display_name || cleanUsername(profile.username) || 'VYBORA member' });
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
    if (!result.error && !wasLiked) requestServerPush('like', post.id);
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
      ...comment, user: map[comment.user_id]?.display_name || cleanUsername(map[comment.user_id]?.username) || 'VYBORA member'
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
      requestServerPush('comment', post.id);
      const profile = await supabase.from('profiles').select('username,display_name').eq('id', session.user.id).maybeSingle();
      const user = profile.data?.display_name || cleanUsername(profile.data?.username) || 'VYBORA member';
      setCommentsByPost((current) => ({ ...current, [post.id]: [...(current[post.id] || []), { ...data, user }] }));
      setPosts((current) => current.map((item) => item.id === post.id ? { ...item, comments: item.comments + 1 } : item));
      setCommentDrafts((current) => ({ ...current, [post.id]: '' }));
    } catch (err) {
      setEngagementError(err.message || 'Could not add your comment.');
    } finally {
      setCommentBusy((current) => ({ ...current, [post.id]: false }));
    }
  }

  const VAPID_PUBLIC_KEY = 'BL7UZMc3ZILck561AV-WrDgEzicIFy_HWB_Qig4B6ZJrh0Li4TC4-7EmKAXrtJzsx2Mg6vm98FJHVM63Hm6_KCo';

  async function enablePushNotifications() {
    if (!session?.user?.id || !supabase || pushBusy) return;
    setPushBusy(true);
    setPushStatus('');
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('Push notifications are not supported in this browser. On iPhone, use iOS 16.4+ and open VYBORA from your Home Screen.');
      }
      if (!window.isSecureContext) throw new Error('Push notifications require a secure connection.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Notifications are blocked. Allow them in your device settings, then try again.');
      const registration = await navigator.serviceWorker.register('/VYBORA-/sw.js', { scope: '/VYBORA-/' });
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const applicationServerKey = Uint8Array.from(atob(VAPID_PUBLIC_KEY.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(VAPID_PUBLIC_KEY.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      }
      const { error } = await supabase.from('push_subscriptions').upsert({
        user_id: session.user.id,
        endpoint: subscription.endpoint,
        subscription: subscription.toJSON(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'endpoint' });
      if (error) throw error;
      setPushStatus('Push notifications are enabled on this device. Keep VYBORA installed on your Home Screen.');
    } catch (err) {
      setPushStatus(err.message || 'Could not enable push notifications.');
    } finally {
      setPushBusy(false);
    }
  }

  async function disablePushNotifications() {
    if (!supabase || !session?.user?.id || pushBusy) return;
    setPushBusy(true);
    setPushStatus('');
    try {
      const registration = await navigator.serviceWorker.getRegistration('/VYBORA-/');
      const subscription = await registration?.pushManager?.getSubscription();
      if (subscription) {
        await supabase.from('push_subscriptions').delete().eq('user_id', session.user.id).eq('endpoint', subscription.endpoint);
        await subscription.unsubscribe();
      }
      setPushStatus('Push notifications are turned off on this device.');
    } catch (err) {
      setPushStatus(err.message || 'Could not turn off push notifications.');
    } finally { setPushBusy(false); }
  }

  async function requestServerPush(type, targetId) {
    if (!supabase || !session?.user?.id) return;
    try {
      const body = type === 'message' ? { type, message_id: targetId } : { type, post_id: targetId };
      const { error } = await supabase.functions.invoke('send-push', { body });
      if (error) console.warn('VYBORA push delivery could not be requested:', error.message);
    } catch (err) { console.warn('VYBORA push delivery could not be requested:', err); }
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
        return { ...row, actorName: actor.display_name || cleanUsername(actor.username) || 'Someone',
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
      .channel('vybora-chat-' + activeChatId, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!payload || payload.userId === session.user.id) return;
        setTypingUserId(payload.isTyping ? payload.userId : '');
      })
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
          if (payload.new.sender_id !== session.user.id) markIncomingMessagesRead(activeChatId, [payload.new]);
          loadChats();
        } else if (payload.eventType === 'UPDATE' && payload.new) {
          setChatMessages((current) => current.map((message) => message.id === payload.new.id ? payload.new : message));
        } else if (payload.eventType === 'DELETE' && payload.old) {
          setChatMessages((current) => current.filter((message) => message.id !== payload.old.id));
        }
      })
      .subscribe((status) => {
        typingChannelReadyRef.current = status === 'SUBSCRIBED';
      });
    typingChannelRef.current = channel;
    return () => {
      typingChannelRef.current = null;
      typingChannelReadyRef.current = false;
      if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
      setTypingUserId('');
      supabase.removeChannel(channel);
    };
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

  async function loadStories() {
    if (!supabase || !session?.user?.id) return;
    const { data, error } = await supabase.from('stories')
      .select('id,user_id,media_url,media_type,caption,created_at,expires_at')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      console.warn('VYBORA stories could not load:', error.message);
      setStoryError('Stories could not load: ' + error.message);
      return;
    }
    const rows = data || [];
    if (!rows.length) { setStories([]); return; }
    const userIds = [...new Set(rows.map((story) => story.user_id))];
    const storyIds = rows.map((story) => story.id);
    const [{ data: people, error: peopleError }, { data: viewRows, error: viewError }] = await Promise.all([
      supabase.from('profiles').select('id,username,display_name,avatar_url').in('id', userIds),
      supabase.from('story_views').select('story_id,viewer_id,viewed_at').in('story_id', storyIds)
    ]);
    if (peopleError) console.warn('VYBORA story profiles could not load:', peopleError.message);
    if (viewError) console.warn('VYBORA story views could not load:', viewError.message);
    const peopleById = Object.fromEntries((people || []).map((person) => [person.id, person]));
    const viewsByStory = {};
    (viewRows || []).forEach((view) => {
      if (!viewsByStory[view.story_id]) viewsByStory[view.story_id] = [];
      viewsByStory[view.story_id].push(view);
    });
    setStories(rows.map((story) => ({
      ...story,
      profile: peopleById[story.user_id] || {},
      views: viewsByStory[story.id] || []
    })));
    setStoryError('');
  }

  async function publishStory(event) {
    event.preventDefault();
    if (!supabase || !session?.user?.id || storyBusy) return;
    if (storyTextMode && !storyCaption.trim()) {
      setStoryError('Write something first to share a text story.');
      return;
    }
    if (!storyTextMode && !storyFile) {
      setStoryError('Choose a photo or video, or tap Aa to create a text story.');
      return;
    }
    const isVideo = !storyTextMode && !!storyFile?.type.startsWith('video/');
    if (!storyTextMode && !isVideo && !storyFile?.type.startsWith('image/')) {
      setStoryError('Choose a photo or video for your story.');
      return;
    }
    const makeTextStorySvg = () => {
      const esc = value => value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      const words = storyCaption.trim().slice(0,180).split(/\s+/);
      const lines = []; let line = '';
      words.forEach(word => { const next = line ? line + ' ' + word : word; if (next.length > 22 && line) { lines.push(line); line = word; } else line = next; });
      if (line) lines.push(line);
      const text = lines.map((item,i) => '<text x="540" y="' + (850 - (lines.length-1)*38/2 + i*38) + '" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" font-weight="700" fill="#ffffff">' + esc(item) + '</text>').join('');
      return '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#25133f"/><stop offset=".55" stop-color="#7546b8"/><stop offset="1" stop-color="#d45b9f"/></linearGradient></defs><rect width="1080" height="1920" fill="url(#g)"/><text x="64" y="110" font-family="Arial,sans-serif" font-size="34" font-weight="700" fill="#ffffff">VYBORA</text>' + text + '<text x="540" y="1810" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" fill="#ffffffcc">YOUR WORLD • YOUR PEOPLE</text></svg>';
    };
    const uploadFile = storyTextMode ? new File([makeTextStorySvg()], 'vybora-text-story.svg', {type:'image/svg+xml'}) : storyFile;
    const maxBytes = isVideo ? 20 * 1024 * 1024 : 8 * 1024 * 1024;
    if (uploadFile.size > maxBytes) {
      setStoryError(isVideo ? 'Story videos must be 20 MB or smaller.' : 'Story photos must be 8 MB or smaller.');
      return;
    }
    setStoryBusy(true);
    setStoryError('');
    setStoryNotice('');
    try {
      const rawExtension = (uploadFile.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg')).toLowerCase();
      const extension = rawExtension.replace(/[^a-z0-9]/g, '') || (isVideo ? 'mp4' : 'jpg');
      const path = session.user.id + '/stories/' + crypto.randomUUID() + '.' + extension;
      const { error: uploadError } = await supabase.storage.from('post-media').upload(path, uploadFile, {
        cacheControl: '3600', upsert: false, contentType: uploadFile.type
      });
      if (uploadError) throw uploadError;
      const mediaUrl = supabase.storage.from('post-media').getPublicUrl(path).data.publicUrl;
      const createdAt = new Date();
      const { error: insertError } = await supabase.from('stories').insert({
        user_id: session.user.id,
        media_url: mediaUrl,
        media_type: isVideo ? 'video' : 'image',
        caption: storyTextMode ? '' : storyCaption.trim().slice(0, 180),
        created_at: createdAt.toISOString(),
        expires_at: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000).toISOString()
      });
      if (insertError) throw insertError;
      setStoryFile(null);
      setStoryCaption('');
      setStoryTextMode(false);
      if (storyFileRef.current) storyFileRef.current.value = '';
      setStoryNotice('Your story is live and will disappear after 24 hours.');
      await loadStories();
    } catch (err) {
      setStoryError(err.message || 'Could not publish your story.');
    } finally {
      setStoryBusy(false);
    }
  }

  async function openStory(story) {
    if (!story) return;
    const isOwn = story.user_id === session?.user?.id;
    let views = story.views || [];
    if (!isOwn && supabase && session?.user?.id) {
      const { error } = await supabase.from('story_views').insert({ story_id: story.id, viewer_id: session.user.id });
      if (error && error.code !== '23505') console.warn('VYBORA could not record story view:', error.message);
      const { data: freshViews, error: viewsError } = await supabase.from('story_views')
        .select('story_id,viewer_id,viewed_at').eq('story_id', story.id);
      if (!viewsError) {
        views = freshViews || [];
        setStories((current) => current.map((item) => item.id === story.id ? { ...item, views } : item));
      }
    }
    let viewerProfiles = [];
    if (isOwn && views.length) {
      const viewerIds = [...new Set(views.map((view) => view.viewer_id).filter((id) => id !== session?.user?.id))];
      if (viewerIds.length) {
        const { data } = await supabase.from('profiles').select('id,username,display_name,avatar_url').in('id', viewerIds);
        viewerProfiles = data || [];
      }
    }
    setActiveStory({ ...story, isOwn, views, viewerProfiles });
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
          .select('id,username,display_name,avatar_url,last_seen_at')
          .in('id', memberIds);
        if (error) throw error;
        profileRows = data || [];
      }
      const profileMap = Object.fromEntries(profileRows.map((profile) => [profile.id, profile]));
      const { data: recentMessages, error: recentMessageError } = await supabase
        .from('messages')
        .select('id,conversation_id,sender_id,body,media_url,created_at')
        .in('conversation_id', ids)
        .order('created_at', { ascending: false })
        .limit(500);
      if (recentMessageError) throw recentMessageError;
      const recentIds = (recentMessages || []).map((message) => message.id);
      const { data: myReadRows, error: myReadError } = recentIds.length
        ? await supabase.from('message_reads').select('message_id').eq('user_id', session.user.id).in('message_id', recentIds)
        : { data: [], error: null };
      if (myReadError) throw myReadError;
      const readMessageIds = new Set((myReadRows || []).map((row) => row.message_id));
      const unreadCounts = {};
      (recentMessages || []).forEach((message) => {
        if (message.sender_id !== session.user.id && !readMessageIds.has(message.id)) {
          unreadCounts[message.conversation_id] = (unreadCounts[message.conversation_id] || 0) + 1;
        }
      });
      const latestByConversation = {};
      (recentMessages || []).forEach((message) => {
        if (!latestByConversation[message.conversation_id]) latestByConversation[message.conversation_id] = message;
      });
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
          : (otherProfiles[0]?.display_name || cleanUsername(otherProfiles[0]?.username) || 'Conversation');
        const lastMessage = latestByConversation[conversation.id] || null;
        return {
          ...conversation,
          label,
          otherProfiles,
          memberIds: membersByConversation[conversation.id] || [],
          unreadCount: unreadCounts[conversation.id] || 0,
          lastMessage,
          lastActivityAt: lastMessage?.created_at || conversation.created_at
        };
      }).sort((a, b) => new Date(b.lastActivityAt || 0).getTime() - new Date(a.lastActivityAt || 0).getTime());
      setChatList(formatted);
      setActiveChatId((current) => formatted.some((chat) => chat.id === current) ? current : '');
    } catch (err) {
      setChatError(err.message || 'Could not load conversations.');
    } finally {
      setChatLoading(false);
    }
  }

  function presenceLabel(profile) {
    if (!profile?.last_seen_at) return 'Offline · last seen unavailable';
    const age = Date.now() - new Date(profile.last_seen_at).getTime();
    if (Number.isFinite(age) && age >= 0 && age < 90000) return 'Online';
    if (!Number.isFinite(age) || age < 0) return 'Offline';
    const minutes = Math.floor(age / 60000);
    if (minutes < 1) return 'Last seen just now';
    if (minutes < 60) return 'Last seen ' + minutes + 'm ago';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return 'Last seen ' + hours + 'h ago';
    const days = Math.floor(hours / 24);
    return 'Last seen ' + days + 'd ago';
  }

  async function loadProfiles() {
    if (!supabase || !session?.user?.id) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('id,username,display_name,avatar_url,last_seen_at')
      .neq('id', session.user.id)
      .limit(100);
    if (error) {
      setChatError((current) => current || error.message || 'Could not load profiles.');
      return;
    }
    setProfiles(data || []);
  }

  async function openUserProfile(profile) {
    if (!profile?.id) return;
    setViewedProfile(profile);
    setTab('Profile');
    setFollowError('');
    const [{ count: followerCount, error: followerError }, { count: followingCount, error: followingError }, { count: postCount, error: postError }] = await Promise.all([
      supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', profile.id),
      supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', profile.id),
      supabase.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', profile.id)
    ]);
    const problem = followerError || followingError || postError;
    if (problem) { setFollowError('Some profile details could not load: ' + problem.message); return; }
    setViewedProfileStats({ posts: postCount || 0, followers: followerCount || 0, following: followingCount || 0 });
  }

  async function loadFollowData() {
    if (!supabase || !session?.user?.id) return;
    setFollowError('');
    const userId = session.user.id;
    const [{ data: profile, error: profileError }, { count: followers, error: followersError }, { count: following, error: followingError }, { data: followingRows, error: followingRowsError }] = await Promise.all([
      supabase.from('profiles').select('id,username,display_name,avatar_url').eq('id', userId).maybeSingle(),
      supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', userId),
      supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', userId),
      supabase.from('follows').select('following_id').eq('follower_id', userId)
    ]);
    const problem = profileError || followersError || followingError || followingRowsError;
    if (problem) { setFollowError('Could not load followers yet: ' + problem.message); return; }
    setMyProfile(profile || {});
    setFollowStats({ followers: followers || 0, following: following || 0 });
    setFollowingIds((followingRows || []).map((row) => row.following_id));
  }

  function startProfileEdit() {
    setProfileNameDraft(myProfile?.display_name || '');
    setProfileAvatarFile(null);
    setProfileAvatarPreview('');
    setProfileSaveMessage('');
    setProfileEditOpen(true);
  }

  function chooseProfileAvatar(event) {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setProfileSaveMessage('Choose an image file for your profile photo.');
      event.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setProfileSaveMessage('Please choose a photo smaller than 5 MB.');
      event.target.value = '';
      return;
    }
    setProfileSaveMessage('');
    setProfileAvatarFile(file);
    setProfileAvatarPreview(URL.createObjectURL(file));
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (!supabase || !session?.user?.id || profileSaveBusy) return;
    const displayName = profileNameDraft.trim().slice(0, 40);
    setProfileSaveBusy(true);
    setProfileSaveMessage('');
    try {
      let avatarUrl = myProfile?.avatar_url || null;
      if (profileAvatarFile) {
        const extensionFromName = (profileAvatarFile.name.split('.').pop() || '').toLowerCase();
        const extension = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extensionFromName)
          ? extensionFromName
          : (profileAvatarFile.type === 'image/png' ? 'png' : profileAvatarFile.type === 'image/webp' ? 'webp' : 'jpg');
        const path = session.user.id + '/avatar-' + crypto.randomUUID() + '.' + extension;
        const { error: uploadError } = await supabase.storage.from('post-media').upload(path, profileAvatarFile, {
          cacheControl: '3600',
          upsert: false,
          contentType: profileAvatarFile.type
        });
        if (uploadError) throw uploadError;
        avatarUrl = supabase.storage.from('post-media').getPublicUrl(path).data.publicUrl;
      }
      const { data, error } = await supabase.from('profiles')
        .update({ display_name: displayName || null, avatar_url: avatarUrl })
        .eq('id', session.user.id)
        .select('id,username,display_name,avatar_url')
        .single();
      if (error) throw error;
      setMyProfile(data);
      setProfiles((current) => current.map((profile) => profile.id === data.id ? { ...profile, ...data } : profile));
      setProfileEditOpen(false);
      setProfileAvatarFile(null);
      setProfileAvatarPreview('');
      setProfileSaveMessage('Profile updated successfully.');
      await loadPosts();
    } catch (err) {
      setProfileSaveMessage(err.message || 'Could not save your profile. Please try again.');
    } finally {
      setProfileSaveBusy(false);
    }
  }

  async function toggleFollow(profile) {
    if (!supabase || !session?.user?.id || !profile?.id || followBusyId) return;
    const alreadyFollowing = followingIds.includes(profile.id);
    setFollowBusyId(profile.id);
    setFollowError('');
    setFollowingIds((current) => alreadyFollowing ? current.filter((id) => id !== profile.id) : [...current, profile.id]);
    setFollowStats((current) => ({ ...current, following: Math.max(0, current.following + (alreadyFollowing ? -1 : 1)) }));
    try {
      const result = alreadyFollowing
        ? await supabase.from('follows').delete().eq('follower_id', session.user.id).eq('following_id', profile.id)
        : await supabase.from('follows').insert({ follower_id: session.user.id, following_id: profile.id });
      if (result.error) throw result.error;
    } catch (err) {
      setFollowingIds((current) => alreadyFollowing ? [...current, profile.id] : current.filter((id) => id !== profile.id));
      setFollowStats((current) => ({ ...current, following: Math.max(0, current.following + (alreadyFollowing ? 1 : -1)) }));
      setFollowError(err.message || 'Could not update follow.');
    } finally { setFollowBusyId(''); }
  }

  async function loadMessages(conversationId) {
    if (!supabase || !conversationId) return;
    const { data, error } = await supabase
      .from('messages')
      .select('id,conversation_id,sender_id,body,media_url,created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (error) {
      setChatError(error.message || 'Could not load messages.');
      return;
    }
    const rows = data || [];
    const messageIds = rows.map((message) => message.id);
    const { data: readRows, error: readError } = messageIds.length
      ? await supabase.from('message_reads').select('message_id,user_id,read_at').in('message_id', messageIds)
      : { data: [], error: null };
    if (readError) {
      console.warn('VYBORA could not load read receipts:', readError.message);
      setChatMessages(rows);
      return;
    }
    const readsByMessage = {};
    (readRows || []).forEach((receipt) => {
      if (!readsByMessage[receipt.message_id]) readsByMessage[receipt.message_id] = [];
      readsByMessage[receipt.message_id].push(receipt.user_id);
    });
    setChatMessages(rows.map((message) => ({ ...message, readByIds: readsByMessage[message.id] || [] })));
    await markIncomingMessagesRead(conversationId, rows);
  }

  async function markIncomingMessagesRead(conversationId, messages) {
    if (!supabase || !session?.user?.id || !conversationId) return;
    const incomingIds = (messages || []).filter((message) => message.sender_id !== session.user.id).map((message) => message.id);
    if (!incomingIds.length) return;
    const { data: existing, error: existingError } = await supabase.from('message_reads')
      .select('message_id').eq('user_id', session.user.id).in('message_id', incomingIds);
    if (existingError) { console.warn('VYBORA read check failed:', existingError.message); return; }
    const alreadyRead = new Set((existing || []).map((row) => row.message_id));
    const missing = incomingIds.filter((id) => !alreadyRead.has(id));
    if (missing.length) {
      const { error } = await supabase.from('message_reads').insert(missing.map((message_id) => ({ message_id, user_id: session.user.id })));
      if (error && error.code !== '23505') console.warn('VYBORA could not mark messages as seen:', error.message);
    }
    setChatList((current) => current.map((chat) => chat.id === conversationId ? { ...chat, unreadCount: 0 } : chat));
  }

  function messageHasBeenSeen(message) {
    const recipients = (activeChat?.memberIds || []).filter((id) => id !== session?.user?.id);
    return recipients.length > 0 && recipients.every((id) => (message.readByIds || []).includes(id));
  }

  // Keep the newest message visible whenever a conversation opens or updates.
  React.useEffect(() => {
    const list = messageListRef.current;
    if (!list) return;
    let secondFrame = 0;
    const scrollToLatest = () => {
      const current = messageListRef.current;
      if (current) current.scrollTo({ top: current.scrollHeight, behavior: 'auto' });
    };
    const firstFrame = requestAnimationFrame(() => {
      scrollToLatest();
      secondFrame = requestAnimationFrame(scrollToLatest);
    });
    const settleTimer = window.setTimeout(scrollToLatest, 180);
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scrollToLatest) : null;
    resizeObserver?.observe(list);
    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
      window.clearTimeout(settleTimer);
      resizeObserver?.disconnect();
    };
  }, [chatMessages, activeChatId]);

  // Keep the keyboard under the browser's native viewport handling; resizing the app shell
  // on iOS Safari can scroll the entire interface away from the active conversation.

  function handleMessageDraftChange(value) {
    setMessageDraft(value);
    const channel = typingChannelRef.current;
    if (!channel || !typingChannelReadyRef.current || !session?.user?.id || !activeChatId) return;
    channel.send({ type: 'broadcast', event: 'typing', payload: { userId: session.user.id, isTyping: Boolean(value.trim()) } });
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    if (value.trim()) {
      typingStopTimerRef.current = setTimeout(() => {
        channel.send({ type: 'broadcast', event: 'typing', payload: { userId: session.user.id, isTyping: false } });
      }, 1800);
    }
  }

  function chooseMessageImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      setChatError('Choose a photo or video from your library.');
      event.target.value = '';
      return;
    }
    const maxBytes = file.type.startsWith('video/') ? 20 * 1024 * 1024 : 8 * 1024 * 1024;
    if (file.size > maxBytes) {
      setChatError(file.type.startsWith('video/') ? 'Videos must be 20 MB or smaller.' : 'Photos must be 8 MB or smaller.');
      event.target.value = '';
      return;
    }
    setChatError('');
    setMessageImage(file);
    setMessageImagePreview(URL.createObjectURL(file));
  }

  React.useEffect(() => {
    return () => { if (messageImagePreview) URL.revokeObjectURL(messageImagePreview); };
  }, [messageImagePreview]);

  async function sendMessage(e) {
    e.preventDefault();
    const body = messageDraft.trim();
    if ((!body && !messageImage) || !activeChatId || !session?.user?.id || !supabase || sendingMessage) return;
    setSendingMessage(true);
    setChatError('');
    try {
      let mediaUrl = null;
      if (messageImage) {
        const extension = (messageImage.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        const path = session.user.id + '/chat/' + crypto.randomUUID() + '.' + extension;
        const { error: uploadError } = await supabase.storage.from('post-media').upload(path, messageImage, {
          cacheControl: '3600', upsert: false, contentType: messageImage.type
        });
        if (uploadError) throw uploadError;
        mediaUrl = supabase.storage.from('post-media').getPublicUrl(path).data.publicUrl;
      }
      const { data, error } = await supabase
        .from('messages')
        .insert({
          id: crypto.randomUUID(),
          conversation_id: activeChatId,
          sender_id: session.user.id,
          body,
          media_url: mediaUrl
        })
        .select('id,conversation_id,sender_id,body,media_url,created_at')
        .single();
      if (error) throw error;
      setChatMessages((current) => current.some((message) => message.id === data.id) ? current : [...current, data]);
      // Request a background push for the other conversation members; this does not block sending.
      requestServerPush('message', data.id);
      setMessageDraft('');
      setMessageImage(null);
      setMessageImagePreview('');
      if (messageFileRef.current) messageFileRef.current.value = '';
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
  const unreadMessageCount = chatList.reduce((total, chat) => total + (chat.unreadCount || 0), 0);
  const filteredProfiles = profiles.filter((profile) => {
    const needle = profileSearch.trim().toLowerCase();
    if (!needle) return false;
    return [cleanUsername(profile.username), profile.display_name].some((value) => (value || '').toLowerCase().includes(needle));
  });

  return <div className="app">
    <header className="instagram-topbar">
      <button className="brand" onClick={() => setTab('Home')} aria-label="VYBORA home"><span className="logo">v.</span><span>vybora</span></button>
      <span className="tag">YOUR WORLD, YOUR PEOPLE</span>
      <div className="topbar-actions">
        <button className="topbar-icon" onClick={() => setTab('Notifications')} aria-label="Notifications"><Heart size={25} strokeWidth={1.9}/>{notifications.filter(n=>!n.is_read).length>0&&<i className="topbar-badge">{notifications.filter(n=>!n.is_read).length>99?'99+':notifications.filter(n=>!n.is_read).length}</i>}</button>
        <button className="topbar-icon" onClick={() => setTab('Messages')} aria-label="Messages"><Send size={24} strokeWidth={1.9}/>{unreadMessageCount>0&&<i className="topbar-badge">{unreadMessageCount>99?'99+':unreadMessageCount}</i>}</button>
        <button className="avatar header-avatar" onClick={() => setTab('Profile')} aria-label="Open profile">{myProfile?.avatar_url ? <img src={myProfile.avatar_url} alt="" /> : (myProfile?.display_name || cleanUsername(myProfile?.username) || session?.user?.email || 'V')[0].toUpperCase()}</button>
      </div>
    </header>
    <nav>{['Home', 'Explore', 'Reels', 'Messages', 'Notifications', 'Profile'].map((t) =>
      <button className={tab === t ? 'active' : ''} onClick={() => setTab(t)} key={t}>
        {({ Home: <House size={18} strokeWidth={2} />, Explore: <Compass size={18} strokeWidth={2} />, Reels: <Play size={18} strokeWidth={2} />, Messages: <MessageCircle size={18} strokeWidth={2} />, Notifications: <Bell size={18} strokeWidth={2} />, Profile: <UserRound size={18} strokeWidth={2} /> })[t]} <span>{t}</span>{t === 'Notifications' && notifications.filter((n) => !n.is_read).length > 0 && <i className="nav-unread-count">{notifications.filter((n) => !n.is_read).length > 99 ? '99+' : notifications.filter((n) => !n.is_read).length}</i>}{t === 'Messages' && unreadMessageCount > 0 && <i className="nav-unread-count">{unreadMessageCount > 99 ? '99+' : unreadMessageCount}</i>}
      </button>
    )}</nav>
    <main>
      {tab === 'Home' && <section className="welcome">
        <p className="eyebrow">YOUR SPACE. YOUR PEOPLE.</p>
        <h1>Stay close to<br /><em>your world.</em></h1>
        <p className="muted">Share your moments. Find your people. Be yourself.</p>
        <div className="pills"><span>✦ Your community</span><span>◉ Real moments</span></div>
      </section>}

      {tab === 'Reels' ? <ReelsPanel session={session} /> : tab === 'Home' ? <>
        <section className="stories">
          <div className="sectionhead story-heading"><div className="story-heading-copy"><span className="story-brand-mark" aria-hidden="true">✦</span><div><h2>Stories</h2><p>Share what’s happening in your world ✨</p></div></div><span className="story-expiry">◷ &nbsp; Disappears after 24 hours</span></div>
          {!session ? <p className="story-muted">Sign in to share and view stories.</p> : <>
            <form className="story-compose" onSubmit={publishStory}>
              <input ref={storyFileRef} className="story-file-input" type="file" accept="image/*,video/*" onChange={(event) => { setStoryFile(event.target.files?.[0] || null); setStoryError(''); }} />
              <div className="story-media-tools" aria-label="Choose story media"><button type="button" onClick={() => {setStoryTextMode(false);storyFileRef.current?.click();}}><span>◎</span><small>Camera</small></button><button type="button" onClick={() => {setStoryTextMode(false);storyFileRef.current?.click();}}><span>▧</span><small>Gallery</small></button><button type="button" onClick={() => {setStoryTextMode(false);storyFileRef.current?.click();}}><span>▶</span><small>Video</small></button><button type="button" aria-pressed={storyTextMode} onClick={() => {setStoryTextMode(true);setStoryFile(null);if(storyFileRef.current)storyFileRef.current.value='';setStoryError('');}}><span>Aa</span><small>Text</small></button></div>
              <input className="story-caption-input" value={storyCaption} onChange={(event) => setStoryCaption(event.target.value)} maxLength={180} placeholder={storyTextMode ? 'Write your text story…' : 'Add a caption (optional)…'} aria-label={storyTextMode ? 'Text story' : 'Story caption'} />
              {storyTextMode && <p className="story-muted">Your words will appear on a VYBORA story card.</p>}
              <button className="story-publish-button" type="submit" disabled={(!storyFile && !(storyTextMode && storyCaption.trim())) || storyBusy}>{storyBusy ? 'Sharing…' : <>➤{' '}Share Story</>}</button>
            </form>
            {storyError && <p className="story-alert" role="alert">{storyError}</p>}
            {storyNotice && <p className="story-notice" role="status">{storyNotice}</p>}
            <div className="storyrow storyrow-live">
              <button className="story" type="button" onClick={() => {
                const ownStories = stories.filter((item) => item.user_id === session.user.id);
                if (ownStories.length) openStory(ownStories[0]);
                else storyFileRef.current?.click();
              }}>
                <div className="ring ring0"><span>{myProfile?.avatar_url ? <img src={myProfile.avatar_url} alt="" /> : '＋'}</span></div>
                <small>{cleanUsername(myProfile?.username) || 'Your story'}</small>
              </button>
              {stories.filter((item) => item.user_id !== session.user.id).reduce((groups, item) => {
                if (!groups.some((group) => group.user_id === item.user_id)) groups.push(item);
                return groups;
              }, []).map((story) => {
                const profile = story.profile || {};
                const label = profile.display_name || cleanUsername(profile.username) || 'VYBORA member';
                return <button className="story" type="button" key={story.user_id} onClick={() => openStory(story)}>
                  <div className="ring"><span>{profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : label[0]?.toUpperCase()}</span></div>
                  <small>{label}</small>
                </button>;
              })}
            </div>
            {!stories.length && <p className="story-muted">No active stories yet. Share the first moment ✦</p>}
          </>}
        </section>
        <section className="composer">
          <div className="avatar">{session?.user?.email?.[0]?.toUpperCase() || 'V'}</div>
          <div className="composebody">
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={session ? "What's happening in your world?" : "Sign in to share with your world…"} />
            {postImagePreview && <div className="post-image-preview">{postMediaType === 'video' ? <video src={postImagePreview} controls playsInline disablePictureInPicture preload="metadata" /> : <img src={postImagePreview} alt="Post preview" />}<button type="button" onClick={() => { setPostImage(null); setPostMediaType(''); setPostImagePreview(''); if (postFileRef.current) postFileRef.current.value = ''; }}>Remove media ×</button></div>}
            <input ref={postFileRef} className="visually-hidden-file" type="file" accept="image/*,video/*" onChange={choosePostImage} />
            <div className="composefoot"><button className="photo-pick" type="button" onClick={() => { setPostError(''); postFileRef.current?.click(); }}>＋ Photo / Video</button><span>✧ Share a moment</span><button onClick={publishPost} disabled={postBusy}>{postBusy ? 'Posting…' : 'Post ↗'}</button></div>
          </div>
        </section>
        {postError && <p className="post-alert" role="alert">{postError}</p>}
        <section className="feed">
          <div className="sectionhead"><h2>Your feed <small className="feed-count">{posts.length} {posts.length === 1 ? "moment" : "moments"}</small></h2><button className="refresh-button" onClick={loadPosts}><RefreshCw size={14} /> Refresh</button></div>
          {engagementError && <p className="post-alert" role="alert">{engagementError}</p>}
          {posts.length ? posts.map((p) => <article className={'post ' + (highlightedPostId === p.id ? 'post-highlight' : '')} id={'post-' + p.id} key={p.id}>
            <div className="posthead"><button type="button" className="post-author-open" onClick={() => { const profile = profiles.find((item) => item.id === p.user_id); if (profile) openUserProfile(profile); else setChatNotice('Profile details are not available yet.'); }} aria-label={'Open ' + p.user + ' profile'}><div className="avatar">{p.avatar_url ? <img src={p.avatar_url} alt="" /> : (p.user?.[0]?.toUpperCase() || 'V')}</div><span className="post-author-copy"><b>{p.user}</b><small>{p.handle} · {p.time}</small></span></button><button className="dots" aria-label="More post options">•••</button></div>
            {p.text && <p className="posttext">{p.text}</p>}
            {p.image_url && (p.image_url.match(/\.(mp4|mov|webm|m4v)(\?|$)/i) ? <video className="post-image post-video" src={p.image_url} controls playsInline disablePictureInPicture preload="metadata" /> : <img className="post-image" src={p.image_url} alt={'Photo shared by ' + p.user} loading="lazy" />)}
            <div className="postactions">
              <button onClick={() => toggleLike(p)} className={liked[p.id] ? 'liked' : ''}>{liked[p.id] ? <Heart size={17} fill="currentColor" /> : <Heart size={17} />} {p.likes}</button>
              <button onClick={() => toggleComments(p)}><MessageSquare size={16} strokeWidth={2} /> Comment {p.comments || 0}</button>
              <button onClick={() => { if (p.image_url) { navigator.clipboard?.writeText(p.image_url); setChatNotice('Post media link copied when clipboard access is available.'); } else setChatNotice('Share links are coming in a future VYBORA update.'); }}><Share2 size={16} strokeWidth={2} /> Share</button>
              <button onClick={(e) => e.currentTarget.classList.toggle('saved')}><Bookmark size={16} strokeWidth={2} /> Save</button>
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
                <div className="mini-avatar">{profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : (profile.display_name || cleanUsername(profile.username) || '?')[0].toUpperCase()}</div>
                <div className="profile-result-name"><b>{profile.display_name || cleanUsername(profile.username) || 'VYBORA user'}</b><small>{profile.username ? '@' + cleanUsername(profile.username) : ''}</small></div>
                <button disabled={!!startingChatId} onClick={() => startConversation(profile)}>{startingChatId === profile.id ? 'Opening…' : 'Message'}</button>
              </div>) : <p className="search-hint">No matching profiles found.</p>}
            </div>}
          </div>
          <div className="chat-layout">
            <aside className={'chat-list ' + (activeChatId ? 'chat-list-in-thread' : 'chat-list-only')}>
              <div className="chat-list-heading">Your chats {chatLoading ? '· Loading…' : ''}</div>
              {chatList.length ? chatList.map((chat) => <button key={chat.id} className={'chat-list-item ' + (chat.id === activeChatId ? 'selected' : '')} onClick={() => { setActiveChatId(chat.id); setChatError(''); setChatNotice(''); }}>
                <div className="mini-avatar">{!chat.is_group && chat.otherProfiles?.[0]?.avatar_url ? <img src={chat.otherProfiles[0].avatar_url} alt="" /> : (chat.label || 'C')[0].toUpperCase()}</div>
                <span className="chat-list-copy">
                  <span className="chat-list-label">{chat.label}</span>
                  <small className="chat-preview">{chat.lastMessage ? (chat.lastMessage.sender_id === session.user.id ? 'You: ' : '') + (chat.lastMessage.body || (chat.lastMessage.media_url ? '📷 Photo' : 'Message')) : 'No messages yet'}</small>
                  {!chat.is_group && <small className={(chat.otherProfiles?.[0]?.last_seen_at && Date.now() - new Date(chat.otherProfiles[0].last_seen_at).getTime() < 90000) ? 'presence-online' : 'presence-offline'}>{presenceLabel(chat.otherProfiles?.[0])}</small>}
                </span>
                <span className="chat-list-meta">{chat.lastActivityAt ? new Date(chat.lastActivityAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}{chat.is_group && <small>Group</small>}{chat.unreadCount > 0 && <b className="chat-unread-badge" aria-label={chat.unreadCount + ' unread messages'}>{chat.unreadCount > 99 ? '99+' : chat.unreadCount}</b>}</span>
              </button>) : !chatLoading ? <p className="search-hint">No conversations yet. Search for a person above to start one.</p> : null}
            </aside>
            <section className="chat-thread">
              {activeChat ? <>
                <div className="thread-heading"><button className="chat-back-button" type="button" onClick={() => { setActiveChatId(''); setChatMessages([]); setChatError(''); setChatNotice(''); }} aria-label="Back to conversations">‹ Back</button><div className="mini-avatar">{!activeChat.is_group && activeChat.otherProfiles?.[0]?.avatar_url ? <img src={activeChat.otherProfiles[0].avatar_url} alt="" /> : (activeChat.label || 'C')[0].toUpperCase()}</div><div className="thread-person"><b>{activeChat.label}</b><small>{activeChat.is_group ? 'Group conversation' : presenceLabel(activeChat.otherProfiles?.[0])}</small></div></div>
                <div className="message-list" aria-live="polite" ref={messageListRef}>
                  {chatMessages.length ? chatMessages.map((message) => <div key={message.id} className={'message-row ' + (message.sender_id === session.user.id ? 'mine' : 'theirs')}>
                    <div className="message-bubble">{message.media_url && (message.media_url.match(/\.(mp4|webm|mov|m4v)(\?|$)/i) ? <video className="message-video" src={message.media_url} controls playsInline preload="metadata" /> : <a className="message-photo-link" href={message.media_url} target="_blank" rel="noreferrer"><img className="message-photo" src={message.media_url} alt="Photo message" loading="lazy" /></a>)}{message.body && <p>{message.body}</p>}<small>{message.created_at ? new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}{message.sender_id === session.user.id && <span className={'message-receipt ' + (messageHasBeenSeen(message) ? 'is-seen' : '')}> · {messageHasBeenSeen(message) ? 'Seen ✓✓' : 'Sent ✓'}</span>}</small></div>
                  </div>) : <p className="search-hint thread-empty">No messages yet. Say hello 👋</p>}
                </div>
                {typingUserId && <p className="typing-indicator" aria-live="polite">{activeChat?.otherProfiles?.find((profile) => profile.id === typingUserId)?.display_name || cleanUsername(activeChat?.otherProfiles?.find((profile) => profile.id === typingUserId)?.username) || 'Someone'} is typing<span>…</span></p>}
                {messageImagePreview && <div className="message-image-preview">{messageImage?.type?.startsWith('video/') ? <video src={messageImagePreview} controls playsInline preload="metadata" aria-label="Video preview" /> : <img src={messageImagePreview} alt="Photo preview" />}<button type="button" onClick={() => { setMessageImage(null); setMessageImagePreview(''); if (messageFileRef.current) messageFileRef.current.value = ''; }} aria-label="Remove selected media"><X size={16} /></button></div>}
                <form className="message-composer" onSubmit={sendMessage}>
                  <input ref={messageFileRef} className="message-file-input" type="file" accept="image/*,video/*" onChange={chooseMessageImage} aria-label="Choose a photo or video" />
                  <button className="message-photo-button" type="button" onClick={() => messageFileRef.current?.click()} disabled={sendingMessage} aria-label="Add a photo or video" title="Add a photo or video"><ImagePlus size={19} /></button>
                  <input value={messageDraft} onChange={(e) => handleMessageDraftChange(e.target.value)} maxLength={5000} placeholder="Write a message…" aria-label="Write a message" />
                  <button type="submit" disabled={sendingMessage || (!messageDraft.trim() && !messageImage)}>{sendingMessage ? 'Sending…' : <><Send size={16} strokeWidth={2.2} /> Send</>}</button>
                </form>
              </> : null}
            </section>
          </div>
        </>}
      </section> : tab === 'Notifications' ? <section className="messages-panel notifications-panel">
        <div className="messages-heading"><div><p className="eyebrow">YOUR COMMUNITY</p><h2>Notifications</h2></div><button className="refresh-button" onClick={loadNotifications}>Refresh ↻</button></div>
        {!session ? <div className="chat-empty"><div className="bigicon">♡</div><h3>Sign in to see notifications</h3><p>Likes and comments on your posts will show up here.</p><button onClick={() => setTab('Profile')}>Go to sign in</button></div> : <>
          <div className="push-optin"><div><b>Push notifications</b><small>Get alerts even when VYBORA is closed.</small></div><button type="button" disabled={pushBusy} onClick={enablePushNotifications}>{pushBusy ? 'Please wait…' : 'Enable'}</button><button type="button" className="push-disable" disabled={pushBusy} onClick={disablePushNotifications}>Turn off</button></div>
          {pushStatus && <p className="push-status" role="status">{pushStatus}</p>}
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
      </section> : tab === 'Profile' ? viewedProfile ? <section className="placeholder auth-panel user-profile-view"><button type="button" className="profile-back-link" onClick={() => setViewedProfile(null)}>‹ My profile</button><div className="profile-avatar-large">{viewedProfile.avatar_url ? <img src={viewedProfile.avatar_url} alt="" /> : (viewedProfile.display_name || cleanUsername(viewedProfile.username) || 'V')[0].toUpperCase()}</div><h2>{viewedProfile.display_name || cleanUsername(viewedProfile.username) || 'VYBORA member'}</h2><p className="profile-handle">{viewedProfile.username ? '@' + cleanUsername(viewedProfile.username) : 'VYBORA member'}</p><div className="follow-stats"><div><b>{viewedProfileStats.posts}</b><small>Posts</small></div><div><b>{viewedProfileStats.followers}</b><small>Followers</small></div><div><b>{viewedProfileStats.following}</b><small>Following</small></div></div><button type="button" disabled={followBusyId === viewedProfile.id} className={followingIds.includes(viewedProfile.id) ? 'following-button' : 'follow-button'} onClick={() => toggleFollow(viewedProfile)}>{followBusyId === viewedProfile.id ? '…' : followingIds.includes(viewedProfile.id) ? 'Following' : 'Follow'}</button><div className="profile-post-grid">{posts.filter((post) => post.user_id === viewedProfile.id).map((post) => <article className="profile-post-tile" key={post.id}>{post.image_url ? (post.image_url.match(/\\.(mp4|webm|mov)(\\?|$)/i) ? <video src={post.image_url} controls playsInline /> : <img src={post.image_url} alt="Post" loading="lazy" />) : <p>{post.text}</p>}</article>)}</div>{!posts.some((post) => post.user_id === viewedProfile.id) && <p className="muted">No posts yet.</p>}{followError && <p className="post-alert" role="alert">{followError}</p>}</section> : <section className="placeholder auth-panel">
        {session ? <><div className="profile-avatar-large own-profile-avatar">{(profileAvatarPreview || myProfile?.avatar_url) ? <img src={profileAvatarPreview || myProfile.avatar_url} alt="Your profile photo" /> : (myProfile?.display_name || cleanUsername(myProfile?.username) || 'V')[0].toUpperCase()}</div><h2>{myProfile?.display_name || cleanUsername(myProfile?.username) || 'Your profile'}</h2></> : <><div className="bigicon">◉</div><h2>Join VYBORA</h2></>}
        {session ? <><p className="profile-handle">{myProfile?.username ? '@' + cleanUsername(myProfile.username) : session.user.email}</p><button type="button" className="edit-profile-button" onClick={() => profileEditOpen ? setProfileEditOpen(false) : startProfileEdit()}>{profileEditOpen ? 'Cancel editing' : 'Edit profile'}</button>{profileEditOpen && <form className="profile-edit-form" onSubmit={saveProfile}><label htmlFor="profile-display-name">Display name</label><input id="profile-display-name" value={profileNameDraft} onChange={(e) => setProfileNameDraft(e.target.value)} maxLength={40} placeholder="Your name" /><label htmlFor="profile-avatar-file">Profile photo</label><input id="profile-avatar-file" type="file" accept="image/*" onChange={chooseProfileAvatar} /><small>Choose an image up to 5 MB.</small><button type="submit" disabled={profileSaveBusy}>{profileSaveBusy ? 'Saving…' : 'Save profile'}</button>{profileSaveMessage && <p className="profile-save-message" role="status">{profileSaveMessage}</p>}</form>}{!profileEditOpen && profileSaveMessage && <p className="profile-save-message" role="status">{profileSaveMessage}</p>}<div className="follow-stats"><div><b>{posts.filter((post) => post.handle === (myProfile?.username ? '@' + cleanUsername(myProfile.username) : '')).length}</b><small>Posts</small></div><div><b>{followStats.followers}</b><small>Followers</small></div><div><b>{followStats.following}</b><small>Following</small></div></div><p>Build your VYBORA community. Follow people whose moments you want to see.</p><div className="people-heading"><h3>Discover people</h3><span>{profiles.length} members</span></div><input className="explore-input" value={profileSearch} onChange={(e) => setProfileSearch(e.target.value)} placeholder="Search people by name or username…" />{followError && <p className="post-alert" role="alert">{followError}</p>}<div className="people-list">{profiles.filter((profile) => !profileSearch.trim() || [cleanUsername(profile.username), profile.display_name].some((value) => (value || '').toLowerCase().includes(profileSearch.trim().toLowerCase()))).map((profile) => <div className="people-row" key={profile.id}><button type="button" className="people-open-profile" onClick={() => openUserProfile(profile)}><div className="people-avatar">{profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : (profile.display_name || cleanUsername(profile.username) || 'V')[0].toUpperCase()}</div><span className="people-copy"><b>{profile.display_name || cleanUsername(profile.username) || 'VYBORA member'}</b><small>{profile.username ? '@' + cleanUsername(profile.username) : 'VYBORA member'}</small></span></button><button type="button" disabled={followBusyId === profile.id} className={followingIds.includes(profile.id) ? 'following-button' : 'follow-button'} onClick={() => toggleFollow(profile)}>{followBusyId === profile.id ? '…' : followingIds.includes(profile.id) ? 'Following' : 'Follow'}</button></div>)}{!profiles.length && <p className="muted">More people will appear here as they join VYBORA.</p>}</div><button onClick={handleSignOut}>Sign out</button></> : <>
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
      </section> : <section className="placeholder discovery-panel"><div className="bigicon">{tab === 'Explore' ? <Search size={34} fill="currentColor" /> : <Bell size={34} fill="currentColor" />}</div><p className="eyebrow">{tab === 'Explore' ? 'FIND YOUR NEXT FAVOURITE' : 'THE LITTLE THINGS THAT CONNECT US'}</p><h2>{tab === 'Explore' ? 'Explore your world.' : 'Your activity.'}</h2><p>{tab === 'Explore' ? 'Discover moments, people and new perspectives. Search the community below.' : 'You’re all caught up. Updates will appear here as your community grows.'}</p>{tab === 'Explore' && <input className="explore-input" value={exploreSearch} onChange={(e) => setExploreSearch(e.target.value)} placeholder="Search posts or people…" />}{tab === 'Explore' && <div className="explore-community">
          <div className="people-heading"><h3>People to follow</h3><span>{profiles.length} members</span></div>
          {followError && <p className="post-alert" role="alert">{followError}</p>}
          <div className="people-list">{profiles.filter((profile) => !exploreSearch.trim() || [cleanUsername(profile.username), profile.display_name].some((value) => (value || '').toLowerCase().includes(exploreSearch.trim().toLowerCase()))).slice(0, 12).map((profile) => <div className="people-row" key={profile.id}><button type="button" className="people-open-profile" onClick={() => openUserProfile(profile)} aria-label={'Open ' + (profile.display_name || cleanUsername(profile.username) || 'member') + ' profile'}><div className="people-avatar">{profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : (profile.display_name || cleanUsername(profile.username) || 'V')[0].toUpperCase()}</div><span className="people-copy"><b>{profile.display_name || cleanUsername(profile.username) || 'VYBORA member'}</b><small>{profile.username ? '@' + cleanUsername(profile.username) : 'VYBORA member'}</small></span></button><button type="button" disabled={followBusyId === profile.id} className={followingIds.includes(profile.id) ? 'following-button' : 'follow-button'} onClick={() => toggleFollow(profile)}>{followBusyId === profile.id ? '…' : followingIds.includes(profile.id) ? 'Following' : 'Follow'}</button></div>)}{!profiles.length && <p className="muted">Sign in and more people will appear here as they join VYBORA.</p>}{profiles.length > 0 && exploreSearch.trim() && !profiles.some((profile) => [cleanUsername(profile.username), profile.display_name].some((value) => (value || '').toLowerCase().includes(exploreSearch.trim().toLowerCase()))) && <p className="muted">No matching people yet.</p>}</div>
          <div className="people-heading"><h3>Community posts</h3><span>{posts.length} recent</span></div>
          <div className="explore-results">{posts.filter(p => !exploreSearch.trim() || (p.text + ' ' + p.user + ' ' + p.handle).toLowerCase().includes(exploreSearch.toLowerCase())).map(p => <article className="post" key={p.id}><button type="button" className="explore-post-author explore-post-author-button" onClick={() => { const profile = profiles.find((item) => item.id === p.user_id); if (profile) openUserProfile(profile); else setChatNotice('Profile details are not available yet.'); }}><b>{p.user}</b><small>{p.handle}</small></button>{p.text && <p className="posttext">{p.text}</p>}{p.image_url && (p.image_url.match(/\.(mp4|webm|mov|m4v)(\?|$)/i) ? <div className="explore-video-wrap"><video className="post-image explore-post-video" src={p.image_url} controls playsInline disablePictureInPicture muted={exploreVideoMuted[p.id] !== false} preload="metadata" /><button type="button" className="explore-video-sound-toggle" aria-label={exploreVideoMuted[p.id] === false ? 'Mute video sound' : 'Turn video sound on'} onClick={() => setExploreVideoMuted(current => ({...current, [p.id]: current[p.id] === false}))}>{exploreVideoMuted[p.id] === false ? <Volume2 size={19} /> : <VolumeX size={19} />}<span>{exploreVideoMuted[p.id] === false ? 'Sound on' : 'Sound off'}</span></button></div> : <img className="post-image" src={p.image_url} alt="Community post" loading="lazy" />)}</article>)}{!posts.length && <p className="muted">New community posts will appear here.</p>}</div>
        </div>}<button onClick={() => setTab('Home')}>Back to home</button></section>}
      <footer>VYBORA © 2026 <span>Made for your world ✦</span></footer>
    </main>
    <nav className="mobile-nav instagram-bottom-nav">{[['Home',<House size={25} strokeWidth={1.9} />],['Explore',<Search size={25} strokeWidth={1.9} />],['Create',<PlusSquare size={27} strokeWidth={1.9} />],['Reels',<Play size={25} strokeWidth={1.9} />],['Profile',myProfile?.avatar_url?<img className="bottom-profile-photo" src={myProfile.avatar_url} alt="" />:<UserRound size={24} strokeWidth={1.9} />]].map(([name,icon]) => <button key={name} className={tab === name ? 'active' : ''} aria-label={name==='Create'?'Create post':name} onClick={() => name === 'Create' ? (setTab('Home'), document.querySelector('.composebody textarea')?.focus()) : setTab(name)}><span>{icon}</span></button>)}</nav>
    {activeStory && <div className="story-overlay" role="dialog" aria-modal="true" aria-label="Story viewer" onClick={() => setActiveStory(null)}>
      <div className="story-viewer story-instagram" onClick={(event) => event.stopPropagation()}>
        <div className="story-progress-row">{stories.map((item,index)=><span className="story-progress-track" key={item.id}><i className={item.id===activeStory.id?'current':index<stories.findIndex(st=>st.id===activeStory.id)?'done':''}/></span>)}</div>
        <div className="story-viewer-top story-instagram-header"><span className="story-avatar-small">{activeStory.profile?.avatar_url ? <img src={activeStory.profile.avatar_url} alt="" /> : (activeStory.profile?.display_name || cleanUsername(activeStory.profile?.username) || 'V')[0].toUpperCase()}</span><span className="story-viewer-owner">{activeStory.profile?.display_name || cleanUsername(activeStory.profile?.username) || 'VYBORA member'}<small> • Story</small></span><button type="button" onClick={() => setActiveStory(null)} aria-label="Close story">×</button></div>
        <div className="story-viewer-media" onTouchStart={event=>{event.currentTarget.dataset.touchX=String(event.touches[0].clientX)}} onTouchEnd={event=>{const start=Number(event.currentTarget.dataset.touchX||0),delta=event.changedTouches[0].clientX-start;if(Math.abs(delta)>55){const i=stories.findIndex(item=>item.id===activeStory.id);if(delta<0&&i<stories.length-1)openStory(stories[i+1]);else if(delta>0&&i>0)openStory(stories[i-1]);}}}>
          {activeStory.media_type === 'video' ? <video key={activeStory.id} src={activeStory.media_url} autoPlay playsInline disablePictureInPicture /> : <img key={activeStory.id} src={activeStory.media_url} alt="Story" />}
          {activeStory.caption && <p className="story-viewer-caption">{activeStory.caption}</p>}
          <button type="button" className="story-tap-zone story-tap-left" aria-label="Previous story" disabled={stories.findIndex(item => item.id === activeStory.id) <= 0} onClick={() => { const i = stories.findIndex(item => item.id === activeStory.id); if (i > 0) openStory(stories[i - 1]); }} />
          <button type="button" className="story-tap-zone story-tap-right" aria-label="Next story" disabled={stories.findIndex(item => item.id === activeStory.id) >= stories.length - 1} onClick={() => { const i = stories.findIndex(item => item.id === activeStory.id); if (i >= 0 && i < stories.length - 1) openStory(stories[i + 1]); }} />
        </div>
        <div className="story-instagram-footer"><span>Reply to {activeStory.profile?.display_name || cleanUsername(activeStory.profile?.username) || 'story'}…</span><span className="story-reaction-heart">♡</span><span className="story-reaction-send">➤</span></div>
        <div className="story-viewer-bottom">
          <span>{activeStory.isOwn ? (activeStory.views?.length || 0) + ' views' : 'Shared with the VYBORA community'}</span>
          {activeStory.isOwn && <details className="story-viewers"><summary>View viewers</summary>
            {activeStory.viewerProfiles?.length ? activeStory.viewerProfiles.map((person) => <div className="story-viewer-person" key={person.id}><span>{person.avatar_url ? <img src={person.avatar_url} alt="" /> : (person.display_name || cleanUsername(person.username) || 'V')[0].toUpperCase()}</span><b>{person.display_name || cleanUsername(person.username) || 'VYBORA member'}</b></div>) : <small>No viewers yet.</small>}
          </details>}
          {activeStory.isOwn && <button type="button" className="story-delete-button" onClick={async () => {
            const { error } = await supabase.from('stories').delete().eq('id', activeStory.id);
            if (error) { setStoryError('Could not delete story: ' + error.message); return; }
            setActiveStory(null);
            await loadStories();
          }}>Delete story</button>}
        </div>
      </div>
    </div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);

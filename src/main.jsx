import React from 'react';
import { createRoot } from 'react-dom/client';
import { supabase, supabaseConfigured } from './supabase.js';
import './style.css';

function App(){
  const [tab,setTab]=React.useState('Home');
  const [liked,setLiked]=React.useState({});
  const [draft,setDraft]=React.useState('');
  const [posts,setPosts]=React.useState([{id:1,user:'Ama K.',handle:'@amak',time:'12 min',text:'Small moments, big memories. ✨',likes:24},{id:2,user:'Kojo Mensah',handle:'@kojo',time:'1 hr',text:'Building something new. One step at a time 🚀',likes:11}]);
  const [session,setSession]=React.useState(null);
  const [authMode,setAuthMode]=React.useState('signin');
  const [email,setEmail]=React.useState('');
  const [password,setPassword]=React.useState('');
  const [authBusy,setAuthBusy]=React.useState(false);
  const [authMessage,setAuthMessage]=React.useState('');

  React.useEffect(()=>{
    if(!supabase) return;
    supabase.auth.getSession().then(({data})=>setSession(data.session));
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,nextSession)=>setSession(nextSession));
    return ()=>subscription.unsubscribe();
  },[]);

  async function handleAuth(e){
    e.preventDefault();
    if(!supabase){setAuthMessage('Supabase is not configured yet. Check the GitHub Actions build variables.');return;}
    setAuthBusy(true);setAuthMessage('');
    try{
      if(authMode==='signup'){
        const {data,error}=await supabase.auth.signUp({
          email:email.trim(),
          password,
          options:{emailRedirectTo:'https://jerricksmith92-web.github.io/VYBORA-/'}
        });
        if(error) throw error;
        if(data.session){setSession(data.session);setAuthMessage('Account created successfully!');}
        else setAuthMessage('Check your email for a confirmation link, then sign in.');
      }else{
        const {data,error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
        if(error) throw error;
        setSession(data.session);setAuthMessage('You are signed in.');
      }
    }catch(err){setAuthMessage(err.message||'Could not complete authentication. Please try again.');}
    finally{setAuthBusy(false);}
  }

  async function handleSignOut(){
    if(supabase) await supabase.auth.signOut();
    setSession(null);setAuthMessage('You have signed out.');
  }

  return <div className="app">
    <header><div className="brand"><span className="logo">V</span><span>VYBORA</span></div><span className="tag">YOUR WORLD, YOUR PEOPLE</span><div className="avatar">{session?.user?.email?.[0]?.toUpperCase()||'J'}</div></header>
    <nav>{['Home','Explore','Messages','Notifications','Profile'].map(t=><button className={tab===t?'active':''} onClick={()=>setTab(t)} key={t}>{({Home:'⌂',Explore:'⌕',Messages:'▤',Notifications:'♡',Profile:'◉'})[t]} <span>{t}</span></button>)}</nav>
    <main>
      <section className="welcome"><p className="eyebrow">YOUR SPACE. YOUR PEOPLE.</p><h1>Stay close to<br/><em>your world.</em></h1><p className="muted">Share your moments. Find your people. Be yourself.</p><div className="pills"><span>✦ Your community</span><span>◉ Real moments</span></div></section>
      {tab==='Home'?<>
        <section className="stories"><div className="sectionhead"><h2>Stories</h2><span>See all →</span></div><div className="storyrow">{['You','Ama','Kojo','Abena','Kwame'].map((n,i)=><button className="story" key={n} onClick={()=>alert(i===0?'Story uploads will be connected next.':n+'’s demo story')}><div className={'ring ring'+i}><span>{['＋','A','K','A','K'][i]}</span></div><small>{n}</small></button>)}</div></section>
        <section className="composer"><div className="avatar">{session?.user?.email?.[0]?.toUpperCase()||'J'}</div><div className="composebody"><textarea value={draft} onChange={e=>setDraft(e.target.value)} placeholder="What's happening in your world?"/><div className="composefoot"><span>✧ Share a moment</span><button onClick={()=>{if(draft.trim()){setPosts([{id:Date.now(),user:session?.user?.email?.split('@')[0]||'You',handle:session?.user?.email||'@you',time:'now',text:draft.trim(),likes:0},...posts]);setDraft('')}}}>Post ↗</button></div></div></section>
        <section className="feed"><div className="sectionhead"><h2>Your feed</h2><span>For you ▾</span></div>{posts.map(p=><article className="post" key={p.id}><div className="posthead"><div className="avatar">{p.user[0]}</div><div><b>{p.user}</b><small>{p.handle} · {p.time}</small></div><button className="dots">•••</button></div><p className="posttext">{p.text}</p><div className="postactions"><button onClick={()=>setLiked({...liked,[p.id]:!liked[p.id]})} className={liked[p.id]?'liked':''}>{liked[p.id]?'♥':'♡'} {p.likes+(liked[p.id]?1:0)}</button><button onClick={()=>alert('Comments will be connected when the backend is added.')}>▢ Comment</button><button onClick={()=>alert('Share feature is coming next.')}>↗ Share</button><button onClick={e=>e.currentTarget.classList.toggle('saved')}>♧ Save</button></div></article>)}</section>
      </>:tab==='Profile'?<section className="placeholder auth-panel"><div className="bigicon">◉</div><h2>{session?'Your account':'Join VYBORA'}</h2>{session?<><p>You are signed in as <b>{session.user.email}</b>.</p><button onClick={handleSignOut}>Sign out</button></>:<>
        <p>Create an account or sign in to prepare for private messaging.</p>
        <div className="auth-tabs"><button className={authMode==='signin'?'selected':''} onClick={()=>{setAuthMode('signin');setAuthMessage('')}}>Sign in</button><button className={authMode==='signup'?'selected':''} onClick={()=>{setAuthMode('signup');setAuthMessage('')}}>Create account</button></div>
        <form className="auth-form" onSubmit={handleAuth}><label>Email address</label><input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/><label>Password</label><input type="password" autoComplete={authMode==='signup'?'new-password':'current-password'} minLength={6} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters"/><button type="submit" disabled={authBusy}>{authBusy?'Please wait…':authMode==='signup'?'Create account':'Sign in'}</button></form>
      </>}{authMessage&&<p className="auth-message" role="status">{authMessage}</p>}{!supabaseConfigured&&<p className="auth-message">Connection settings were not included in this build. Check repository variables and the latest deployment.</p>}</section>:<section className="placeholder"><div className="bigicon">✦</div><h2>{tab}</h2><p>{tab==='Messages'?'Real conversations are our next step. Sign-in is being prepared first so chats can be private.':'This area is part of VYBORA’s starter interface. We’ll connect it to real user data next.'}</p><button onClick={()=>setTab(tab==='Messages'?'Profile':'Home')}>{tab==='Messages'?'Set up your account':'Back to home'}</button></section>}
      <footer>VYBORA © 2026 <span>Made for your world 💜</span></footer>
    </main>
  </div>
}
createRoot(document.getElementById('root')).render(<App/>);

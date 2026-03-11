import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from './firebase';
import { getDocs, query, where, collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

// Screens
import { LandingPage } from './LandingPage';
import { AuthPage } from './AuthPage';
// Components We will build next
import { Dashboard } from './Dashboard';
import { IDE } from './IDE';

// Types
export interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  content?: string;
  parentId: string | null;
  language?: string;
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState<'landing' | 'auth' | 'dashboard' | 'editor'>(() => {
    return (localStorage.getItem('nova_view') as any) || 'landing';
  });
  
  // App State
  const [files, setFiles] = useState<FileNode[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(() => localStorage.getItem('nova_active_file'));
  const [openTabs, setOpenTabs] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('nova_open_tabs') || '[]'); } catch { return []; }
  });
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('nova_expanded_folders') || '[]')); } catch { return new Set(); }
  });

  useEffect(() => {
    localStorage.setItem('nova_view', view);
  }, [view]);

  useEffect(() => {
    if (activeFileId) localStorage.setItem('nova_active_file', activeFileId);
    else localStorage.removeItem('nova_active_file');
    localStorage.setItem('nova_open_tabs', JSON.stringify(openTabs));
    localStorage.setItem('nova_expanded_folders', JSON.stringify(Array.from(expandedFolders)));
  }, [activeFileId, openTabs, expandedFolders]);
  
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        setView(prev => (prev === 'landing' || prev === 'auth') ? 'dashboard' : prev);
        fetchFiles(u.uid);
      } else {
        setView('landing');
        localStorage.removeItem('nova_view');
      }
    });
    return unsub;
  }, []);

  const fetchFiles = async (uid: string) => {
    const q = query(collection(db, 'files'), where('userId', '==', uid));
    const snapshot = await getDocs(q);
    const loadedFiles = snapshot.docs.map(d => {
      const data = d.data();
      let content = data.content;
      
      // Auto-recover any unsaved drafts from localStorage in case of rapid refresh
      const draft = localStorage.getItem(`nova_draft_${d.id}`);
      if (draft !== null && draft !== content) {
        content = draft;
        // Background sync the draft up to firebase
        updateDoc(doc(db, 'files', d.id), { content: draft })
          .then(() => localStorage.removeItem(`nova_draft_${d.id}`))
          .catch(console.error);
      }
      return { id: d.id, ...data, content } as FileNode;
    });
    setFiles(loadedFiles);
  };

  const handleLogout = async () => {
    await signOut(auth);
    setFiles([]);
    setActiveFileId(null);
    setOpenTabs([]);
  };

  if (authLoading) {
    return <div className="h-screen flex items-center justify-center bg-slate-50">Loading...</div>;
  }

  return (
    <AnimatePresence mode="wait">
      {view === 'landing' && <LandingPage onLoginClick={() => setView('auth')} />}
      {view === 'auth' && <AuthPage onAuthSuccess={() => setView('dashboard')} onBackToLanding={() => setView('landing')} />}
      {user && view === 'dashboard' && (
        <Dashboard 
          user={user} 
          files={files} 
          onOpenIde={() => setView('editor')} 
          onLogout={handleLogout}
          setFiles={setFiles}
        />
      )}
      {user && view === 'editor' && (
        <IDE 
          user={user}
          files={files}
          setFiles={setFiles}
          activeFileId={activeFileId}
          setActiveFileId={setActiveFileId}
          openTabs={openTabs}
          setOpenTabs={setOpenTabs}
          expandedFolders={expandedFolders}
          setExpandedFolders={setExpandedFolders}
          onBackToDashboard={() => setView('dashboard')}
          onLogout={handleLogout}
        />
      )}
    </AnimatePresence>
  );
}

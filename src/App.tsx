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
  const [view, setView] = useState<'landing' | 'auth' | 'dashboard' | 'editor'>('landing');
  
  // App State
  const [files, setFiles] = useState<FileNode[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        setView('dashboard');
        fetchFiles(u.uid);
      } else {
        setView('landing');
      }
    });
    return unsub;
  }, []);

  const fetchFiles = async (uid: string) => {
    const q = query(collection(db, 'files'), where('userId', '==', uid));
    const snapshot = await getDocs(q);
    const loadedFiles = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as FileNode));
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

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { FileCode } from 'lucide-react';
import { auth, db } from './firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile as updateAuthProfile, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { Input, Button } from './components/Button';

export function AuthPage({ onAuthSuccess, onBackToLanding }: { onAuthSuccess: () => void, onBackToLanding: () => void }) {
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const initializeUserFiles = async (uid: string, username: string, email: string) => {
    const userDocRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userDocRef);
    if (!userDoc.exists()) {
      await setDoc(userDocRef, {
        username: username,
        email: email,
        createdAt: new Date()
      });
      
      const rootId = Math.random().toString(36).substr(2, 9);
      await setDoc(doc(db, 'files', rootId), {
        userId: uid,
        name: 'MyProject',
        type: 'folder',
        parentId: null,
        createdAt: new Date()
      });

      const helloId = Math.random().toString(36).substr(2, 9);
      await setDoc(doc(db, 'files', helloId), {
        userId: uid,
        name: 'main.js',
        content: 'console.log("Welcome to CodeLab!")\n',
        type: 'file',
        language: 'javascript',
        parentId: rootId,
        createdAt: new Date()
      });
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      if (authMode === 'signup') {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateAuthProfile(userCredential.user, { displayName });
        await initializeUserFiles(userCredential.user.uid, displayName, email);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      onAuthSuccess();
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      await initializeUserFiles(result.user.uid, result.user.displayName || 'User', result.user.email || '');
      onAuthSuccess();
    } catch (err: any) {
      setError(err.message || 'Google Sign-In failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-transparent p-6 relative">
      <div className="absolute top-4 left-4 z-10">
        <Button variant="ghost" onClick={onBackToLanding}>&larr; Back</Button>
      </div>
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md p-8 glass-elevated rounded-[2.5rem] space-y-8"
      >
        <div className="text-center space-y-3">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-blue-500/30">
            <FileCode className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{authMode === 'login' ? 'Welcome Back' : 'Create Account'}</h1>
          <p className="text-slate-500">{authMode === 'login' ? 'Sign in to access your projects' : 'Start your coding journey today'}</p>
        </div>

        <form onSubmit={handleAuth} className="space-y-5">
          {authMode === 'signup' && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 ml-1">Display Name</label>
              <Input 
                value={displayName} 
                onChange={e => setDisplayName(e.target.value)} 
                placeholder="How should we call you?" 
                required 
              />
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 ml-1">Email Address</label>
            <Input 
              type="email"
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              placeholder="you@example.com" 
              required 
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 ml-1">Password</label>
            <Input 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              placeholder="••••••••" 
              required 
            />
          </div>
          
          {error && <p className="text-sm text-red-500 text-center bg-red-50 p-2 rounded-lg border border-red-100">{error}</p>}
          
          <Button className="w-full py-3.5 rounded-xl text-lg mt-4" type="submit" disabled={loading}>
            {loading ? 'Processing...' : (authMode === 'login' ? 'Sign In' : 'Create Account')}
          </Button>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink-0 mx-4 text-slate-400 text-sm">Or continue with</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex justify-center items-center py-3.5 px-4 border border-slate-200 rounded-xl shadow-sm bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Google
          </button>
        </form>

        <div className="text-center">
          <button 
            type="button"
            onClick={() => {
              setAuthMode(authMode === 'login' ? 'signup' : 'login');
              setError('');
            }}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
          >
            {authMode === 'login' ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

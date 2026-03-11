import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { FileCode, Folder, Trophy, Activity, Code2, Zap, Cpu, Coffee, Settings, LogOut } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Button, Card } from './components/Button';
import { FileNode } from './App';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export function Dashboard({ user, files, onOpenIde, onLogout, setFiles }: any) {
  
  const stats = useMemo(() => {
    const fileNodes = files.filter((f: FileNode) => f.type === 'file');
    const folderNodes = files.filter((f: FileNode) => f.type === 'folder');
    
    const langMap: Record<string, number> = {};
    fileNodes.forEach((f: FileNode) => {
      const l = f.language || 'plaintext';
      langMap[l] = (langMap[l] || 0) + 1;
    });
    
    const languages = Object.keys(langMap).map(k => ({ language: k, count: langMap[k] }));
    
    return {
      totalFiles: fileNodes.length,
      totalFolders: folderNodes.length,
      languages,
      level: Math.floor(fileNodes.length / 5) + 1
    };
  }, [files]);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  const createProject = async () => {
    const parentId = null;
    const name = prompt("Enter Project Name:");
    if (!name) return;
    
    // Using simple approach, updating db and state
    const docRef = await addDoc(collection(db, 'files'), {
      userId: user.uid,
      name,
      type: 'folder',
      parentId,
      createdAt: serverTimestamp()
    });
    
    setFiles([...files, { id: docRef.id, name, type: 'folder', parentId }]);
    onOpenIde();
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 sm:p-10 space-y-10 min-h-screen">
      
      {/* Background Blobs */}
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-400/10 rounded-full blur-[120px] pointer-events-none z-0" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-400/10 rounded-full blur-[120px] pointer-events-none z-0" />

      {/* Header */}
      <header className="flex justify-between items-center z-10 relative">
        <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
                <FileCode className="text-white" size={18} />
            </div>
            <span className="font-bold text-lg tracking-tight">Codelab</span>
        </div>
        <div className="flex items-center gap-4">
            <div className="text-sm font-medium text-slate-600 px-3 py-1.5 bg-white/50 backdrop-blur-sm rounded-full border border-slate-200">
                {user.displayName || user.email}
            </div>
            <Button variant="ghost" className="text-red-500 hover:bg-red-50 hover:text-red-600" onClick={onLogout}>
                <LogOut size={16} /> Logout
            </Button>
        </div>
      </header>

      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 space-y-10 max-w-7xl mx-auto"
      >
        {/* Hero Section */}
        <div className="flex flex-col md:flex-row gap-8 items-start md:items-center justify-between">
          <div className="space-y-2">
            <h2 className="text-4xl font-bold tracking-tight text-slate-900">Welcome back!</h2>
            <p className="text-lg text-slate-500">Ready to build something amazing today?</p>
          </div>
          <div className="flex gap-4">
            <Button className="px-6 py-3 rounded-2xl text-lg backdrop-blur-md" onClick={onOpenIde}>
              <Code2 size={20} />
              Open Editor
            </Button>
            <Button variant="secondary" className="px-6 py-3 rounded-2xl text-lg" onClick={createProject}>
              <Folder size={20} />
              New Project
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="flex items-center gap-4 border-l-4 border-l-blue-500">
            <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
              <FileCode size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Total Files</p>
              <p className="text-2xl font-bold">{stats.totalFiles}</p>
            </div>
          </Card>
          <Card className="flex items-center gap-4 border-l-4 border-l-amber-500">
            <div className="w-12 h-12 bg-amber-100/50 rounded-2xl flex items-center justify-center text-amber-600">
              <Folder size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Total Folders</p>
              <p className="text-2xl font-bold">{stats.totalFolders}</p>
            </div>
          </Card>
          <Card className="flex items-center gap-4 border-l-4 border-l-emerald-500">
            <div className="w-12 h-12 bg-emerald-100/50 rounded-2xl flex items-center justify-center text-emerald-600">
              <Trophy size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Coding Level</p>
              <p className="text-2xl font-bold">Level {stats.level}</p>
            </div>
          </Card>
          <Card className="flex items-center gap-4 border-l-4 border-l-purple-500">
            <div className="w-12 h-12 bg-purple-100/50 rounded-2xl flex items-center justify-center text-purple-600">
              <Activity size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Languages</p>
              <p className="text-2xl font-bold">{stats.languages.length}</p>
            </div>
          </Card>
        </div>

        {/* Graphs & Icons */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <Card className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-800">Language Distribution</h3>
              <div className="flex gap-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Python
                </div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> C++
                </div>
              </div>
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.languages}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="language" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 13 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 13 }} dx={-10} />
                  <Tooltip 
                    cursor={{ fill: 'rgba(241, 245, 249, 0.5)' }}
                    contentStyle={{ borderRadius: '16px', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', background: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(10px)' }}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {stats.languages.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="space-y-8 flex flex-col">
            <h3 className="text-xl font-bold text-slate-800">Supported Languages</h3>
            <div className="grid grid-cols-2 gap-4 flex-1">
              <div className="p-4 rounded-2xl bg-blue-50/50 border border-blue-100 flex flex-col items-center justify-center gap-3 group hover:scale-105 transition-all">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                  <Zap className="text-blue-500" />
                </div>
                <span className="text-sm font-bold text-blue-700">Python</span>
              </div>
              <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100 flex flex-col items-center justify-center gap-3 group hover:scale-105 transition-all">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                  <Cpu className="text-emerald-500" />
                </div>
                <span className="text-sm font-bold text-emerald-700">C++</span>
              </div>
              <div className="p-4 rounded-2xl bg-amber-50/50 border border-amber-100 flex flex-col items-center justify-center gap-3 group hover:scale-105 transition-all">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                  <Coffee className="text-amber-500" />
                </div>
                <span className="text-sm font-bold text-amber-700">JavaScript</span>
              </div>
              <div className="p-4 rounded-2xl bg-slate-100/50 border border-slate-200 flex flex-col items-center justify-center gap-3 group hover:scale-105 transition-all">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                  <Settings className="text-slate-500" />
                </div>
                <span className="text-sm font-bold text-slate-700">C</span>
              </div>
            </div>
            
            <div className="p-6 rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white space-y-4 shadow-lg shadow-blue-500/30 relative overflow-hidden mt-auto">
              {/* decorative glass reflection */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10" />
              
              <div className="flex items-center justify-between relative z-10">
                <span className="text-sm font-medium text-blue-100">Next Level Progress</span>
                <span className="text-sm font-bold bg-white/20 px-2 py-0.5 rounded-md">{((stats.totalFiles) % 5) * 20}%</span>
              </div>
              <div className="h-2 w-full bg-black/20 rounded-full overflow-hidden relative z-10 inner-shadow">
                <div 
                  className="h-full bg-white transition-all duration-1000" 
                  style={{ width: `${((stats.totalFiles) % 5) * 20}%` }}
                />
              </div>
              <p className="text-xs text-blue-200 relative z-10">Write {5 - ((stats.totalFiles) % 5)} more files to reach Level { stats.level + 1 }</p>
            </div>
          </Card>
        </div>
      </motion.div>
    </div>
  );
}

import { motion } from 'motion/react';
import { Terminal, Code2, Cloud, Layers, PlayCircle, Code } from 'lucide-react';
import { Button } from './components/Button'; // Will create this

export function LandingPage({ onLoginClick }: { onLoginClick: () => void }) {
  return (
    <div className="min-h-screen bg-[var(--color-base-bg)] flex flex-col relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-400/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-400/20 rounded-full blur-[120px] pointer-events-none" />
      
      {/* Header */}
      <header className="px-8 py-6 flex items-center justify-between z-10 glass sticky top-0 border-b border-white/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
            <Code className="text-white" size={20} />
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-800">Codelab</span>
        </div>
        <div className="flex gap-4">
          <Button variant="ghost" onClick={onLoginClick}>Sign In</Button>
          <Button variant="primary" onClick={onLoginClick}>Get Started</Button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 text-center z-10 -mt-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="max-w-4xl space-y-8"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-panel border border-blue-200/50 text-blue-700 text-sm font-medium shadow-sm mb-4">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            CodeLab Web IDE
          </div>
          
          <h1 className="text-6xl md:text-7xl font-extrabold tracking-tight text-slate-900 leading-tight">
            Code anywhere.<br/>
            <span className="text-gradient">No setup required.</span>
          </h1>
          
          <p className="text-xl text-slate-500 max-w-2xl mx-auto leading-relaxed">
            The professional cloud coding platform designed for speed and simplicity. 
            Write, run, and share C, C++, Python, and JavaScript directly from your browser.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Button variant="primary" className="px-8 py-4 text-lg rounded-2xl w-full sm:w-auto shadow-blue-500/20" onClick={onLoginClick}>
              Open Editor
              <Terminal size={20} className="ml-2" />
            </Button>
            <Button variant="secondary" className="px-8 py-4 text-lg rounded-2xl w-full sm:w-auto hover:bg-white" onClick={onLoginClick}>
              View Documentation
            </Button>
          </div>
        </motion.div>

        {/* Feature Grid */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl w-full mt-24"
        >
          <div className="glass-card p-8 flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
              <Cloud size={28} />
            </div>
            <h3 className="text-xl font-bold">Cloud Synced</h3>
            <p className="text-slate-500">Your projects automatically save to the cloud. Access your code from any device, anytime.</p>
          </div>
          <div className="glass-card p-8 flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
              <Layers size={28} />
            </div>
            <h3 className="text-xl font-bold">Multiple Languages</h3>
            <p className="text-slate-500">First-class support for C, C++, Python, and JavaScript with built-in compilation.</p>
          </div>
          <div className="glass-card p-8 flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center">
              <PlayCircle size={28} />
            </div>
            <h3 className="text-xl font-bold">Instant Execution</h3>
            <p className="text-slate-500">Run your code instantly in our secure, lightning-fast cloud sandbox environments.</p>
          </div>
        </motion.div>
      </main>
      
      {/* Footer */}
      <footer className="py-8 text-center text-slate-400 text-sm z-10 glass border-t border-white/20">
        &copy; {new Date().getFullYear()} Codelab Inc. All rights reserved.
      </footer>
    </div>
  );
}

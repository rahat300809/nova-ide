import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FolderPlus, FilePlus, Play, Save, Trash2, ChevronRight, 
  ChevronDown, FileCode, Folder, Search, Download, LogOut,
  Terminal, X, FileText, Menu, Settings, Columns, Code2
} from 'lucide-react';
import { Button } from './components/Button';
import { FileNode } from './App';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import { cn } from './components/Button';
import { doc, setDoc, deleteDoc, updateDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { io as socketIO, Socket } from 'socket.io-client';

export function IDE({ user, files, setFiles, activeFileId, setActiveFileId, openTabs, setOpenTabs, expandedFolders, setExpandedFolders, onBackToDashboard, onLogout }: any) {
  
  const [output, setOutput] = useState('');
  const [outputError, setOutputError] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Terminal
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Resizable terminal
  const [terminalHeight, setTerminalHeight] = useState(280);
  const isDraggingRef = useRef(false);
  const dragStartYRef = useRef(0);
  const dragStartHRef = useRef(0);
  
  // Custom Modal State
  const [createModal, setCreateModal] = useState<{ isOpen: boolean; type: 'file' | 'folder'; parentId: string | null }>({
    isOpen: false,
    type: 'file',
    parentId: null
  });
  const [createModalName, setCreateModalName] = useState('');

  // Auto language detection logic.
  const getLanguageFromExtension = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'py') return 'python';
    if (ext === 'c') return 'c';
    if (ext === 'cpp') return 'cpp';
    if (ext === 'js') return 'javascript';
    if (ext === 'html') return 'html';
    if (ext === 'css') return 'css';
    if (ext === 'json') return 'json';
    return 'plaintext';
  };

  const saveTimeoutRef = useRef<any>(null);

  // Init xterm.js + socket.io once
  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new XTerm({
      scrollback: 5000,
      cursorBlink: true,
      fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
      fontSize: 13,
      theme: {
        background: '#1e1e1e', foreground: '#d4d4d4', cursor: '#aeafad',
        black: '#1e1e1e',   brightBlack: '#808080',
        red: '#f44747',     brightRed: '#f44747',
        green: '#6a9955',   brightGreen: '#b5cea8',
        yellow: '#d7ba7d',  brightYellow: '#d7ba7d',
        blue: '#569cd6',    brightBlue: '#9cdcfe',
        magenta: '#c586c0', brightMagenta: '#c586c0',
        cyan: '#4fc1ff',    brightCyan: '#4fc1ff',
        white: '#d4d4d4',   brightWhite: '#ffffff',
      }
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(terminalRef.current);
    fit.fit();
    xtermRef.current = term;
    fitAddonRef.current = fit;

    term.writeln('\x1b[36m  Nova IDE — Interactive Terminal\x1b[0m');
    term.writeln('\x1b[90m  Press \x1b[32mRun ▶\x1b[90m to execute. Supports real-time input.\x1b[0m');
    term.writeln('');

    // In dev: Socket.IO runs on port 3001 (separate from Vite on 3000).
    // In prod: everything is on the same origin/port (Render).
    const backendUrl = import.meta.env.VITE_BACKEND_URL ||
      (import.meta.env.PROD
        ? window.location.origin
        : 'http://localhost:3001');
    const socket = socketIO(backendUrl, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      term.writeln('\x1b[90m  [connected to execution server]\x1b[0m\r\n');
    });
    socket.on('connect_error', () => {
      term.writeln('\x1b[31m  [could not connect — is the server running?]\x1b[0m\r\n');
    });
    socket.on('output', (data: string) => {
      term.write(data);
    });
    socket.on('execution_finished', () => {
      setIsRunning(false);
    });

    // Forward every keystroke to process stdin & echo locally
    term.onData((data) => {
      if (socketRef.current?.connected) {
        // Ctrl+C → send SIGINT
        if (data === '\x03') {
          socketRef.current.emit('kill');
          return;
        }
        socketRef.current.emit('stdin', data);
        
        // Local echo for better UX (some PTYs don't echo until Enter)
        if (data === '\r') {
          term.write('\r\n');
        } else if (data === '\x7f' || data === '\b') {
          // Backspace: move back, print space, move back
          term.write('\b \b');
        } else if (data >= ' ') {
          term.write(data);
        }
      }
    });

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
        // Forward new size to the PTY on server so it tracks cols/rows
        if (socket.connected) {
          socket.emit('resize', { cols: term.cols, rows: term.rows });
        }
      } catch(e) {}
    });
    ro.observe(terminalRef.current);
    return () => { ro.disconnect(); term.dispose(); socket.disconnect(); };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { try { fitAddonRef.current?.fit(); } catch(e){} }, 300);
    return () => clearTimeout(t);
  }, [isSidebarOpen, activeFileId]);


  const openCreateModal = (type: 'file' | 'folder', parentId: string | null = null) => {
    setCreateModal({ isOpen: true, type, parentId });
    setCreateModalName('');
  };

  const handleCreateConfirm = async () => {
    const { type, parentId } = createModal;
    const name = createModalName.trim();
    
    setCreateModal({ isOpen: false, type: 'file', parentId: null });
    setCreateModalName('');

    if (!name) return;

    const language = type === 'file' ? getLanguageFromExtension(name) : undefined;
    
    // Optimistic UI update
    const tempId = 'temp_' + Math.random().toString(36).substr(2, 9);
    const newFileNode: FileNode = {
      id: tempId,
      name,
      type,
      parentId,
      content: '',
      language
    };
    setFiles((prev: any) => [...prev, newFileNode]);
    
    // Backend DB update
    try {
      const payload: any = {
        userId: user.uid,
        name,
        type,
        parentId,
        content: '',
        createdAt: serverTimestamp()
      };
      if (language !== undefined) {
        payload.language = language;
      }

      const docRef = await addDoc(collection(db, 'files'), payload);

      // Update state with confirmed ID
      setFiles((prev: any) => prev.map((f: any) => f.id === tempId ? { ...f, id: docRef.id } : f));
      
      if (type === 'file') {
        setActiveFileId(docRef.id);
        setOpenTabs((prev: any) => {
          if (!prev.includes(docRef.id)) return [...prev, docRef.id];
          return prev;
        });
      } else {
        setExpandedFolders((prev: any) => new Set(prev).add(docRef.id));
      }
    } catch (e) {
      console.error("Error creating file:", e);
      // Revert optimistic update on failure
      setFiles((prev: any) => prev.filter((f: any) => f.id !== tempId));
      alert("Failed to create file. Please check your connection or permissions.");
    }
  };

  const deleteFile = async (id: string) => {
    if (!confirm('Are you sure you want to delete this?')) return;
    
    // DB
    try {
      await deleteDoc(doc(db, 'files', id));
      
      // State
      setFiles((prev: any) => prev.filter((f: any) => f.id !== id && f.parentId !== id)); 
      setOpenTabs((prev: any) => prev.filter((tid: any) => tid !== id));
      setActiveFileId((prev: any) => prev === id ? null : prev);
    } catch (e) {
      console.error("Error deleting document", e);
      alert("Failed to delete file.");
    }
  };

  const updateFileContent = (id: string, content: string) => {
    // 1. LocalStorage immediate draft backup
    try { localStorage.setItem(`nova_draft_${id}`, content); } catch(e) {}

    // 2. Immediately update local state functionally so it doesn't rely on stale `files`
    setFiles((prev: any) => prev.map((f: any) => f.id === id ? { ...f, content } : f));
    
    // 3. Clear any pending save
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    
    // 4. Debounce the Firestore write (aggressive for auto-save)
    setIsSaving(true);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        // Double check it's not a tempId
        if (!id.startsWith('temp_')) {
          await updateDoc(doc(db, 'files', id), { content });
          localStorage.removeItem(`nova_draft_${id}`);
        }
      } catch (e) {
        console.error("Error saving file", e);
      } finally {
        setIsSaving(false);
      }
    }, 500); // 500ms debounce
  };

  const runCode = () => {
    const activeFile = files.find((f: any) => f.id === activeFileId);
    if (!activeFile || activeFile.type !== 'file') return;
    const socket = socketRef.current;
    const term = xtermRef.current;
    if (!socket || !term) return;

    setIsRunning(true);
    term.writeln('');
    term.writeln(`\x1b[36m▶ Running ${activeFile.name}\x1b[0m`);
    term.writeln('\x1b[90m─────────────────────────────────────────────\x1b[0m');
    term.focus();

    socket.emit('execute', {
      code: activeFile.content,
      language: activeFile.language,
      fileName: activeFile.name,
    });
  };

  const downloadFile = (file: FileNode) => {
    const blob = new Blob([file.content || ''], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
  };

  const exportPDF = (file: FileNode) => {
    const doc = new jsPDF();
    doc.setFontSize(12);
    // Split text to handle multiple lines in PDF
    const splitText = doc.splitTextToSize(file.content || '', 180);
    doc.text(splitText, 10, 10);
    doc.save(`${file.name}.pdf`);
  };

  const downloadProject = async () => {
    const zip = new JSZip();
    const buildZip = (parentId: string | null, folder: any) => {
      const children = files.filter((f: any) => f.parentId === parentId);
      children.forEach((child: any) => {
        if (child.type === 'file') {
          folder.file(child.name, child.content || '');
        } else {
          const subFolder = folder.folder(child.name);
          buildZip(child.id, subFolder);
        }
      });
    };
    buildZip(null, zip);
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'codelab_project.zip';
    a.click();
  };

  const renderTree = (parentId: string | null = null, depth = 0) => {
    return files
      .filter((f: any) => f.parentId === parentId)
      .sort((a: any, b: any) => (a.type === 'folder' ? -1 : 1))
      .map((node: any) => {
        const isExpanded = expandedFolders.has(node.id);
        const isActive = activeFileId === node.id;

        return (
          <div key={node.id}>
            <div 
              className={cn(
                "group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors duration-200",
                isActive ? "bg-blue-100/80 text-blue-700" : "hover:bg-slate-200/50 text-slate-700"
              )}
              style={{ paddingLeft: `${depth * 14 + 10}px` }}
              onClick={() => {
                if (node.type === 'folder') {
                  const next = new Set(expandedFolders);
                  if (isExpanded) next.delete(node.id);
                  else next.add(node.id);
                  setExpandedFolders(next);
                } else {
                  setActiveFileId(node.id);
                  if (!openTabs.includes(node.id)) setOpenTabs([...openTabs, node.id]);
                }
              }}
            >
              {node.type === 'folder' ? (
                isExpanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />
              ) : <div className="w-3.5" />}
              
              {node.type === 'folder' ? 
                <Folder size={16} className="text-amber-500 flex-shrink-0 fill-amber-500/20" /> : 
                <FileCode size={16} className="text-blue-500 flex-shrink-0" />
              }
              <span className="text-sm flex-1 truncate">{node.name}</span>
              
              <div className="hidden group-hover:flex items-center gap-0.5 ml-auto">
                {node.type === 'folder' && (
                  <>
                    <button onClick={(e) => { e.stopPropagation(); openCreateModal('file', node.id); }} className="p-1 hover:bg-slate-300/50 rounded text-slate-500 hover:text-blue-600"><FilePlus size={12} /></button>
                    <button onClick={(e) => { e.stopPropagation(); openCreateModal('folder', node.id); }} className="p-1 hover:bg-slate-300/50 rounded text-slate-500 hover:text-blue-600"><FolderPlus size={12} /></button>
                  </>
                )}
                <button onClick={(e) => { e.stopPropagation(); deleteFile(node.id); }} className="p-1 hover:bg-red-100 rounded text-red-400 hover:text-red-600"><Trash2 size={12} /></button>
              </div>
            </div>
            {node.type === 'folder' && isExpanded && renderTree(node.id, depth + 1)}
          </div>
        );
      });
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[var(--color-base-bg)]">
      
      {/* App Header Bar */}
      <header className="h-12 glass z-20 flex items-center justify-between px-4 border-b border-white/40 shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-4">
          <button onClick={onBackToDashboard} className="flex items-center gap-2 text-slate-600 hover:text-blue-600 transition-colors font-medium">
            <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center shadow-lg shadow-blue-500/20">
              <FileCode className="text-white" size={14} />
            </div>
            <span>Dashboard</span>
          </button>
          
          <div className="h-4 w-px bg-slate-300" />
          
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1.5 text-slate-500 hover:bg-slate-200/50 rounded-md transition-colors">
            <Columns size={16} />
          </button>
        </div>

        <div className="flex items-center gap-3">
          {isSaving && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 animate-pulse bg-white/50 px-2 py-1 rounded-md">
              <Save size={12} /> Saving...
            </div>
          )}
          
          <Button 
            onClick={downloadProject} 
            variant="ghost" 
            title="Download Full Project"
            className="hidden sm:flex"
          >
            <Download size={14} /> Project
          </Button>

          <Button 
            onClick={runCode} 
            disabled={isRunning || !activeFileId || files.find((f:FileNode) => f.id === activeFileId)?.type !== 'file'} 
            variant="success"
            className="px-5 shadow-emerald-500/30 font-semibold"
          >
            {isRunning ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> : <Play size={16} fill="currentColor" />}
            Run
          </Button>
        </div>
      </header>

      {/* Main IDE Area */}
      <div className="flex-1 flex overflow-hidden relative">
        <AnimatePresence mode="wait">
          {isSidebarOpen && (
            <motion.aside 
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 260, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="glass-panel z-10 border-r border-white/40 flex flex-col shadow-[var(--shadow-soft)] relative"
            >
              <div className="p-4 space-y-4">
                <div className="relative group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={14} />
                  <input 
                    type="text" 
                    placeholder="Search files..."
                    className="w-full pl-9 pr-3 py-1.5 bg-white/60 border border-slate-200/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 placeholder-slate-400 backdrop-blur-sm"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
                
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <span>Explorer</span>
                  <div className="flex gap-1">
                    <button onClick={() => openCreateModal('file')} className="p-1 hover:bg-slate-200/50 rounded-md text-slate-600" title="New File"><FilePlus size={14} /></button>
                    <button onClick={() => openCreateModal('folder')} className="p-1 hover:bg-slate-200/50 rounded-md text-slate-600" title="New Folder"><FolderPlus size={14} /></button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-2 pb-4 scrollbar-hide">
                {renderTree()}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        <main className="flex-1 flex flex-col min-w-0 bg-white shadow-[-10px_0_30px_rgba(0,0,0,0.02)] z-0">
          {/* Tabs */}
          <div className="h-10 bg-slate-50 border-b border-slate-200 flex items-center overflow-x-auto scrollbar-hide">
            {openTabs.map((tabId: string) => {
              const file = files.find((f: any) => f.id === tabId);
              if (!file) return null;
              const isActive = activeFileId === tabId;
              return (
                <div 
                  key={tabId}
                  className={cn(
                    "flex-shrink-0 h-full flex items-center gap-2 px-4 border-r border-slate-200 cursor-pointer transition-colors max-w-[200px] select-none",
                    isActive ? "bg-white border-t-[3px] border-t-blue-500 text-slate-900" : "bg-slate-100 hover:bg-slate-50 border-t-[3px] border-t-transparent text-slate-500"
                  )}
                  onClick={() => setActiveFileId(tabId)}
                >
                  <FileCode size={14} className={isActive ? "text-blue-500" : "text-slate-400"} />
                  <span className="text-sm truncate font-medium">{file.name}</span>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenTabs(openTabs.filter((id: string) => id !== tabId));
                      if (activeFileId === tabId) setActiveFileId(openTabs[openTabs.indexOf(tabId) - 1] || openTabs[openTabs.indexOf(tabId) + 1] || null);
                    }}
                    className="p-1 hover:bg-slate-200 rounded-md text-slate-400 hover:text-slate-700 transition-colors ml-1"
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Editor Area */}
          <div className="flex-1 relative bg-white">
            {activeFileId && files.find((f:any) => f.id === activeFileId) ? (
              <Editor
                height="100%"
                language={files.find((f:any) => f.id === activeFileId)?.language || 'plaintext'}
                // Use defaultLanguage and defaultValue to mount Monaco ONCE per file 
                // and let Monaco handle its own internal state/undo stack.
                // We use `path` to force a new Monaco model when activeFileId changes
                path={activeFileId}
                defaultValue={files.find((f:any) => f.id === activeFileId)?.content || ''}
                theme="light"
                onChange={(val) => updateFileContent(activeFileId, val || '')}
                options={{
                  fontSize: 14,
                  fontFamily: 'JetBrains Mono',
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  padding: { top: 16 },
                  lineNumbers: 'on',
                  roundedSelection: true,
                  cursorStyle: 'line',
                  cursorBlinking: 'smooth',
                  smoothScrolling: true,
                  scrollbar: {
                    verticalScrollbarSize: 8,
                    horizontalScrollbarSize: 8,
                  }
                }}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
                <div className="w-24 h-24 bg-white shadow-sm border border-slate-100 rounded-[2rem] flex items-center justify-center mb-6">
                  <Code2 size={40} className="text-slate-300" />
                </div>
                <p className="text-lg font-medium text-slate-600">Select a file to start coding</p>
                <div className="flex gap-3 mt-6">
                  <Button variant="secondary" onClick={() => openCreateModal('file')} className="bg-white border-slate-200">New File</Button>
                  {!isSidebarOpen && <Button variant="secondary" onClick={() => setIsSidebarOpen(true)}>Open Explorer</Button>}
                </div>
              </div>
            )}

            {/* Floating File Actions */}
            {activeFileId && files.find((f:any) => f.id === activeFileId) && (
              <div className="absolute top-4 right-6 flex gap-2 z-10">
                <Button variant="secondary" onClick={() => downloadFile(files.find((f:any) => f.id === activeFileId)!)} title="Download File" className="backdrop-blur-md bg-white/80 p-2 shadow-sm"><Download size={16} className="text-slate-600"/></Button>
                <Button variant="secondary" onClick={() => exportPDF(files.find((f:any) => f.id === activeFileId)!)} title="Export PDF" className="backdrop-blur-md bg-white/80 p-2 shadow-sm"><FileText size={16} className="text-slate-600" /></Button>
              </div>
            )}
          </div>

          {/* Unified VS Code-style Terminal — drag the top bar to resize */}
          <div
            className="flex flex-col border-t border-[#333]"
            style={{ height: terminalHeight, minHeight: 120, background: '#1e1e1e' }}
          >
            {/* ── Drag handle ── */}
            <div
              className="flex items-center justify-between px-4 bg-[#252526] border-b border-[#111] select-none"
              style={{ cursor: 'ns-resize', paddingTop: 3, paddingBottom: 3 }}
              onMouseDown={(e) => {
                isDraggingRef.current = true;
                dragStartYRef.current = e.clientY;
                dragStartHRef.current = terminalHeight;
                const onMove = (ev: MouseEvent) => {
                  if (!isDraggingRef.current) return;
                  const delta = dragStartYRef.current - ev.clientY;
                  const next = Math.max(120, Math.min(window.innerHeight * 0.85, dragStartHRef.current + delta));
                  setTerminalHeight(next);
                  try { fitAddonRef.current?.fit(); } catch (_) {}
                };
                const onUp = () => {
                  isDraggingRef.current = false;
                  window.removeEventListener('mousemove', onMove);
                  window.removeEventListener('mouseup', onUp);
                  try { fitAddonRef.current?.fit(); } catch (_) {}
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
              }}
            >
              {/* grip dots */}
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-[#9cdcfe]">
                <Terminal size={13} />
                <span>Terminal</span>
                {isRunning && <span className="text-[#d7ba7d] animate-pulse ml-2">● Running</span>}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[#555] text-xs tracking-[3px]">· · ·</span>
                <button
                  onClick={() => {
                    // Kill any running process so Run button resets
                    if (isRunning) {
                      socketRef.current?.emit('kill');
                      setIsRunning(false);
                    }
                    xtermRef.current?.clear();
                    xtermRef.current?.writeln('\x1b[90mTerminal cleared. Ready for new run.\x1b[0m');
                    xtermRef.current?.focus();
                  }}
                  className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 px-2 py-1 rounded hover:bg-white/10 transition-colors"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <Trash2 size={11} /> Clear
                </button>
              </div>
            </div>
            <div ref={terminalRef} className="flex-1 overflow-hidden" />
          </div>
        </main>
      </div>

      {/* Creation Modal */}
      <AnimatePresence>
        {createModal.isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/20 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-semibold text-slate-800">
                  Create {createModal.type === 'file' ? 'File' : 'Folder'}
                </h3>
                <button 
                  onClick={() => setCreateModal({ ...createModal, isOpen: false })}
                  className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="p-5">
                <input
                  type="text"
                  autoFocus
                  placeholder={createModal.type === 'file' ? 'e.g., script.py' : 'e.g., src'}
                  value={createModalName}
                  onChange={(e) => setCreateModalName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateConfirm();
                    if (e.key === 'Escape') setCreateModal({ ...createModal, isOpen: false });
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm mb-4"
                />
                <div className="flex justify-end gap-2">
                  <Button 
                    variant="secondary" 
                    onClick={() => setCreateModal({ ...createModal, isOpen: false })}
                    className="h-9 px-4 py-0"
                  >
                    Cancel
                  </Button>
                  <Button 
                    variant="primary" 
                    onClick={handleCreateConfirm}
                    disabled={!createModalName.trim()}
                    className="h-9 px-4 py-0"
                  >
                    Create
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

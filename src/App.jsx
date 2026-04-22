import React, { useState, useMemo, useRef } from 'react';
import { Download, Copy, Terminal, Check, FileText, Settings, BookOpen, ChevronDown, ChevronUp, Info, Archive, Pencil, Search, Plus, Trash, Star, Upload, FolderOpen, Mail, User } from 'lucide-react';

const FILE_TYPES = [
  { id: 'genome', name: '基因组 (Genome)', wgetSuffix: '_genomic.fna.gz', datasetsName: 'genome', desc: 'DNA 序列本体，用于比对或变异检测' },
  { id: 'gff3', name: '注释文件 (GFF3)', wgetSuffix: '_genomic.gff.gz', datasetsName: 'gff3', desc: '记录基因在染色体上的位置信息' },
  { id: 'protein', name: '蛋白质 (Protein)', wgetSuffix: '_protein.faa.gz', datasetsName: 'protein', desc: '所有翻译出的氨基酸序列' },
  { id: 'rna', name: 'RNA序列 (RNA)', wgetSuffix: '_rna.fna.gz', datasetsName: 'rna', desc: '转录本序列 (mRNA, tRNA 等)' },
  { id: 'cds', name: '编码区 (CDS)', wgetSuffix: '_cds_from_genomic.fna.gz', datasetsName: 'cds', desc: '仅包含翻译成蛋白的 DNA 序列' }
];

// 使用原生 SVG 替换对 lucide-react 的 Github 依赖，彻底解决本地版本兼容报错
const GithubIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.2c3-.3 6-1.5 6-6.5a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 5 3 6.2 6 6.5a4.8 4.8 0 0 0-1 3.2v4"/>
  </svg>
);

export default function App() {
  const [engine, setEngine] = useState('datasets');
  const [selectedFiles, setSelectedFiles] = useState(['genome', 'gff3']);
  const [savePath, setSavePath] = useState('~/NCBI_downloads');
  const [outputMode, setOutputMode] = useState('script');
  
  // NCBI API Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]); 
  const [isSearching, setIsSearching] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [totalResults, setTotalResults] = useState(0); 
  
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [filterReferenceOnly, setFilterReferenceOnly] = useState(false);
  
  const [selectedSpecies, setSelectedSpecies] = useState([]);
  const [customAccessions, setCustomAccessions] = useState('');
  
  // Advanced options
  const [autoUnzip, setAutoUnzip] = useState(false);
  const [autoRename, setAutoRename] = useState(false);
  const [useDehydrated, setUseDehydrated] = useState(false); // 脱水模式

  // UI States
  const [isCopied, setIsCopied] = useState(false);
  const [highlightTerminal, setHighlightTerminal] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [isAccessionHelpOpen, setIsAccessionHelpOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  
  // Refs for logic
  const searchAbortController = useRef(null);
  const searchCache = useRef({}); // 搜索缓存
  const debounceTimer = useRef(null);
  const fileInputRef = useRef(null);
  const dirInputRef = useRef(null);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const toggleFile = (id) => {
    setSelectedFiles(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);
  };

  // 核心搜索逻辑（带缓存）
  const searchNCBI = async (queryOverride = null, isLoadMore = false, filterOverride = null) => {
    const queryToSearch = typeof queryOverride === 'string' ? queryOverride : searchQuery;
    if (!queryToSearch.trim()) return;
    
    if (typeof queryOverride === 'string') setSearchQuery(queryOverride);
    
    const currentFilter = filterOverride !== null ? filterOverride : filterReferenceOnly;
    let term = queryToSearch;
    if (currentFilter) term = `(${term}) AND "reference genome"[filter]`;
    
    const retmax = 50;
    const retstart = isLoadMore ? searchResults.length : 0;
    const cacheKey = `${term}_${retstart}`;

    if (!isLoadMore) {
      if (searchAbortController.current) searchAbortController.current.abort();
      searchAbortController.current = new AbortController();
      
      // 命中缓存
      if (searchCache.current[cacheKey]) {
        const cached = searchCache.current[cacheKey];
        setSearchResults(cached.results);
        setTotalResults(cached.count);
        setHasMore(cached.hasMore);
        setErrorMsg('');
        return;
      }
      
      setSearchResults([]);
      setHasMore(true);
      setTotalResults(0);
    }
    
    const signal = searchAbortController.current?.signal;

    setIsSearching(!isLoadMore);
    setIsLoadingMore(isLoadMore);
    setErrorMsg('');
    
    try {
      // Step 1: ESearch 
      const esearchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=assembly&term=${encodeURIComponent(term)}&retmode=json&retmax=${retmax}&retstart=${retstart}&sort=relevance`;
      const res1 = await fetch(esearchUrl, { signal });
      const data1 = await res1.json();
      const ids = data1.esearchresult?.idlist || [];
      const count = Number(data1.esearchresult?.count || 0);

      if (!isLoadMore) setTotalResults(count);

      if (ids.length === 0) {
        if (!isLoadMore) setErrorMsg('未找到相关结果，请尝试更换关键词。');
        setHasMore(false);
        setIsSearching(false);
        setIsLoadingMore(false);
        return;
      }

      // Step 2: ESummary
      const esummaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=assembly&id=${ids.join(',')}&retmode=json`;
      const res2 = await fetch(esummaryUrl, { signal });
      const data2 = await res2.json();

      const batchResults = ids.map(id => {
        const doc = data2.result[id];
        if (!doc) return null;
        let ftp = doc.ftppath_refseq || doc.ftppath_genbank;
        if (ftp) ftp = ftp.replace('ftp://', 'https://'); 
        
        return {
          id: doc.assemblyaccession,
          accession: doc.assemblyaccession,
          name: doc.organism,
          assemblyName: doc.assemblyname,
          category: doc.refseq_category, 
          status: doc.assemblystatus, 
          releaseDate: doc.seqreleasedate,
          ftpPath: ftp,
          prefix: ftp ? ftp.split('/').pop() : ''
        };
      }).filter(item => item && item.ftpPath);

      const newResults = isLoadMore ? [...searchResults, ...batchResults] : batchResults;

      const statusWeight = { 'Complete Genome': 4, 'Chromosome': 3, 'Scaffold': 2, 'Contig': 1 };
      newResults.sort((a, b) => {
        const aIsRef = a.category === 'reference genome';
        const bIsRef = b.category === 'reference genome';
        if (aIsRef && !bIsRef) return -1;
        if (!aIsRef && bIsRef) return 1;

        const aIsRep = a.category === 'representative genome';
        const bIsRep = b.category === 'representative genome';
        if (aIsRep && !bIsRep) return -1;
        if (!aIsRep && bIsRep) return 1;

        const aIsGcf = a.accession?.startsWith('GCF_');
        const bIsGcf = b.accession?.startsWith('GCF_');
        if (aIsGcf && !bIsGcf) return -1;
        if (!aIsGcf && bIsGcf) return 1;

        const aStatus = statusWeight[a.status] || 0;
        const bStatus = statusWeight[b.status] || 0;
        if (aStatus !== bStatus) return bStatus - aStatus;

        return new Date(b.releaseDate || 0).getTime() - new Date(a.releaseDate || 0).getTime();
      });

      setSearchResults(newResults);
      setHasMore(newResults.length < count);

      // 存入缓存
      searchCache.current[cacheKey] = {
        results: newResults,
        count: count,
        hasMore: newResults.length < count
      };

    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error(err);
      setErrorMsg('请求 NCBI API 失败，请检查网络连接。');
    } finally {
      setIsSearching(false);
      setIsLoadingMore(false);
    }
  };

  // 防抖处理输入框搜索
  const handleSearchInputChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    
    if (val.trim()) {
      debounceTimer.current = setTimeout(() => {
        searchNCBI(val, false, filterReferenceOnly);
      }, 800); // 800ms 防抖
    }
  };

  // 文件上传读取 Accessions
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const accs = text.split(/[\n,;\t]+/).map(s => s.trim()).filter(Boolean);
      if (accs.length > 0) {
        setCustomAccessions(prev => {
          const existing = prev.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
          const combined = Array.from(new Set([...existing, ...accs]));
          return combined.join('\n');
        });
        showToast(`✅ 成功解析并导入 ${accs.length} 个 Accession 编号！`);
      } else {
        showToast(`⚠️ 未在文件中解析到有效的编号内容。`);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; 
  };

  // 目录选择 (基于浏览器限制获取相对路径)
  const handleDirSelect = (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      const pathName = files[0].webkitRelativePath.split('/')[0];
      showToast(`⚠️ 浏览器安全限制，仅自动为您填入所选文件夹名称`);
      setSavePath(`./${pathName}`);
    }
  };

  const handleAddSpecies = (speciesObj) => {
    if (!selectedSpecies.find(s => s.accession === speciesObj.accession)) {
      setSelectedSpecies([...selectedSpecies, speciesObj]);
      showToast(`✅ 已添加: ${speciesObj.assemblyName || speciesObj.name}`);
    } else {
      showToast(`⚠️ 该物种 (${speciesObj.accession}) 已在清单中！`);
    }
  };

  const handleAddAllSearchResults = () => {
    const newItems = searchResults.filter(r => !selectedSpecies.some(s => s.accession === r.accession));
    if (newItems.length > 0) {
      setSelectedSpecies([...selectedSpecies, ...newItems]);
      showToast(`✅ 已批量添加 ${newItems.length} 个结果到清单！`);
    } else {
      showToast(`⚠️ 当前搜索结果已全部在清单中。`);
    }
  };

  const handleRemoveSpecies = (accession) => {
    setSelectedSpecies(selectedSpecies.filter(s => s.accession !== accession));
  };

  const handleBatchSearch = () => {
    const accs = customAccessions.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    if (accs.length === 0) return;
    const query = accs.join(' OR ');
    setSearchQuery(query);
    showToast('🔍 正在批量检索您输入的 Accession...');
    searchNCBI(query, false, false);
  };

  const generatedCode = useMemo(() => {
    if (selectedSpecies.length === 0) return '# 请至少搜索并添加一个物种到工作清单\n';
    if (selectedFiles.length === 0) return '# 请至少选择一种文件类型\n';

    let code = '';
    const safePath = savePath.trim() || '~/NCBI_downloads';
    let commandsPath = safePath.replace(/^~\//, '$HOME/');
    
    if (outputMode === 'script') {
      const engineName = engine === 'wget' ? 'wget (传统)' : (engine === 'rsync' ? 'rsync (高速同步)' : 'NCBI Datasets (官方推荐)');
      code += `#!/bin/bash\n# ==========================================\n`;
      code += `# NCBI 基因组自动化下载脚本\n# 下载引擎: ${engineName}\n`;
      code += `# ==========================================\n\n`;
      
      code += `# 开启遇到错误即停止模式\nset -e\n\n`;

      code += `# 错误捕获 (支持断点续传)\n`;
      code += `trap 'echo -e "\\n❌ 运行中断或发生错误！\\n👉 提示：请直接重新运行本脚本，工具将自动开启【断点续传】，跳过已下载的内容。"; exit 1' ERR\n\n`;
      
      code += `echo "🔍 正在检查系统环境与可用磁盘空间..."\n`;
      code += `df -h . | awk 'NR==2 {print ">> 当前目录可用磁盘空间: "$4}'\n\n`;

      if (engine === 'datasets') {
        code += `# 检查 datasets 是否安装\nif ! command -v datasets &> /dev/null; then\n`;
        code += `    echo "❌ 错误: datasets 命令行工具未安装！"\n`;
        code += `    echo "👉 建议使用 Conda 安装: conda install -c conda-forge ncbi-datasets-cli"\n`;
        code += `    exit 1\nfi\n\n`;
      } else {
        code += `# 检查命令是否存在\nif ! command -v ${engine} &> /dev/null; then\n`;
        code += `    echo "❌ 错误: ${engine} 未安装！"\n`;
        code += `    echo "👉 请根据您的系统使用包管理器安装 (例如: brew install ${engine} 或 apt install ${engine})"\n`;
        code += `    exit 1\nfi\n\n`;
      }
      
      // 绝对路径转换方案
      code += `RAW_PATH="${safePath}"\n`;
      code += `DOWNLOAD_DIR="\${RAW_PATH/#\\~/$HOME}"\n`;
      code += `mkdir -p "$DOWNLOAD_DIR"\n`;
      code += `cd "$DOWNLOAD_DIR"\n\n`;
    } else {
      code += `mkdir -p "${commandsPath}" && cd "${commandsPath}"\n\n`;
    }

    if (engine === 'datasets') {
      const accessions = selectedSpecies.map(s => s.accession);
      const includeFiles = selectedFiles.map(id => FILE_TYPES.find(f => f.id === id).datasetsName).join(',');
      
      code += `# 使用 datasets 下载\n`;
      code += `echo "🚀 开始下载 ${accessions.length} 个物种: ${accessions.join(', ')} ..."\n`;
      
      code += `datasets download genome accession ${accessions.join(',')} \\\n`;
      code += `    --include ${includeFiles} \\\n`;
      if (useDehydrated) {
        code += `    --dehydrated \\\n`;
      }
      code += `    --filename ncbi_dataset.zip || { echo -e "\\n⚠️ 警告: 检测到可能的 GOAWAY 连接重置报错。\\n👉 如果 ncbi_dataset.zip 已生成，表明核心数据拉取正常，将继续往下执行！"; }\n\n`;
      
      if (useDehydrated) {
        code += `echo "🗜️ 正在解压脱水包框架..."\n`;
        code += `unzip -q -o ncbi_dataset.zip -d extracted_data\n`;
        code += `echo "💧 正在复水 (这步将真正拉取大文件并避免 GOAWAY)..."\n`;
        code += `datasets rehydrate --directory extracted_data/\n`;
        code += `echo "✅ 复水完成！序列已存放在 extracted_data 目录内。"\n`;
      } else {
        if (outputMode === 'script') {
          code += `echo "📦 正在解压 ncbi_dataset.zip..."\n`;
          code += `unzip -q -o ncbi_dataset.zip -d extracted_data\n`;
          code += `echo "✅ datasets 数据已自动解压至 extracted_data 目录。"\n`;
        } else {
          code += `unzip -q -o ncbi_dataset.zip -d extracted_data\n`;
        }
      }
    } 
    else {
      selectedSpecies.forEach(sp => {
        if (outputMode === 'script') {
          code += `echo "=============================="\n`;
          code += `echo "🧬 正在处理: ${sp.assemblyName || sp.name}"\n`;
          code += `mkdir -p "${sp.accession}"\ncd "${sp.accession}"\n\n`;
        } else {
          code += `mkdir -p "${sp.accession}" && cd "${sp.accession}"\n`;
        }

        selectedFiles.forEach(fileId => {
          const fileObj = FILE_TYPES.find(f => f.id === fileId);
          const fileName = `${sp.prefix}${fileObj.wgetSuffix}`;
          let friendlyName = `${sp.accession}_${fileObj.id}.gz`;
          
          if (engine === 'wget') {
            const url = `${sp.ftpPath}/${fileName}`;
            if (outputMode === 'script') code += `echo " -> 下载 ${fileObj.name} ..."\n`;
            code += `wget -c -t 5 --retry-connrefused "${url}" -O "${fileName}"\n`;
          } else if (engine === 'rsync') {
            const rsyncUrl = `${sp.ftpPath.replace('https://ftp.ncbi.nlm.nih.gov/', 'rsync://ftp.ncbi.nlm.nih.gov/')}/${fileName}`;
            if (outputMode === 'script') code += `echo " -> 使用 rsync 下载 ${fileObj.name} ..."\n`;
            code += `rsync -avP "${rsyncUrl}" "./${fileName}"\n`;
          }

          // Output Rename logic
          if (autoRename) {
            code += `mv "${fileName}" "${friendlyName}"\n`;
            if (outputMode === 'script') {
              code += `echo "    已重命名为: ${friendlyName}"\n`;
            }
          }
          code += `\n`;
        });

        if (outputMode === 'script') {
          code += `cd "$DOWNLOAD_DIR"\n\n`;
        } else {
          code += `cd "${commandsPath}"\n\n`;
        }
      });

      // Output Unzip logic
      if (autoUnzip) {
        if (outputMode === 'script') {
          code += `echo "=============================="\n`;
          code += `echo "🗜️ 正在执行解压操作 (此过程可能较慢，请耐心等待)..."\n`;
        }
        code += `find . -name "*.gz" -exec gunzip -f {} +\n`;
        if (outputMode === 'script') {
          code += `echo "✅ 解压完成！"\n\n`;
        } else {
          code += `\n`;
        }
      }
    }

    if (outputMode === 'script') {
        code += `\necho "=========================================="\n`;
        code += `echo "✅ 恭喜！所有下载任务已顺利结束！"\n`;
        code += `echo "📂 文件已绝对保存在: $(pwd)"\n`;
        code += `if [[ "$OSTYPE" == "darwin"* ]]; then\n`;
        code += `    open .\n`;
        code += `elif command -v xdg-open &> /dev/null; then\n`;
        code += `    xdg-open . 2>/dev/null || true\n`;
        code += `fi\n`;
        code += `echo "=========================================="\n`;
    }

    return code;
  }, [engine, selectedSpecies, selectedFiles, savePath, outputMode, autoUnzip, autoRename, useDehydrated]);

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedCode);
    setIsCopied(true);
    showToast("✅ 已复制！请前往终端粘贴执行。");
    setHighlightTerminal(true);
    setTimeout(() => setHighlightTerminal(false), 500); // 终端高亮提示
    setTimeout(() => setIsCopied(false), 3000);
  };

  const handleDownloadFile = () => {
    const blob = new Blob([generatedCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ncbi_download_${engine}.sh`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans flex flex-col relative">
      {toastMsg && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white px-5 py-2.5 rounded-full shadow-2xl font-medium text-sm transition-all duration-300 animate-in fade-in slide-in-from-top-4 flex items-center">
          {toastMsg}
        </div>
      )}

      <div className="flex-1 p-4 md:p-8">
        <div className="max-w-6xl mx-auto space-y-8">
          
          <header className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-500 p-8 shadow-xl shadow-blue-900/10 text-white">
            <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex items-center space-x-5">
                <div className="p-3.5 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-inner">
                  <Download className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-extrabold tracking-tight flex items-center flex-wrap gap-3">
                    NCBI 基因组下载助手 
                    <span className="text-[11px] font-bold bg-white/20 text-white px-2.5 py-1 rounded-full tracking-widest shadow-sm border border-white/20 backdrop-blur-sm uppercase">
                      V3.0 Pro
                    </span>
                  </h1>
                  <p className="text-blue-100 text-sm mt-2 font-medium max-w-xl leading-relaxed">纯前端生成终端下载脚本，接入 NCBI 官方 API 实现智能检索与断点续传。</p>
                </div>
              </div>
            </div>
            <div className="absolute -right-20 -top-20 w-80 h-80 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute right-40 -bottom-20 w-64 h-64 bg-cyan-400/20 rounded-full blur-3xl pointer-events-none"></div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-5 space-y-8">
              
              <div className="bg-white rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 p-6 transition-all hover:shadow-[0_4px_25px_-4px_rgba(0,0,0,0.08)]">
                <h2 className="text-lg font-bold flex items-center mb-5 text-slate-800">
                  <Settings className="w-5 h-5 mr-2.5 text-indigo-500" />
                  1. 选择下载引擎
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <button onClick={() => setEngine('datasets')} className={`p-3.5 rounded-xl text-left transition-all duration-200 border-2 ${engine === 'datasets' ? 'border-indigo-500 bg-indigo-50 shadow-sm' : 'border-slate-100 bg-white hover:border-indigo-200 hover:bg-slate-50'}`}>
                    <div className="font-bold text-slate-900">Datasets</div>
                    <div className="text-[11px] text-slate-500 mt-1 leading-tight">官方推荐，脱水复水模式最强</div>
                  </button>
                  <button onClick={() => setEngine('wget')} className={`p-3.5 rounded-xl text-left transition-all duration-200 border-2 ${engine === 'wget' ? 'border-indigo-500 bg-indigo-50 shadow-sm' : 'border-slate-100 bg-white hover:border-indigo-200 hover:bg-slate-50'}`}>
                    <div className="font-bold text-slate-900">wget</div>
                    <div className="text-[11px] text-slate-500 mt-1 leading-tight">系统自带，零配置直接支持续传</div>
                  </button>
                  <button onClick={() => setEngine('rsync')} className={`p-3.5 rounded-xl text-left transition-all duration-200 border-2 ${engine === 'rsync' ? 'border-indigo-500 bg-indigo-50 shadow-sm' : 'border-slate-100 bg-white hover:border-indigo-200 hover:bg-slate-50'}`}>
                    <div className="font-bold text-slate-900">rsync</div>
                    <div className="text-[11px] text-slate-500 mt-1 leading-tight">高速同步，完美支持断线断点重连</div>
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 p-6 transition-all hover:shadow-[0_4px_25px_-4px_rgba(0,0,0,0.08)]">
                <h2 className="text-lg font-bold flex items-center mb-5 text-slate-800">
                  <Search className="w-5 h-5 mr-2.5 text-indigo-500" />
                  2. 检索并添加物种
                </h2>
                
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">查询 NCBI 数据库 <span className="text-xs font-normal text-slate-400"> (输入即搜索)</span></label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={handleSearchInputChange}
                      placeholder="物种、编号或组装名，如：GRCh38.p14"
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all shadow-inner outline-none"
                    />
                    <button
                      onClick={() => searchNCBI(null, false)}
                      disabled={isSearching || !searchQuery.trim()}
                      className="bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white px-5 py-3 rounded-xl text-sm font-bold shadow-md shadow-indigo-200 disabled:opacity-50 transition-all flex items-center justify-center min-w-[80px]"
                    >
                      {isSearching ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : '搜索'}
                    </button>
                  </div>
                  
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-medium text-slate-400">试试搜:</span>
                      {['Homo sapiens', 'GCF_000001405.40', 'PRJNA489243'].map(ex => (
                        <button
                          key={ex}
                          onClick={() => {
                            setSearchQuery(ex);
                            searchNCBI(ex, false, filterReferenceOnly);
                          }}
                          className="text-[11px] bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 px-2.5 py-1 rounded-full transition-colors border border-transparent hover:border-indigo-100 font-medium"
                        >
                          {ex}
                        </button>
                      ))}
                    </div>
                    
                    <label className="flex items-center cursor-pointer group shrink-0">
                      <input
                        type="checkbox"
                        checked={filterReferenceOnly}
                        onChange={(e) => {
                          const isChecked = e.target.checked;
                          setFilterReferenceOnly(isChecked);
                          if (searchQuery.trim()) searchNCBI(searchQuery, false, isChecked);
                        }}
                        className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span className="ml-2 text-xs font-bold text-slate-600 group-hover:text-indigo-600 transition-colors">
                        仅显示参考基因组
                      </span>
                    </label>
                  </div>
                  {errorMsg && <p className="text-xs text-red-500 mt-3 flex items-center"><Info className="w-3.5 h-3.5 mr-1" />{errorMsg}</p>}
                </div>

                {searchResults.length > 0 && (
                  <div className="mb-6 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm flex flex-col">
                    <div className="px-4 py-2.5 bg-slate-50 text-xs font-bold text-slate-700 flex justify-between items-center border-b border-slate-200">
                      <span>搜索结果</span>
                      <div className="flex items-center gap-2">
                        <span className="text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
                          共 {totalResults.toLocaleString()} 条，已加载 {searchResults.length} 条
                        </span>
                        <button 
                          onClick={handleAddAllSearchResults}
                          className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200 hover:text-indigo-800 px-2.5 py-1.5 rounded-full transition-colors flex items-center shadow-sm"
                        >
                          <Plus className="w-3 h-3 mr-1" /> 全部加入
                        </button>
                      </div>
                    </div>
                    
                    <ul className="overflow-y-auto max-h-[350px] divide-y divide-slate-100 custom-scrollbar">
                      {searchResults.map(res => {
                        const isRefSeq = res.accession.startsWith('GCF_');
                        const isReference = res.category === 'reference genome';
                        const isRepresentative = res.category === 'representative genome';

                        return (
                          <li key={res.accession} className={`p-4 hover:bg-slate-50 transition-colors group flex flex-col sm:flex-row sm:justify-between items-start border-l-4 ${isReference ? 'bg-amber-50/40 border-l-amber-400' : 'bg-white border-l-transparent'}`}>
                            <div className="flex flex-col flex-1 pr-4 min-w-0 w-full">
                              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                <span className="font-bold text-slate-900 text-sm truncate" title={res.assemblyName}>
                                  {isRefSeq && <Star className="w-3.5 h-3.5 inline text-amber-500 fill-amber-500 mr-1.5 align-text-bottom" />}
                                  {res.assemblyName || res.name}
                                </span>
                                {isReference && (
                                  <span className="bg-gradient-to-r from-amber-100 to-yellow-50 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded flex items-center shrink-0 border border-amber-200/60 shadow-sm"><Star className="w-3 h-3 mr-1 fill-amber-500 text-amber-500"/> 官方参考</span>
                                )}
                                {isRepresentative && (
                                  <span className="bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded shrink-0 border border-blue-200/60">代表性组装</span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 leading-relaxed truncate" title={res.name}><span className="italic">{res.name}</span></div>
                              <div className="text-[11px] text-slate-400 mt-1 font-medium">{res.status || 'Unknown Status'} <span className="mx-1">•</span> {res.releaseDate ? res.releaseDate.split(' ')[0] : 'Unknown Date'}</div>
                            </div>
                            <div className="mt-3 sm:mt-0 flex flex-row sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto space-x-3 sm:space-x-0 sm:space-y-2.5 shrink-0">
                              <span className={`text-[11px] font-mono px-2 py-1 rounded-md border font-medium shadow-sm ${isRefSeq ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>{res.accession}</span>
                              <button onClick={() => handleAddSpecies(res)} className="flex items-center text-indigo-600 hover:text-white hover:bg-indigo-600 text-xs font-bold px-3 py-1.5 rounded-lg transition-all border border-indigo-100 shadow-sm hover:shadow-indigo-200"><Plus className="w-3.5 h-3.5 mr-1" /> 加入清单</button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    {hasMore && (
                      <div className="p-3 bg-slate-50 border-t border-slate-200 text-center">
                        <button onClick={() => searchNCBI(null, true, filterReferenceOnly)} disabled={isLoadingMore} className="text-indigo-600 hover:text-indigo-800 text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-indigo-100/50 transition-colors disabled:opacity-50 flex items-center justify-center mx-auto w-full sm:w-auto">
                          {isLoadingMore ? <><div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mr-2"></div>加载中...</> : `加载更多结果 ↓`}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="mb-6">
                  <label className="flex text-sm font-semibold text-slate-700 mb-3 justify-between items-end">
                    <span>已添加的工作清单</span>
                    {selectedSpecies.length > 0 && <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100 font-bold shadow-sm">已选 {selectedSpecies.length} 个</span>}
                  </label>
                  {selectedSpecies.length === 0 ? (
                    <div className="text-sm text-slate-400 p-6 bg-slate-50/50 rounded-xl border-2 border-dashed border-slate-200 text-center flex flex-col items-center justify-center">
                      <Archive className="w-8 h-8 text-slate-300 mb-2" />
                      尚未添加任何物种，请在上方搜索并添加。
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {selectedSpecies.map(sp => {
                        const isRefSeq = sp.accession.startsWith('GCF_');
                        return (
                          <div key={sp.accession} className="flex justify-between items-center p-3 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-indigo-200 transition-colors">
                            <div className="flex flex-col min-w-0 pr-2">
                              <span className="font-bold text-sm text-slate-800 truncate" title={sp.assemblyName || sp.name}>
                                {isRefSeq && <Star className="w-3.5 h-3.5 inline text-amber-500 fill-amber-500 mr-1.5 align-text-bottom" />}
                                {sp.assemblyName || sp.name}
                              </span>
                              <span className="text-xs text-slate-500 font-mono mt-1">{sp.accession}</span>
                            </div>
                            <button onClick={() => handleRemoveSpecies(sp.accession)} className="text-slate-400 hover:text-red-500 p-2 hover:bg-red-50 rounded-lg transition-colors shrink-0 border border-transparent hover:border-red-100">
                              <Trash className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                  
                <div className="pt-5 border-t border-slate-100">
                  <label className="flex text-sm font-semibold text-slate-700 mb-2 justify-between items-center">
                    <span>批量匹配 / 导入 Accession 编号</span>
                    <button onClick={() => fileInputRef.current?.click()} className="text-xs flex items-center text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-md transition-colors border border-indigo-100 font-bold">
                      <Upload className="w-3.5 h-3.5 mr-1" /> 导入文本文件
                    </button>
                    <input type="file" accept=".txt,.csv" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                  </label>
                  <textarea 
                    value={customAccessions}
                    onChange={(e) => setCustomAccessions(e.target.value)}
                    placeholder="输入多个编号（换行或逗号分隔），例如: GCF_002234675.1，或者点击上方【导入文本文件】..."
                    rows={2}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono outline-none transition-all shadow-inner custom-scrollbar"
                  />
                  
                  <div className="mt-3 flex items-center justify-between">
                    <button onClick={() => setIsAccessionHelpOpen(!isAccessionHelpOpen)} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center font-bold bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-full transition-colors border border-indigo-100">
                      <Info className="w-3.5 h-3.5 mr-1.5" /> 去哪里找编号？
                    </button>
                    <button 
                      onClick={handleBatchSearch}
                      disabled={isSearching || !customAccessions.trim()}
                      className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-1.5 rounded-full shadow-sm transition-colors disabled:opacity-50 flex items-center"
                    >
                      <Search className="w-3.5 h-3.5 mr-1.5" /> 搜索并在上方显示
                    </button>
                  </div>

                  {isAccessionHelpOpen && (
                    <div className="mt-3 p-5 bg-indigo-50/50 border border-indigo-100 rounded-xl text-sm text-slate-700 space-y-3 shadow-inner">
                      <ol className="list-decimal pl-4 space-y-2.5 text-slate-800 text-xs font-medium leading-relaxed">
                        <li>打开 <a href="https://www.ncbi.nlm.nih.gov/assembly" target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline font-bold">NCBI Assembly 数据库</a>。</li>
                        <li>搜索物种名称，在结果中找带 <strong className="text-indigo-700 bg-white px-1 py-0.5 rounded border border-indigo-100 shadow-sm">"Reference"</strong> 标记的基因组。</li>
                        <li>复制详情页中的 <strong className="text-indigo-700">RefSeq assembly accession</strong>（<code>GCF_</code> 开头）即可。</li>
                      </ol>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 space-y-8 flex flex-col">
               <div className="bg-white rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 p-6 transition-all hover:shadow-[0_4px_25px_-4px_rgba(0,0,0,0.08)]">
                <h2 className="text-lg font-bold flex items-center mb-5 text-slate-800">
                  <FileText className="w-5 h-5 mr-2.5 text-indigo-500" />
                  3. 挑选文件类型
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {FILE_TYPES.map(f => (
                    <label key={f.id} className="flex items-start p-4 hover:bg-slate-50 rounded-xl cursor-pointer border border-slate-200 transition-all shadow-sm hover:shadow group hover:border-indigo-200">
                      <input type="checkbox" checked={selectedFiles.includes(f.id)} onChange={() => toggleFile(f.id)} className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 mt-0.5 shadow-inner transition-colors cursor-pointer" />
                      <div className="ml-3.5 flex flex-col">
                        <span className="text-sm font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">{f.name}</span>
                        <span className="text-xs text-slate-500 mt-1.5 leading-relaxed">{f.desc}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 p-6 transition-all hover:shadow-[0_4px_25px_-4px_rgba(0,0,0,0.08)] flex-1 flex flex-col">
                <h2 className="text-lg font-bold flex items-center mb-6 text-slate-800">
                  <Check className="w-5 h-5 mr-2.5 text-indigo-500" />
                  4. 高级配置与生成
                </h2>
                
                <div className="space-y-6 flex-1 flex flex-col">
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2.5 gap-2">
                      <label className="block text-sm font-semibold text-slate-700">
                        绝对路径设定 <span className="text-xs text-slate-400 font-normal ml-1">(避免相对路径乱建目录)</span>
                      </label>
                      <div className="flex space-x-2">
                        <button onClick={() => setSavePath('~/Desktop/NCBI_downloads')} className="text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-2.5 py-1 rounded transition-colors">💻 桌面</button>
                        <button onClick={() => setSavePath('~/NCBI_downloads')} className="text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-2.5 py-1 rounded transition-colors">👤 用户目录</button>
                        <button onClick={() => setSavePath('/tmp/NCBI_downloads')} className="text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-2.5 py-1 rounded transition-colors">📁 临时目录</button>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <input 
                        type="text" 
                        value={savePath}
                        onChange={(e) => setSavePath(e.target.value)}
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono outline-none shadow-inner transition-all"
                      />
                      <button onClick={() => dirInputRef.current?.click()} className="px-4 py-2 bg-slate-100 border border-slate-200 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition-colors shadow-sm flex items-center">
                        <FolderOpen className="w-4 h-4 mr-1.5"/> 浏览
                      </button>
                      <input type="file" webkitdirectory="" ref={dirInputRef} className="hidden" onChange={handleDirSelect} />
                    </div>
                  </div>

                  <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center">
                      附加选项
                    </h3>
                    <div className="space-y-4">
                      
                      {/* 脱水模式选项 - 仅 datasets 可用 */}
                      <label className="flex items-center cursor-pointer group">
                        <input type="checkbox" checked={useDehydrated} onChange={(e) => setUseDehydrated(e.target.checked)} disabled={engine !== 'datasets'} className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500 rounded disabled:opacity-50 cursor-pointer shadow-inner" />
                        <Archive className={`w-4 h-4 ml-3 mr-2.5 ${engine !== 'datasets' ? 'text-slate-300' : 'text-emerald-500'}`} />
                        <span className={`text-sm font-medium ${engine !== 'datasets' ? 'text-slate-400' : 'text-slate-700 group-hover:text-slate-900 transition-colors'}`}>
                          使用脱水模式 <span className="text-xs text-slate-500 font-normal ml-1">(仅针对 Datasets，强烈推荐以避免 GOAWAY 报错)</span>
                        </span>
                      </label>

                      <label className="flex items-center cursor-pointer group">
                        <input type="checkbox" checked={autoRename} onChange={(e) => setAutoRename(e.target.checked)} disabled={engine === 'datasets'} className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500 rounded disabled:opacity-50 cursor-pointer shadow-inner" />
                        <Pencil className={`w-4 h-4 ml-3 mr-2.5 ${engine === 'datasets' ? 'text-slate-300' : 'text-blue-500'}`} />
                        <span className={`text-sm font-medium ${engine === 'datasets' ? 'text-slate-400' : 'text-slate-700 group-hover:text-slate-900 transition-colors'}`}>
                          下载后自动重命名 <span className="text-xs text-slate-500 font-normal ml-1">(修改为 <code>编号_类型.gz</code> 格式)</span>
                        </span>
                      </label>

                      <label className="flex items-center cursor-pointer group">
                        <input type="checkbox" checked={autoUnzip} onChange={(e) => setAutoUnzip(e.target.checked)} disabled={engine === 'datasets'} className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500 rounded disabled:opacity-50 cursor-pointer shadow-inner" />
                        <Archive className={`w-4 h-4 ml-3 mr-2.5 ${engine === 'datasets' ? 'text-slate-300' : 'text-purple-500'}`} />
                        <span className={`text-sm font-medium ${engine === 'datasets' ? 'text-slate-400' : 'text-slate-700 group-hover:text-slate-900 transition-colors'}`}>
                          下载后自动解压 <span className="text-xs text-slate-500 font-normal ml-1">(仅针对 .gz 格式)</span>
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-slate-100 mt-auto flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex space-x-5 bg-slate-50 p-1.5 rounded-xl border border-slate-200 w-full sm:w-auto overflow-x-auto">
                      <label className={`flex items-center justify-center flex-1 sm:flex-none cursor-pointer px-3 py-2 rounded-lg transition-all ${outputMode === 'script' ? 'bg-white shadow-sm font-bold text-indigo-700' : 'text-slate-600 font-medium hover:text-slate-900'}`}>
                        <input type="radio" checked={outputMode === 'script'} onChange={() => setOutputMode('script')} className="sr-only" />
                        <span className="text-sm whitespace-nowrap">生成脚本 (.sh)</span>
                      </label>
                      <label className={`flex items-center justify-center flex-1 sm:flex-none cursor-pointer px-3 py-2 rounded-lg transition-all ${outputMode === 'commands' ? 'bg-white shadow-sm font-bold text-indigo-700' : 'text-slate-600 font-medium hover:text-slate-900'}`}>
                        <input type="radio" checked={outputMode === 'commands'} onChange={() => setOutputMode('commands')} className="sr-only" />
                        <span className="text-sm whitespace-nowrap">仅显示代码</span>
                      </label>
                    </div>
                    
                    <div className="flex space-x-3 w-full sm:w-auto">
                      {outputMode === 'script' && (
                        <button onClick={handleDownloadFile} disabled={selectedSpecies.length === 0 || selectedFiles.length === 0} className="flex-1 sm:flex-none bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center transition-all shadow-md shadow-indigo-200 disabled:opacity-50 disabled:shadow-none">
                          <Download className="w-4 h-4 mr-2" /> 下载脚本
                        </button>
                      )}
                      <button onClick={handleCopy} disabled={selectedSpecies.length === 0 || selectedFiles.length === 0} className={`flex-1 sm:flex-none px-6 py-3 rounded-xl font-bold flex items-center justify-center transition-all border shadow-sm ${outputMode === 'commands' ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white border-transparent shadow-indigo-200 hover:shadow-lg' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300'} disabled:opacity-50 disabled:shadow-none`}>
                        {isCopied ? <Check className="w-4 h-4 mr-2 text-green-500" /> : <Copy className="w-4 h-4 mr-2" />} 
                        {isCopied ? '✅ 已复制' : '复制代码'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 终端高亮动效容器 */}
              <div className={`bg-slate-900 rounded-2xl shadow-xl border flex flex-col overflow-hidden transition-all duration-300 ease-in-out ${highlightTerminal ? 'border-indigo-500 shadow-indigo-500/20 ring-2 ring-indigo-500' : 'border-slate-800 shadow-slate-900/10'}`}>
                <div className="bg-slate-800/80 px-5 py-3.5 border-b border-slate-700 flex justify-between items-center text-sm backdrop-blur-md">
                  <div className="flex items-center space-x-2.5">
                    <span className="w-3.5 h-3.5 rounded-full bg-red-500/90 border border-red-600/50 shadow-inner"></span>
                    <span className="w-3.5 h-3.5 rounded-full bg-amber-500/90 border border-amber-600/50 shadow-inner"></span>
                    <span className="w-3.5 h-3.5 rounded-full bg-green-500/90 border border-green-600/50 shadow-inner"></span>
                  </div>
                  <div className="flex items-center absolute left-1/2 -translate-x-1/2">
                    <Terminal className="w-4 h-4 mr-2 text-slate-400" />
                    <span className="text-slate-300 font-mono font-bold tracking-wide text-xs">{outputMode === 'script' ? 'download.sh' : 'Terminal Commands'}</span>
                  </div>
                </div>
                <textarea readOnly value={generatedCode} className="w-full h-80 bg-transparent text-slate-300 font-mono p-5 text-[13px] resize-none focus:outline-none leading-relaxed custom-scrollbar selection:bg-indigo-500/30" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-slate-100 overflow-hidden mt-8 transition-all hover:shadow-[0_4px_25px_-4px_rgba(0,0,0,0.08)]">
            <button onClick={() => setIsTutorialOpen(!isTutorialOpen)} className="w-full px-6 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors">
              <div className="flex items-center">
                <BookOpen className="w-6 h-6 mr-3 text-indigo-500" />
                <h2 className="text-lg font-bold text-slate-800">📖 首次使用必读：如何部署运行环境</h2>
              </div>
              {isTutorialOpen ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
            </button>
            
            {isTutorialOpen && (
              <div className="px-6 pb-8 pt-2 border-t border-slate-100 text-sm text-slate-700 space-y-8">
                <div className="bg-indigo-50/50 p-5 rounded-xl border border-indigo-100">
                  <h3 className="text-base font-bold text-indigo-900 mb-3 flex items-center"><span className="bg-indigo-500 text-white w-6 h-6 rounded flex items-center justify-center mr-2 text-xs">1</span> 跨平台运行指南</h3>
                  <ul className="list-disc pl-5 space-y-3 text-slate-700">
                    <li><strong>🍎 macOS / 🐧 Linux</strong>: 系统已原生集成终端。请直接打开 <code>Terminal</code> 运行即可。</li>
                    <li>
                      <strong>🪟 Windows 用户专用指南</strong>: 原生 cmd 无法直接运行 bash 脚本，请任选下方一种方式：
                      <ul className="list-circle pl-6 mt-2 space-y-2 text-slate-600 text-xs">
                        <li><strong>推荐：使用 WSL (Windows 子系统)</strong> - 以管理员身份运行 PowerShell，输入 <code>wsl --install</code>，重启后即可获得完整的 Linux 环境。</li>
                        <li><strong>备选：使用 Git Bash</strong> - 访问 <a href="https://gitforwindows.org/" target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline font-bold">Git 官网</a> 下载安装，安装后右键菜单选择 "Git Bash Here" 即可运行脚本。</li>
                      </ul>
                    </li>
                  </ul>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 mb-3 border-l-4 border-blue-500 pl-3">方式一：运行 wget / rsync 脚本</h3>
                    <p className="mb-3 text-slate-600 leading-relaxed">生成的脚本已自带依赖检查。下载 <code>download.sh</code> 后，在终端中进入对应文件夹并运行：</p>
                    <div className="bg-slate-900 text-slate-300 p-4 rounded-xl font-mono text-sm mb-3 shadow-inner">bash download.sh</div>
                    <p className="text-xs text-slate-500">注：Linux 一般已自带该环境；macOS 若缺失脚本会自动提示使用 <code>brew</code> 安装。</p>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-slate-900 mb-3 border-l-4 border-green-500 pl-3">方式二：使用 NCBI Datasets（推荐）</h3>
                    <p className="mb-3 text-slate-600 leading-relaxed">如果你选择了 <code>datasets</code> 引擎，请先安装该工具（官方推荐 Conda 安装法）：</p>
                    <div className="space-y-4">
                      <div className="bg-slate-900 text-slate-300 p-4 rounded-xl shadow-inner">
                        <pre className="text-xs font-mono overflow-x-auto custom-scrollbar leading-relaxed">
{`# 1. 创建独立环境并激活
conda create -n ncbi_datasets
conda activate ncbi_datasets

# 2. 安装 datasets 包
conda install -c conda-forge ncbi-datasets-cli

# 3. 验证安装
datasets --version`}
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-900 mb-3 border-l-4 border-red-500 pl-3">常见问题排查</h3>
                  <div className="bg-red-50 p-5 rounded-xl border border-red-100">
                    <ul className="list-disc pl-5 space-y-3 text-slate-700">
                      <li><strong><code className="bg-white px-1.5 py-0.5 rounded border border-red-200 text-red-700">datasets: command not found</code></strong>: 环境未激活。Conda 用户请先运行 <code>conda activate ncbi_datasets</code>。</li>
                      <li><strong><code className="bg-white px-1.5 py-0.5 rounded border border-red-200 text-red-700">Permission denied</code></strong>: 脚本没有执行权限。请在终端运行 <code>chmod +x 文件名</code>。</li>
                      <li><strong>网络中断或报错</strong>: 无论是 wget 还是 datasets <strong>都支持断点续传</strong>。直接重新运行完整的命令即可，已下载部分会被自动跳过！</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <footer className="mt-12 mb-8 flex flex-col items-center justify-center space-y-3 text-slate-400">
        <div className="text-sm font-bold tracking-widest uppercase text-slate-400">
          Powered by jwy_hm - {new Date().getFullYear()} © All rights reserved.
        </div>
        <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2 text-sm font-medium">
          <a href="mailto:gmzhaoyubo@gmail.com" className="flex items-center hover:text-indigo-500 transition-colors">
            <Mail className="w-4 h-4 mr-1.5" /> gmzhaoyubo@gmail.com
          </a>
          <a href="https://github.com/jwy-hm" target="_blank" rel="noreferrer" className="flex items-center hover:text-indigo-500 transition-colors">
            <GithubIcon className="w-4 h-4 mr-1.5" /> jwy-hm
          </a>
          <a href="https://resume.safehome.eu.org/" target="_blank" rel="noreferrer" className="flex items-center hover:text-indigo-500 transition-colors">
            <User className="w-4 h-4 mr-1.5" /> 个人简历
          </a>
        </div>
      </footer>
    </div>
  );
}
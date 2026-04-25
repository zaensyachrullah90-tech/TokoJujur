import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  AlertTriangle, ArrowLeft, BarChart3, Barcode, Camera, CheckCircle, 
  ChevronRight, Copy, CreditCard, Download, Edit, ExternalLink, History, 
  Image as ImageIcon, List, Lock, LogOut, Package, PlusCircle, Power, 
  QrCode, RefreshCw, Search, Settings, Share2, ShoppingCart, Sparkles, 
  Store, Trash2, TrendingDown, TrendingUp, UploadCloud, Wand2, X 
} from 'lucide-react';

// =========================================================================
// KONEKSI SUPABASE LANGSUNG (ANTI-GAGAL)
// =========================================================================
const SUPABASE_URL = 'https://azsocvlmuaddleqtlvko.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6c29jdmxtdWFkZGxlcXRsdmtvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5OTAxMjEsImV4cCI6MjA5MTU2NjEyMX0.xGq-IpxhlFQ_8KTPIZXUm-NLKHIrQI4uNMfG9SVLAgA';

let supabaseClient = null;

// --- EFEK SUARA ---
const playBeep = () => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.1);
    osc.stop(ctx.currentTime + 0.1);
  } catch (e) {}
};

const formatRupiah = (angka) => {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka || 0);
};

// FORMATTER GAMBAR GOOGLE DRIVE (METODE VIP lh3.googleusercontent - PENEMBUS BLOKIR)
const formatImageUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('data:image') || url.startsWith('blob:')) return url; 
  
  const driveMatch = url.match(/(?:file\/d\/|id=)([a-zA-Z0-9_-]+)/);
  if (driveMatch && driveMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
  }
  
  if (url.includes('github.com') && url.includes('/blob/')) return url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
  return url;
};

// GAMBAR PENGGANTI JIKA LINK G-DRIVE SALAH / DIPRIVASI
const FALLBACK_IMAGE = "https://placehold.co/400x400/f8fafc/94a3b8?text=Foto+Kosong";

const hitungTotalHargaItem = (item, qty) => {
  if (item.diskon && qty >= (item.diskon.min_qty || 1)) {
    const paketDiskon = Math.floor(qty / item.diskon.min_qty);
    const sisaBiasa = qty % item.diskon.min_qty;
    return (paketDiskon * (item.diskon.harga_total || 0)) + (sisaBiasa * (item.jual || 0));
  }
  return (item.jual || 0) * qty;
};

// =========================================================================
// KOMPONEN UTAMA
// =========================================================================
function MainApp() {
  const [dbReady, setDbReady] = useState(false);
  const [isLoadingDB, setIsLoadingDB] = useState(true);
  const [isConnected, setIsConnected] = useState(false); 
  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState({ show: false, msg: '', type: 'success' });
  
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('tokojujur_view') || 'toko'; } catch(e) { return 'toko'; }
  }); 
  
  const [products, setProducts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [settings, setSettings] = useState({ 
    nama_toko: 'Memuat Toko...', qris_url: '', rekening: '', admin_password: '', logo_url: '' 
  });
  
  const [geminiKey, setGeminiKey] = useState(() => {
    try { return localStorage.getItem('tokojujur_gemini_key') || ''; } catch(e) { return ''; }
  });
  
  // KERANJANG TERSIMPAN LOKAL
  const [cart, setCart] = useState(() => {
    try {
      const savedCart = localStorage.getItem('tokojujur_cart');
      return savedCart ? JSON.parse(savedCart) : {};
    } catch(e) { return {}; }
  });

  // RIWAYAT TRANSAKSI LOKAL
  const [localHistory, setLocalHistory] = useState(() => {
    try {
      const savedHistory = localStorage.getItem('tokojujur_local_history');
      return savedHistory ? JSON.parse(savedHistory) : [];
    } catch(e) { return []; }
  });

  const [strukTerakhir, setStrukTerakhir] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [tempQty, setTempQty] = useState(0);

  const [showShareApp, setShowShareApp] = useState(false);
  const [isScanningModalOpen, setIsScanningModalOpen] = useState(false);
  const [scanTarget, setScanTarget] = useState(''); 
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [isAdminLogged, setIsAdminLogged] = useState(() => {
    try { return localStorage.getItem('tokojujur_admin') === 'true'; } catch(e) { return false; }
  });
  const [adminTab, setAdminTab] = useState(() => {
    try { return localStorage.getItem('tokojujur_admintab') || 'analisa'; } catch(e){ return 'analisa'; }
  }); 
  
  const [loginInput, setLoginInput] = useState('');
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  const [sortTrx, setSortTrx] = useState('terbaru'); 
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null); 
  const [newProduct, setNewProduct] = useState({ nama: '', modal: 0, jual: 0, stok: 0, barcode: '', diskonQty: '', diskonHarga: '', gambar: '' });
  const [useDiskon, setUseDiskon] = useState(false);
  const [editingTrx, setEditingTrx] = useState(null);

  const searchFilteredProducts = useMemo(() => {
    return products.filter(p => p.nama?.toLowerCase().includes(searchQuery.toLowerCase()) || p.barcode?.includes(searchQuery));
  }, [products, searchQuery]);

  const totalBelanja = useMemo(() => {
    return Object.entries(cart).reduce((total, [id, qty]) => {
      const p = products.find(prod => prod.id === parseInt(id));
      return total + (p ? hitungTotalHargaItem(p, qty) : 0);
    }, 0);
  }, [cart, products]);

  const jumlahItem = Object.values(cart).reduce((a, b) => a + b, 0);

  // =========================================================================
  // OTAR ATIK LOGIKA ADMIN - LENGKAP & ANTI POTONG TEKS
  // =========================================================================
  const adminData = useMemo(() => {
    if (view !== 'admin' || !isAdminLogged) return null;

    // FILTER TRANSAKSI
    const filteredTransactions = transactions.filter(t => {
      if (!filterStart && !filterEnd) return true;
      let tDate;
      const match = t.id?.match(/\d+/);
      tDate = match ? new Date(parseInt(match[0])) : new Date();
      const sDate = filterStart ? new Date(filterStart) : new Date(0);
      let eDate = filterEnd ? new Date(filterEnd) : new Date('2100-01-01');
      if (filterEnd) eDate.setHours(23, 59, 59, 999);
      return tDate >= sDate && tDate <= eDate;
    });

    const sortedTransactions = [...filteredTransactions].sort((a, b) => {
      if (sortTrx === 'terbaru') return b.id.localeCompare(a.id);
      if (sortTrx === 'terlama') return a.id.localeCompare(b.id);
      if (sortTrx === 'terbesar') return (b.total || 0) - (a.total || 0);
      if (sortTrx === 'terkecil') return (a.total || 0) - (b.total || 0);
      return 0;
    });

    // MENGHITUNG PENJUALAN PER ITEM (REALISASI)
    const itemSalesMap = {};
    let totalBarangTerjual = 0;
    filteredTransactions.forEach(t => {
      if (!t.items) return;
      t.items.forEach(item => {
        if (!itemSalesMap[item.id]) itemSalesMap[item.id] = { qty: 0, revenue: 0, profit: 0, modalTerjual: 0 };
        itemSalesMap[item.id].qty += (item.qty || 0);
        itemSalesMap[item.id].revenue += (item.totalHarga || 0);
        itemSalesMap[item.id].profit += (item.profitItem !== undefined ? item.profitItem : (item.totalHarga - ((item.modal||0) * item.qty)));
        itemSalesMap[item.id].modalTerjual += ((item.modal||0) * item.qty);
        totalBarangTerjual += (item.qty || 0);
      });
    });

    const totalPendapatanKotor = filteredTransactions.reduce((sum, t) => sum + (t.total || 0), 0);
    const totalKeuntunganBersih = filteredTransactions.reduce((sum, t) => sum + (t.profit !== undefined ? t.profit : ((t.total||0) - (t.modal||0))), 0);
    const totalModalTerjual = filteredTransactions.reduce((sum, t) => sum + (t.modal || 0), 0);

    // MENGGABUNGKAN DATA STOK AWAL & MODAL TOTAL
    const inventoryList = products.map(p => {
      const qtyTerjual = itemSalesMap[p.id]?.qty || 0;
      const stokAwal = (p.stok || 0) + qtyTerjual; 
      
      const modalTotalAwal = stokAwal * (p.modal || 0);
      const potensiSisaProfit = ((p.jual || 0) - (p.modal || 0)) * (p.stok || 0);

      const daysActive = Math.max(1, Math.floor((new Date() - new Date(p.tanggal_dibuat || new Date())) / (1000 * 60 * 60 * 24)));
      
      return {
        ...p,
        qtyTerjual,
        stokAwal,
        modalTotalAwal,
        potensiSisaProfit,
        revenue: itemSalesMap[p.id]?.revenue || 0,
        profitTerjual: itemSalesMap[p.id]?.profit || 0,
        daysActive
      };
    });

    const productRankings = [...inventoryList].sort((a, b) => b.qtyTerjual - a.qtyTerjual);
    const topSelling = productRankings.filter(p => p.qtyTerjual > 0).slice(0, 10);
    const bottomSelling = [...inventoryList].filter(p => p.stok > 0).sort((a, b) => (a.qtyTerjual - b.qtyTerjual) || (b.daysActive - a.daysActive)).slice(0, 5);

    // KALKULASI KESELURUHAN (MASTER)
    const grandTotalModalAwal = inventoryList.reduce((sum, p) => sum + p.modalTotalAwal, 0);
    const grandTotalStokAwal = inventoryList.reduce((sum, p) => sum + p.stokAwal, 0);
    const grandTotalPotensiSisaProfit = inventoryList.reduce((sum, p) => sum + p.potensiSisaProfit, 0);
    const grandTotalSisaStok = products.reduce((sum, p) => sum + (p.stok || 0), 0);
    const totalJenisBarang = products.length;

    // SISA INVENTORI SAAT INI
    const totalInventoryModal = products.reduce((sum, p) => sum + ((p.modal || 0) * (p.stok || 0)), 0);
    const totalInventoryPotentialRevenue = products.reduce((sum, p) => sum + ((p.jual || 0) * (p.stok || 0)), 0);

    // KESELURUHAN GLOBAL (Laku + Sisa)
    const totalOmsetKeseluruhan = totalPendapatanKotor + totalInventoryPotentialRevenue;
    const totalProfitKeseluruhan = totalKeuntunganBersih + grandTotalPotensiSisaProfit;

    return {
      // 1. MASTER
      grandTotalModalAwal, grandTotalStokAwal, totalOmsetKeseluruhan, totalProfitKeseluruhan, totalJenisBarang,
      // 2. SISA / INVENTORI
      grandTotalSisaStok, totalInventoryModal, totalInventoryPotentialRevenue, grandTotalPotensiSisaProfit,
      // 3. TEREALISASI / TERJUAL
      totalBarangTerjual, totalPendapatanKotor, totalKeuntunganBersih, totalModalTerjual,
      
      filteredTransactions, sortedTransactions, productRankings, topSelling, bottomSelling, inventoryList
    };
  }, [transactions, products, filterStart, filterEnd, sortTrx, view, isAdminLogged]);

  const showToast = (msg, type = 'success') => {
    setToast({ show: true, msg: String(msg), type });
    setTimeout(() => setToast({ show: false, msg: '', type: 'success' }), 4000); 
  };

  // SYSTEM PWA & NOTIFIKASI & AUTO-UPDATE FAVICON
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') Notification.requestPermission();
      
      const logoUrl = settings.logo_url ? formatImageUrl(settings.logo_url) : "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🏪</text></svg>";
      
      let link = document.querySelector("link[rel~='icon']");
      if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
      link.href = logoUrl;

      let appleIcon = document.querySelector("link[rel='apple-touch-icon']");
      if (!appleIcon) { appleIcon = document.createElement('link'); appleIcon.rel = 'apple-touch-icon'; document.head.appendChild(appleIcon); }
      appleIcon.href = logoUrl;
      
      document.title = settings.nama_toko || 'Toko Kejujuran';
    }
  }, [settings.logo_url, settings.nama_toko]);

  useEffect(() => { try { localStorage.setItem('tokojujur_view', view); } catch(e){} }, [view]);
  useEffect(() => { try { localStorage.setItem('tokojujur_admintab', adminTab); } catch(e){} }, [adminTab]);
  useEffect(() => { try { localStorage.setItem('tokojujur_cart', JSON.stringify(cart)); } catch(e){} }, [cart]);
  useEffect(() => { try { localStorage.setItem('tokojujur_local_history', JSON.stringify(localHistory)); } catch(e){} }, [localHistory]);
  useEffect(() => { try { localStorage.setItem('tokojujur_gemini_key', geminiKey); } catch(e){} }, [geminiKey]);

  // INISIALISASI SUPABASE LANGSUNG MENGGUNAKAN KEY
  useEffect(() => {
    const initSupabase = () => {
      try {
        const env = typeof import.meta !== 'undefined' ? import.meta.env : {};
        let url = env.VITE_SUPABASE_URL || localStorage.getItem('tokojujur_sb_url') || SUPABASE_URL;
        let key = env.VITE_SUPABASE_ANON_KEY || localStorage.getItem('tokojujur_sb_key') || SUPABASE_KEY;
        
        if (url.endsWith('/rest/v1/')) {
            url = url.replace('/rest/v1/', '');
        }

        if (url && key && window.supabase) {
          supabaseClient = window.supabase.createClient(url, key);
          setIsConnected(true);
        } else {
          setIsConnected(false);
        }
      } catch(e) {
        setIsConnected(false);
      }
      setDbReady(true);
    };

    if (!window.supabase) {
      const script = document.createElement('script');
      script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      script.onload = initSupabase;
      document.head.appendChild(script);
    } else {
      initSupabase();
    }
  }, []);

  // REALTIME INSTAN & SINKRONISASI
  useEffect(() => {
    if (!dbReady || !isConnected || !supabaseClient) return;
    
    const loadData = async (isInitial = false) => {
      if (isInitial) setIsLoadingDB(true);
      try {
        const [prodRes, trxRes, setRes] = await Promise.all([
          supabaseClient.from('produk').select('*').order('id', { ascending: true }),
          supabaseClient.from('transaksi').select('*').order('id', { ascending: false }),
          supabaseClient.from('pengaturan').select('*').eq('id', 1).single()
        ]);
        
        if (prodRes.error) console.error(prodRes.error);
        if (prodRes.data) setProducts(prodRes.data);
        if (trxRes.data) setTransactions(trxRes.data);
        if (setRes.data) setSettings(setRes.data);
      } catch (e) {
        if (isInitial) showToast("Gagal terhubung ke Database.", "error");
      }
      if (isInitial) setIsLoadingDB(false);
    };

    loadData(true);

    const pollInterval = setInterval(() => loadData(false), 5000);

    const channel = supabaseClient.channel('toko-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'produk' }, () => loadData(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transaksi' }, () => loadData(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pengaturan' }, () => loadData(false))
      .subscribe();
      
    return () => { 
      clearInterval(pollInterval);
      supabaseClient.removeChannel(channel); 
    };
  }, [dbReady, isConnected]);

  const handleCopyRekening = () => {
    const amanRekening = settings.rekening || '';
    const matchAngka = amanRekening.match(/\d+/);
    const textToCopy = matchAngka ? matchAngka[0] : amanRekening;
    
    if (navigator.clipboard && navigator.clipboard.writeText && textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      showToast('Berhasil Menyalin Nomor Rekening!', 'success');
    } else if (textToCopy) {
      const textArea = document.createElement("textarea");
      textArea.value = textToCopy;
      document.body.appendChild(textArea);
      textArea.select();
      try { document.execCommand('copy'); showToast('Berhasil Menyalin Nomor Rekening!', 'success'); } catch(e) {}
      document.body.removeChild(textArea);
    }
  };

  const startScanner = async (target) => {
    if (!('BarcodeDetector' in window)) {
      showToast('Browser HP Anda belum mendukung pemindaian kamera otomatis.', 'error');
      return;
    }
    setScanTarget(target);
    setIsScanningModalOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 }, advanced: [{ focusMode: "continuous" }] } 
      });
      if (videoRef.current) videoRef.current.srcObject = stream;
      streamRef.current = stream;
    } catch (err) {
      showToast('Akses kamera ditolak.', 'error');
      setIsScanningModalOpen(false);
    }
  };

  const stopScanner = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    setIsScanningModalOpen(false);
  };

  const handleBarcodeResultToko = (code) => {
    const foundProduct = products.find(p => p.barcode === code);
    if (foundProduct) {
      setSearchQuery('');
      openProductModal(foundProduct);
      showToast(`Otomatis Membuka: ${foundProduct.nama}`, 'success');
    } else {
      setSearchQuery(code);
      showToast('Barang belum terdaftar', 'error');
    }
  };

  const handleBarcodeResultAdmin = async (code) => {
    setNewProduct(prev => ({ ...prev, barcode: code }));
    const localProduct = products.find(p => p.barcode === code);
    if (localProduct) {
      showToast(`Membaca data lokal: ${localProduct.nama}`, 'success');
      return; 
    }
    showToast('Mencari nama & foto asli di internet...', 'success');
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`);
      const data = await res.json();
      if (data.status === 1 && data.product && data.product.product_name) {
        setNewProduct(prev => ({ 
          ...prev, 
          nama: data.product.product_name,
          gambar: data.product.image_url || prev.gambar 
        }));
        showToast('Nama otomatis terisi!', 'success');
      }
    } catch (err) {}
  };

  useEffect(() => {
    let interval;
    if (isScanningModalOpen && videoRef.current) {
      const detector = new window.BarcodeDetector({ formats: ['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'] });
      interval = setInterval(async () => {
        if (videoRef.current && videoRef.current.readyState >= 2) {
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              const code = barcodes[0].rawValue;
              playBeep(); 
              stopScanner();
              if (scanTarget === 'toko') handleBarcodeResultToko(code);
              else handleBarcodeResultAdmin(code);
            }
          } catch (e) {}
        }
      }, 300); 
    }
    return () => clearInterval(interval);
  }, [isScanningModalOpen, scanTarget, products]);

  const handleGenerateGeminiImage = async () => {
    if (!geminiKey) return showToast('Harap masukkan API Key Gemini di tab Pengaturan!', 'error');
    if (!newProduct.nama) return showToast('Isi nama barang terlebih dahulu!', 'error');
    
    setIsProcessing(true);
    showToast('Gemini melukis gambar barang...', 'success');
    try {
      const promptText = `A highly detailed, hyper-realistic commercial studio photography of a real product package named "${newProduct.nama}", exact real-world packaging, pure solid white background, vibrant colors, perfect studio lighting, highly realistic texture.`;
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instances: { prompt: promptText }, parameters: { sampleCount: 1 } })
      });
      const data = await res.json();
      if (data.predictions && data.predictions[0] && data.predictions[0].bytesBase64Encoded) {
        setNewProduct(prev => ({ ...prev, gambar: `data:image/png;base64,${data.predictions[0].bytesBase64Encoded}` }));
        showToast('Gambar AI berhasil dibuat!', 'success');
      } else showToast('Gagal generate gambar. Periksa kuota/API Key.', 'error');
    } catch (err) { showToast('Koneksi ke Gemini gagal.', 'error'); }
    setIsProcessing(false);
  };

  const handleEnhanceWithAI = async () => {
    if (!geminiKey) return showToast('Harap masukkan API Key Gemini di tab Pengaturan!', 'error');
    if (!newProduct.gambar || !newProduct.gambar.startsWith('data:image')) return showToast('Silakan ambil foto dari kamera terlebih dahulu!', 'error');
    
    setIsProcessing(true);
    showToast('Gemini Flash 2.5 sedang membersihkan foto...', 'success');
    try {
      const base64Data = newProduct.gambar.split(',')[1];
      const mimeType = newProduct.gambar.split(';')[0].split(':')[1];
      const payload = {
        contents: [{
          parts: [
            { text: "Clean up this product photo perfectly. Remove the background and replace it with a pure solid white background. Improve lighting, clarity, and colors to make it look like a high-quality professional commercial studio product shot." },
            { inlineData: { mimeType: mimeType, data: base64Data } }
          ]
        }],
        generationConfig: { responseModalities: ['IMAGE'] }
      };

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      const outputBase64 = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
      
      if (outputBase64) {
        setNewProduct(prev => ({ ...prev, gambar: `data:image/jpeg;base64,${outputBase64}` }));
        showToast('Foto berhasil dibersihkan AI Gemini!', 'success');
      } else showToast('Gagal merapikan gambar. Cek API/Kuota.', 'error');
    } catch (err) { showToast('Koneksi ke Gemini gagal.', 'error'); }
    setIsProcessing(false);
  };

  const handleDownloadPreviewImage = () => {
    if (!newProduct.gambar || !newProduct.gambar.startsWith('data:image')) return;
    const link = document.createElement('a');
    link.href = newProduct.gambar;
    link.download = `${newProduct.nama || 'Produk'}_AI_Cleaned.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Foto didownload! Silakan upload ke folder G-Drive.', 'success');
  };

  const handleUploadProductImage = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2097152) return showToast('Ukuran maksimal 2MB.', 'error');
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewProduct(prev => ({ ...prev, gambar: reader.result }));
        showToast('Foto berhasil diambil!', 'success');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUploadLogo = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2097152) return showToast('Ukuran logo maksimal 2MB.', 'error');
      const reader = new FileReader();
      reader.onloadend = () => {
        setSettings(prev => ({ ...prev, logo_url: reader.result }));
        showToast('Logo berhasil diunggah, silakan simpan pengaturan.', 'success');
      };
      reader.readAsDataURL(file);
    }
  };

  const openProductModal = (product) => {
    setSelectedProduct(product);
    setTempQty(cart[product.id] || 0);
  };

  const saveToCart = () => {
    if (tempQty === 0) {
      const newCart = { ...cart };
      delete newCart[selectedProduct.id];
      setCart(newCart);
      showToast('Barang dihapus dari keranjang.', 'success');
    } else {
      setCart({ ...cart, [selectedProduct.id]: tempQty });
      showToast('Barang tersimpan di keranjang!', 'success');
    }
    setSelectedProduct(null);
  };

  const handleUpdateCartQty = (id, change) => {
    const product = products.find(p => p.id === parseInt(id));
    if (!product) return;
    const currentQty = cart[id] || 0;
    const newQty = currentQty + change;
    
    if (newQty <= 0) {
      const newCart = { ...cart };
      delete newCart[id];
      setCart(newCart);
      if (Object.keys(newCart).length === 0) setView('toko');
    } else if (newQty > product.stok) {
      showToast('Sisa stok tidak mencukupi!', 'error');
    } else {
      setCart({ ...cart, [id]: newQty });
    }
  };

  const handleClearCart = () => {
    if(window.confirm('Yakin ingin mengosongkan seluruh isi keranjang Anda?')) {
      setCart({});
      setView('toko');
      showToast('Keranjang berhasil dikosongkan.', 'success');
    }
  };

  const handleClearLocalHistory = () => {
    if(window.confirm('Yakin ingin menghapus riwayat pembelian di HP ini? Data tidak bisa dikembalikan.')) {
      setLocalHistory([]);
      showToast('Riwayat berhasil dihapus.', 'success');
    }
  };

  const handleSelesaiBayar = async () => {
    if (!supabaseClient) return showToast('Database Sedang Tidak Terhubung!', 'error');
    setIsProcessing(true);

    const detailPesanan = Object.entries(cart).map(([id, qty]) => {
      const p = products.find(prod => prod.id === parseInt(id));
      const subTotal = hitungTotalHargaItem(p, qty);
      const unitModal = p.modal || 0;
      return { 
        id: p.id, nama: p.nama, modal: unitModal, jual: p.jual || 0, 
        qty, totalHarga: subTotal, profitItem: subTotal - (unitModal * qty),
        gambar: p.gambar || null
      };
    });
    
    const totalModalTrx = detailPesanan.reduce((s, i) => s + (i.modal * i.qty), 0);
    const totalOmsetTrx = totalBelanja;
    const totalProfitTrx = totalOmsetTrx - totalModalTrx;

    const newTransaction = { 
      id: `TRX-${Date.now()}`, 
      tanggal: new Date().toLocaleString('id-ID'), 
      items: detailPesanan, 
      total: totalOmsetTrx, 
      modal: totalModalTrx, 
      profit: totalProfitTrx, 
      metode: 'QRIS / Kasir Etalase'
    };

    setTransactions(prev => [newTransaction, ...prev]);
    setProducts(prev => prev.map(prod => {
      const boughtItem = detailPesanan.find(i => i.id === prod.id);
      return boughtItem ? { ...prod, stok: (prod.stok || 0) - boughtItem.qty } : prod;
    }));
    
    setLocalHistory(prev => [newTransaction, ...prev]);
    setStrukTerakhir(newTransaction);
    setView('struk');
    setCart({}); 
    setIsProcessing(false);

    const { error: trxError } = await supabaseClient.from('transaksi').insert([newTransaction]);
    if (trxError) showToast(`Gagal nyimpan TRX: ${trxError.message}`, 'error');
    
    for (const item of detailPesanan) {
      const prod = products.find(p => p.id === item.id);
      if (prod) await supabaseClient.from('produk').update({ stok: (prod.stok || 0) - item.qty }).eq('id', item.id);
    }
  };

  const handleTutupStruk = () => {
    setStrukTerakhir(null);
    setView('toko');
  };

  const handleShareStruk = async () => {
    if (!strukTerakhir) return;
    const shareData = {
      title: `Struk - ${settings.nama_toko}`,
      text: `*${settings.nama_toko}*\nID Transaksi: ${strukTerakhir.id}\nTanggal: ${strukTerakhir.tanggal}\n\nBelanjaan:\n${strukTerakhir.items.map(i => `- ${i.qty}x ${i.nama} = ${formatRupiah(i.totalHarga)}`).join('\n')}\n\n*Total Dibayar: ${formatRupiah(strukTerakhir.total)}*\n\nSilahkan bayar dengan scan QRIS Resmi di kaca etalase. Kejujuran Anda, Kebanggaan Kami!`,
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch (err) {}
    } else {
      window.print(); 
    }
  };

  const handleExitApp = () => {
    if (window.confirm('Keluar dari aplikasi Toko Kejujuran?')) {
      try { window.close(); } catch (e) {}
      setTimeout(() => {
        showToast('Tutup tab/browser Anda secara manual jika jendela tidak menutup.', 'success');
        setView('toko');
        setIsAdminLogged(false);
      }, 500);
    }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (loginInput === settings.admin_password) {
      setIsAdminLogged(true);
      try { localStorage.setItem('tokojujur_admin', 'true'); } catch(err){}
      setLoginInput('');
      showToast('Login Berhasil', 'success');
    } else showToast('Password Salah', 'error');
  };

  const handleLogout = () => {
    setIsAdminLogged(false);
    try { localStorage.removeItem('tokojujur_admin'); } catch(err){}
    setView('toko');
    showToast('Berhasil Keluar', 'success');
  };

  const handleUploadQRIS = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 1048576) return showToast('Ukuran gambar maksimal 1MB.', 'error');
      const reader = new FileReader();
      reader.onloadend = () => {
        setSettings({ ...settings, qris_url: reader.result });
        showToast('Gambar QRIS siap disimpan!', 'success');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDownloadQRIS = () => {
    if (!settings.qris_url) return showToast('Belum ada gambar QRIS', 'error');
    const link = document.createElement('a');
    link.href = formatImageUrl(settings.qris_url);
    link.download = 'QRIS_Toko_Kejujuran.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Mendownload QRIS...', 'success');
  };

  const handleSaveSettings = async () => {
    if (!supabaseClient) return showToast('Database belum terhubung', 'error');
    setIsProcessing(true);
    setSettings(settings);
    try { localStorage.setItem('tokojujur_gemini_key', geminiKey); } catch(e){}

    let { error } = await supabaseClient.from('pengaturan').update({
      nama_toko: settings.nama_toko, 
      qris_url: settings.qris_url,
      rekening: settings.rekening, 
      admin_password: settings.admin_password,
      logo_url: settings.logo_url
    }).eq('id', 1);
    
    if (error && error.message.includes('logo_url')) {
       const { error: fallbackError } = await supabaseClient.from('pengaturan').update({
          nama_toko: settings.nama_toko, 
          qris_url: settings.qris_url,
          rekening: settings.rekening, 
          admin_password: settings.admin_password
       }).eq('id', 1);
       error = fallbackError;
       if (!error) showToast('Pengaturan disimpan, TAPI logo gagal. Harap buat kolom "logo_url" di Supabase.', 'error');
    } else if (error) {
       showToast(`Gagal: ${error.message}`, 'error');
    } else {
       showToast('Pengaturan Disimpan ke Database', 'success');
    }
    
    setIsProcessing(false);
  };

  const handleEditClick = (product) => {
    setNewProduct({
      nama: product.nama, modal: product.modal || 0, jual: product.jual || 0, stok: product.stok || 0,
      barcode: product.barcode || '', diskonQty: product.diskon ? product.diskon.min_qty : '', diskonHarga: product.diskon ? product.diskon.harga_total : '',
      gambar: product.gambar || ''
    });
    setUseDiskon(!!product.diskon);
    setEditingId(product.id);
    setShowAddForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!supabaseClient) return showToast('Database belum terhubung', 'error');
    
    const isDuplicate = products.some(p => {
      const isNameSame = p.nama.toLowerCase().trim() === newProduct.nama.toLowerCase().trim();
      const isBarcodeSame = newProduct.barcode && p.barcode === newProduct.barcode;
      if (editingId && p.id === editingId) return false;
      return isNameSame || isBarcodeSame;
    });

    if (isDuplicate) return showToast('Nama / Barcode sudah ada!', 'error');

    setIsProcessing(true);
    let disc = null;
    if (useDiskon) disc = { min_qty: parseInt(newProduct.diskonQty) || 1, harga_total: parseInt(newProduct.diskonHarga) || 0 };
    
    const targetId = editingId ? editingId : Date.now();
    const tempProd = { 
      nama: newProduct.nama, barcode: newProduct.barcode, modal: newProduct.modal||0, 
      jual: newProduct.jual||0, stok: newProduct.stok||0, diskon: disc,
      gambar: newProduct.gambar || null
    };
    
    if (editingId) setProducts(p => p.map(item => item.id === editingId ? { ...item, ...tempProd } : item));
    else setProducts(p => [...p, { ...tempProd, id: targetId, tanggal_dibuat: new Date().toISOString() }]);

    setShowAddForm(false);
    setEditingId(null);
    setNewProduct({ nama: '', modal: 0, jual: 0, stok: 0, barcode: '', diskonQty: '', diskonHarga: '', gambar: '' });
    setUseDiskon(false);
    
    if (editingId) {
      let { error } = await supabaseClient.from('produk').update(tempProd).eq('id', editingId);
      if (error && error.message.includes('gambar')) {
        const { gambar, ...prodNoImg } = tempProd;
        await supabaseClient.from('produk').update(prodNoImg).eq('id', editingId);
      }
    } else {
      let { error } = await supabaseClient.from('produk').insert([{ ...tempProd, id: targetId, tanggal_dibuat: new Date().toISOString() }]);
      if (error && error.message.includes('gambar')) {
        const { gambar, ...prodNoImg } = tempProd;
        await supabaseClient.from('produk').insert([{ ...prodNoImg, id: targetId, tanggal_dibuat: new Date().toISOString() }]);
      }
    }
    showToast('Data Barang Disimpan', 'success');
    setIsProcessing(false);
  };

  const handleDeleteProduct = async (id) => {
    if (!supabaseClient) return;
    if(window.confirm("Yakin ingin menghapus barang ini secara permanen?")) {
       setProducts(prev => prev.filter(item => item.id !== id)); 
       await supabaseClient.from('produk').delete().eq('id', id);
       showToast('Dihapus dari server', 'success');
    }
  };

  const handleClearAllProducts = async () => {
    if (!supabaseClient) return;
    if (window.confirm("PERINGATAN SANGAT PENTING!\n\nApakah Anda benar-benar yakin ingin MENGHAPUS SELURUH BARANG TOKO?\n\nData yang dihapus TIDAK BISA DIKEMBALIKAN!")) {
      setProducts([]); 
      await supabaseClient.from('produk').delete().neq('id', 0); 
      showToast('Seluruh daftar barang dihapus!', 'success');
    }
  };

  const handleClearTransactions = async () => {
    if (!supabaseClient) return;
    if (window.confirm("PERINGATAN SANGAT PENTING!\n\nApakah Anda yakin MENGHAPUS SELURUH RIWAYAT TRANSAKSI PENJUALAN?\nSTOK BARANG AKAN DIKEMBALIKAN SEPERTI SEMULA!")) {
      setIsProcessing(true);
      const stockToRestore = {};
      transactions.forEach(t => {
        t.items.forEach(item => {
          if (!stockToRestore[item.id]) stockToRestore[item.id] = 0;
          stockToRestore[item.id] += item.qty;
        });
      });

      setProducts(prevProducts => prevProducts.map(p => {
        if (stockToRestore[p.id]) return { ...p, stok: p.stok + stockToRestore[p.id] };
        return p;
      }));
      setTransactions([]); 

      for (const [productId, qtyToReturn] of Object.entries(stockToRestore)) {
        const product = products.find(p => p.id === parseInt(productId));
        if (product) await supabaseClient.from('produk').update({ stok: (product.stok || 0) + qtyToReturn }).eq('id', product.id);
      }

      await supabaseClient.from('transaksi').delete().neq('id', '0'); 
      showToast('Transaksi dihapus & Stok kembali!', 'success');
      setIsProcessing(false);
    }
  };

  const handleDeleteSingleTransaction = async (id) => {
    if (!supabaseClient) return;
    if (window.confirm("Hapus transaksi ini? Stok barang akan dikembalikan seperti semula.")) {
      setIsProcessing(true);
      const trx = transactions.find(t => t.id === id);
      if (!trx) return;

      setProducts(prevProducts => prevProducts.map(p => {
        const boughtItem = trx.items.find(i => i.id === p.id);
        if (boughtItem) return { ...p, stok: (p.stok || 0) + boughtItem.qty };
        return p;
      }));
      
      setTransactions(prev => prev.filter(t => t.id !== id));

      for (const item of trx.items) {
        const product = products.find(p => p.id === item.id);
        if (product) await supabaseClient.from('produk').update({ stok: (product.stok || 0) + item.qty }).eq('id', product.id);
      }

      await supabaseClient.from('transaksi').delete().eq('id', id);
      showToast('Transaksi dihapus & stok kembali!', 'success');
      setIsProcessing(false);
    }
  };

  const handleSaveEditTrx = async (e) => {
     e.preventDefault();
     if (!supabaseClient) return;
     setIsProcessing(true);
     setTransactions(prev => prev.map(t => t.id === editingTrx.id ? editingTrx : t));
     await supabaseClient.from('transaksi').update({
       metode: editingTrx.metode, total: editingTrx.total, profit: editingTrx.profit, modal: editingTrx.modal
     }).eq('id', editingTrx.id);
     showToast('Transaksi diperbarui!', 'success');
     setEditingTrx(null);
     setIsProcessing(false);
  };

  const handleExportCSV = () => {
    const filteredForExport = transactions.filter(t => {
      if (!filterStart && !filterEnd) return true;
      let tDate;
      const match = t.id.match(/\d+/);
      tDate = match ? new Date(parseInt(match[0])) : new Date();
      const sDate = filterStart ? new Date(filterStart) : new Date(0);
      let eDate = filterEnd ? new Date(filterEnd) : new Date('2100-01-01');
      if (filterEnd) eDate.setHours(23, 59, 59, 999);
      return tDate >= sDate && tDate <= eDate;
    });

    if (filteredForExport.length === 0) return showToast('Tidak ada data', 'error');
    let csv = "ID Transaksi,Tanggal,Metode,Total Belanja,Total Modal,Profit Bersih\n";
    filteredForExport.forEach(t => csv += `"${t.id}","${t.tanggal}","${t.metode}","${t.total}","${t.modal}","${t.profit}"\n`);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `Laporan_Toko_Kejujuran_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const renderLogo = (sizeCls = "w-8 h-8") => {
    if (settings.logo_url) {
      return <img src={formatImageUrl(settings.logo_url)} className={`${sizeCls} object-contain rounded-lg shadow-sm`} alt="Logo" onError={(e) => { e.target.onerror=null; e.target.src=FALLBACK_IMAGE; }} />
    }
    return <Store className="text-emerald-500 shrink-0" size={28} />;
  };

  // --- RENDER UI ---
  if (!isConnected || !supabaseClient) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white text-center font-sans">
        <AlertTriangle size={64} className="text-rose-500 mb-4 animate-pulse" />
        <h1 className="text-2xl font-black mb-2 uppercase tracking-tighter">Database Terputus!</h1>
        <p className="text-slate-400 text-xs md:text-sm max-w-md mb-8 leading-relaxed">Hubungkan URL dan Anon Key dari Supabase Anda untuk mengaktifkan fitur Realtime Online.</p>
        <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-sm text-left shadow-2xl border border-slate-700">
           <div className="mb-4">
             <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Supabase URL</label>
             <input type="text" id="sbUrl" defaultValue={localStorage.getItem('tokojujur_sb_url') || ''} className="w-full mt-1 p-3 rounded-xl bg-slate-900 border border-slate-700 text-white outline-none focus:border-emerald-500 text-sm font-mono" placeholder="https://xxxx.supabase.co" />
           </div>
           <div className="mb-6">
             <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Supabase Anon Key</label>
             <input type="password" id="sbKey" defaultValue={localStorage.getItem('tokojujur_sb_key') || ''} className="w-full mt-1 p-3 rounded-xl bg-slate-900 border border-slate-700 text-white outline-none focus:border-emerald-500 text-sm font-mono" placeholder="eyJhbG..." />
           </div>
           <button onClick={() => {
              const url = document.getElementById('sbUrl').value.trim();
              const key = document.getElementById('sbKey').value.trim();
              if(url && key) { localStorage.setItem('tokojujur_sb_url', url); localStorage.setItem('tokojujur_sb_key', key); window.location.reload(true); }
              else alert('Wajib diisi!');
           }} className="w-full bg-emerald-600 hover:bg-emerald-500 p-4 rounded-xl font-black transition-all active:scale-95 shadow-lg shadow-emerald-900/50">Hubungkan Sekarang</button>
        </div>
      </div>
    );
  }

  if (isLoadingDB) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center font-sans">
        <Store className="text-emerald-500 animate-bounce relative z-10" size={80} />
        <h2 className="text-emerald-500 font-black text-2xl mt-4 tracking-[0.3em] uppercase animate-pulse">MEMUAT TOKO...</h2>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-emerald-100 relative">
      
      {/* MODALS AREA */}
      {isScanningModalOpen && (
        <div className="fixed inset-0 bg-black z-[999] flex flex-col animate-fade-in">
          <div className="flex justify-between items-center p-4 bg-gradient-to-b from-black/80 to-transparent text-white absolute top-0 w-full z-10">
            <span className="font-bold text-lg tracking-widest uppercase">Arahkan ke Barcode</span>
            <button onClick={stopScanner} className="p-3 bg-red-500/80 hover:bg-red-500 rounded-full transition-colors backdrop-blur-sm shadow-xl"><X size={24}/></button>
          </div>
          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-64 h-40 border-4 border-emerald-500 rounded-3xl shadow-[0_0_0_9999px_rgba(0,0,0,0.7)] relative flex items-center justify-center">
              <div className="absolute w-full h-0.5 bg-emerald-400 animate-[scan_2s_ease-in-out_infinite] shadow-[0_0_10px_#34d399]"></div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SHARE TOKO */}
      {showShareApp && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl flex flex-col items-center relative text-center animate-slide-up">
            <button onClick={() => setShowShareApp(false)} className="absolute top-4 right-4 p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition"><X size={20}/></button>
            {renderLogo("w-16 h-16 mb-2")}
            <h3 className="font-black text-2xl text-slate-800 mb-1">{settings.nama_toko}</h3>
            <p className="text-xs text-slate-500 font-bold mb-6">Scan QR Code ini untuk membuka toko di HP Pembeli</p>
            <div className="bg-white p-4 rounded-3xl shadow-sm border-2 border-dashed border-emerald-300 mb-6">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}`} alt="QR Code Toko" className="w-48 h-48 object-contain" />
            </div>
            <div className="w-full bg-slate-50 p-3 rounded-2xl border border-slate-200 flex items-center justify-between gap-3 mb-2">
              <span className="text-xs font-mono text-slate-600 truncate font-bold">{typeof window !== 'undefined' ? window.location.href : ''}</span>
              <button onClick={() => { if(navigator.clipboard) navigator.clipboard.writeText(window.location.href); showToast('Link Toko Berhasil Disalin!', 'success'); }} className="p-2 bg-emerald-100 text-emerald-700 rounded-xl hover:bg-emerald-200 transition shadow-sm"><Copy size={16}/></button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDIT TRANSAKSI */}
      {editingTrx && (
        <div className="fixed inset-0 bg-slate-900/60 z-[999] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
           <div className="bg-white rounded-3xl p-6 w-full max-w-md animate-slide-up shadow-2xl border-4 border-white">
              <h3 className="font-black text-xl mb-1 text-slate-800">Edit Data Transaksi</h3>
              <p className="text-xs font-bold text-slate-400 mb-6 pb-4 border-b border-slate-100">Koreksi total harga atau metode pembayaran jika ada kesalahan.</p>
              <form onSubmit={handleSaveEditTrx}>
                 <div className="space-y-4">
                    <div>
                      <label className="text-[10px] uppercase tracking-widest font-black text-gray-500 ml-1">Metode Pembayaran</label>
                      <select value={editingTrx.metode} onChange={e => setEditingTrx({...editingTrx, metode: e.target.value})} className="w-full p-4 mt-1 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm text-slate-700 outline-none focus:ring-4 focus:ring-emerald-500/20">
                         <option value="QRIS / Kasir Etalase">QRIS / Kasir Etalase</option>
                         <option value="QRIS Cepat">QRIS Cepat</option>
                         <option value="Transfer Bank">Transfer Bank</option>
                         <option value="Tunai">Tunai / Cash</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-widest font-black text-gray-500 ml-1">Total Belanja (Rp)</label>
                      <input type="number" value={editingTrx.total} onChange={e => setEditingTrx({...editingTrx, total: parseInt(e.target.value)||0, profit: (parseInt(e.target.value)||0) - editingTrx.modal})} className="w-full p-4 mt-1 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm text-slate-700 outline-none focus:ring-4 focus:ring-emerald-500/20" />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-widest font-black text-gray-500 ml-1">Total Modal (Rp)</label>
                      <input type="number" value={editingTrx.modal} onChange={e => setEditingTrx({...editingTrx, modal: parseInt(e.target.value)||0, profit: editingTrx.total - (parseInt(e.target.value)||0)})} className="w-full p-4 mt-1 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm text-slate-700 outline-none focus:ring-4 focus:ring-emerald-500/20" />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-widest font-black text-gray-500 ml-1">Keuntungan / Profit (Rp)</label>
                      <input type="number" value={editingTrx.profit} onChange={e => setEditingTrx({...editingTrx, profit: parseInt(e.target.value)||0})} className="w-full p-4 mt-1 bg-emerald-50 border border-emerald-200 rounded-2xl font-extrabold text-sm text-emerald-700 outline-none focus:ring-4 focus:ring-emerald-500/20" />
                    </div>
                 </div>
                 <div className="flex gap-3 mt-8">
                    <button type="button" onClick={() => setEditingTrx(null)} className="flex-1 py-4 bg-slate-100 font-bold rounded-2xl text-slate-600 hover:bg-slate-200 transition-colors">Batal</button>
                    <button type="submit" disabled={isProcessing} className="flex-1 py-4 bg-emerald-600 font-bold rounded-2xl text-white hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200">{isProcessing ? 'Menyimpan...' : 'Simpan Edit'}</button>
                 </div>
              </form>
           </div>
        </div>
      )}

      {/* TOAST GLOBAL */}
      {toast.show && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 bg-slate-900 text-white rounded-full shadow-2xl font-bold flex items-center gap-2 animate-slide-up border border-slate-700 w-max max-w-[90%] text-center text-sm md:text-base">
          {toast.type === 'success' ? <CheckCircle size={20} className="text-emerald-400 shrink-0"/> : <AlertTriangle size={20} className="text-rose-400 shrink-0"/>}
          {toast.msg}
        </div>
      )}

      {/* HEADER UMUM */}
      {view !== 'admin' && view !== 'struk' && (
        <header className="bg-white p-4 shadow-sm sticky top-0 z-40 mb-4 border-b">
          <div className="flex justify-between items-center mb-4 max-w-5xl mx-auto">
            <div className="flex items-center gap-2 text-emerald-600 font-black text-lg md:text-xl truncate max-w-[50%]">
              {renderLogo("w-8 h-8")}
              <span className="truncate">{settings.nama_toko} <span className="text-[10px] text-white bg-emerald-500 px-2 py-0.5 rounded-full ml-2 align-middle">v3.5</span></span>
            </div>
            <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
              <button onClick={() => setView('riwayat')} className="p-2 md:p-2.5 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition shadow-sm relative" title="Riwayat Pembelian">
                <History size={18}/>
              </button>
              <button onClick={() => setView('checkout')} className="p-2 md:p-2.5 bg-orange-50 text-orange-600 rounded-full hover:bg-orange-100 transition shadow-sm relative" title="Keranjang">
                <ShoppingCart size={18}/>
                {jumlahItem > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-bounce">{jumlahItem}</span>}
              </button>
              <button onClick={handleDownloadQRIS} className="p-2 md:p-2.5 bg-teal-50 text-teal-600 rounded-full hover:bg-teal-100 transition shadow-sm" title="Download QRIS"><QrCode size={18}/></button>
              <button onClick={() => setShowShareApp(true)} className="p-2 md:p-2.5 bg-emerald-50 text-emerald-600 rounded-full hover:bg-emerald-100 transition shadow-sm" title="Share Toko"><Share2 size={18}/></button>
              <button onClick={() => setView('admin')} className="p-2 md:p-2.5 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition shadow-sm" title="Admin"><Lock size={18}/></button>
            </div>
          </div>
          
          {view === 'toko' && (
            <div className="flex gap-2 max-w-5xl mx-auto">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 text-slate-400" size={20}/>
                <input type="text" placeholder="Cari barang atau barcode..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} className="w-full bg-slate-100 rounded-xl pl-10 pr-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500 font-medium transition-all border-none text-sm md:text-base"/>
              </div>
              <button onClick={() => startScanner('toko')} className="bg-slate-800 text-white p-3 rounded-xl cursor-pointer hover:bg-slate-700 active:scale-95 flex items-center shadow-lg shrink-0"><Camera size={24}/></button>
            </div>
          )}
        </header>
      )}

      {/* VIEW: TOKO */}
      {view === 'toko' && (
        <div className="pb-28">
          <div className="max-w-5xl mx-auto px-4 mb-6">
            <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-3xl p-5 shadow-lg text-white">
              <h3 className="font-extrabold text-sm md:text-base mb-3 flex items-center gap-2"><Sparkles size={18} className="text-yellow-300" /> Panduan Pembelian (Self-Service)</h3>
              <ol className="list-decimal list-inside text-[11px] md:text-sm font-bold text-emerald-100 space-y-2 ml-1">
                <li>Cari barang dengan mengetik nama atau klik kamera untuk scan barang.</li>
                <li>Atur jumlah barang, lalu klik tombol BAYAR di bawah.</li>
                <li>Periksa kembali keranjang Anda. Klik <strong className="text-white">Selesai & Cetak Struk</strong>.</li>
                <li className="text-yellow-300 font-extrabold">Bayar sesuai nominal struk melalui QRIS resmi di struk atau etalase.</li>
              </ol>
            </div>
          </div>

          <main className="p-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-5 max-w-5xl mx-auto pt-0">
            {searchFilteredProducts.map(p => (
              <div key={p.id} onClick={() => openProductModal(p)} className="bg-white p-3 md:p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center text-center relative active:scale-95 transition-transform cursor-pointer border-b-4 border-b-slate-100 overflow-hidden w-full h-full">
                {cart[p.id] > 0 && <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[10px] md:text-xs font-black px-2 md:px-3 py-1 rounded-bl-xl shadow-lg z-20">{cart[p.id]}</div>}
                
                {/* GAMBAR PRODUK RAKSASA DENGAN PENGHILANG ERROR VISUAL */}
                <div className="mb-3 md:mb-4 w-32 h-32 md:w-48 md:h-48 rounded-2xl border border-slate-100 shadow-inner relative overflow-hidden bg-slate-50 flex items-center justify-center shrink-0">
                  {p.gambar ? (
                    <img 
                      loading="lazy" 
                      referrerPolicy="no-referrer" 
                      src={formatImageUrl(p.gambar)} 
                      className="absolute inset-0 w-full h-full object-cover z-10 bg-white will-change-transform" 
                      alt={p.nama} 
                      onError={(e) => { 
                        e.target.onerror = null; 
                        e.target.src = FALLBACK_IMAGE; 
                      }} 
                    />
                  ) : (
                    <img src={FALLBACK_IMAGE} className="w-16 h-16 opacity-50" alt="kosong"/>
                  )}
                </div>
                
                <h3 className="font-bold text-xs md:text-sm mb-1 line-clamp-2 h-8 md:h-10 w-full text-slate-700 leading-tight">{p.nama}</h3>
                <p className="text-emerald-600 font-black mb-2 text-sm md:text-lg w-full truncate">{formatRupiah(p.jual)}</p>
                <div className="mt-auto w-full flex justify-center"><div className={`text-[9px] md:text-[10px] font-black px-2 py-0.5 rounded-md truncate max-w-full ${(p.stok||0) > 5 ? 'bg-blue-50 text-blue-500' : 'bg-rose-50 text-rose-500'}`}>Sisa: {p.stok || 0}</div></div>
              </div>
            ))}
            {searchFilteredProducts.length === 0 && <div className="col-span-full text-center text-slate-400 mt-10 font-bold text-sm">Barang tidak ditemukan.</div>}
          </main>

          {/* MODAL PILIH JUMLAH BELI */}
          {selectedProduct && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-4 animate-fade-in">
              <div className="bg-white w-full max-w-md rounded-3xl p-6 md:p-8 shadow-2xl animate-slide-up border-4 border-white flex flex-col">
                <div className="flex justify-between items-start mb-6">
                   <div className="flex items-center gap-4 w-[85%]">
                     <div className="w-24 h-24 md:w-32 md:h-32 bg-slate-50 rounded-2xl shadow-inner overflow-hidden border shrink-0 relative flex items-center justify-center">
                       {selectedProduct.gambar ? (
                         <img loading="lazy" referrerPolicy="no-referrer" src={formatImageUrl(selectedProduct.gambar)} className="absolute inset-0 w-full h-full object-cover z-10 bg-white" onError={(e) => { e.target.onerror=null; e.target.src=FALLBACK_IMAGE; }}/>
                       ) : (
                         <img src={FALLBACK_IMAGE} className="w-12 h-12 opacity-50" alt="kosong"/>
                       )}
                     </div>
                     <div className="flex flex-col flex-1 overflow-hidden">
                        <h3 className="font-black text-lg md:text-xl text-slate-800 leading-tight line-clamp-2">{selectedProduct.nama}</h3>
                        <p className="text-emerald-600 font-black text-base md:text-lg">{formatRupiah(selectedProduct.jual)}</p>
                     </div>
                   </div>
                   <button onClick={() => setSelectedProduct(null)} className="p-2 bg-slate-100 rounded-full shrink-0 hover:bg-slate-200 transition"><X size={18}/></button>
                </div>
                
                {selectedProduct.diskon && (
                  <div className="bg-orange-50 text-orange-700 p-3 md:p-4 rounded-xl text-xs md:text-sm mb-6 border border-orange-200 text-center font-black w-full">🔥 Beli {selectedProduct.diskon.min_qty} bayar {formatRupiah(selectedProduct.diskon.harga_total)}</div>
                )}

                <div className="flex items-center justify-between bg-slate-50 p-4 md:p-5 rounded-2xl mb-6 border border-slate-100 w-full">
                   <button onClick={() => setTempQty(Math.max(0, tempQty-1))} className="w-12 h-12 md:w-14 md:h-14 bg-white rounded-xl shadow-sm font-black text-2xl border active:bg-slate-100 transition shrink-0">-</button>
                   <input type="number" value={tempQty === 0 ? '' : tempQty} onChange={e => setTempQty(Math.min(selectedProduct.stok||0, Math.max(0, parseInt(e.target.value)||0)))} className="bg-transparent text-center font-black text-3xl md:text-4xl w-full max-w-[100px] outline-none text-slate-800" placeholder="0"/>
                   <button onClick={() => setTempQty(Math.min(selectedProduct.stok||0, tempQty+1))} className="w-14 h-14 bg-emerald-600 text-white rounded-2xl shadow-sm font-black text-2xl active:bg-emerald-700 transition shrink-0">+</button>
                </div>

                <button onClick={saveToCart} className="w-full py-4 md:py-5 bg-slate-900 text-white rounded-2xl font-black text-lg md:text-xl shadow-xl active:scale-95 transition-all hover:bg-slate-800 mt-auto">Simpan Keranjang</button>
              </div>
            </div>
          )}

          {/* FLOATING CHECKOUT BUTTON */}
          {jumlahItem > 0 && !selectedProduct && (
            <div className="fixed bottom-6 left-4 right-4 z-50 max-w-md mx-auto">
              <button onClick={() => setView('checkout')} className="w-full bg-emerald-600 text-white p-4 md:p-5 rounded-3xl shadow-2xl flex justify-between items-center active:scale-95 transition-all border border-emerald-400">
                <div className="text-left overflow-hidden"><p className="text-[9px] md:text-[10px] opacity-90 font-black uppercase tracking-widest mb-0.5">{jumlahItem} Barang Dibeli</p><p className="text-xl md:text-2xl font-black truncate">{formatRupiah(totalBelanja)}</p></div>
                <div className="flex items-center gap-2 font-black bg-white/20 px-3 py-2 md:px-4 md:py-2.5 rounded-xl shrink-0 text-sm md:text-base">BAYAR <ChevronRight size={18}/></div>
              </button>
            </div>
          )}
        </div>
      )}

      {/* VIEW: CHECKOUT */}
      {view === 'checkout' && (
        <div className="max-w-md mx-auto p-4 md:p-6 min-h-screen flex flex-col pb-32">
          <button onClick={() => setView('toko')} className="flex items-center gap-2 font-black mb-6 text-slate-400 hover:text-slate-600 transition w-max"><ArrowLeft size={18}/> Kembali Belanja</button>
          
          <div className="bg-white rounded-3xl p-5 md:p-6 shadow-sm border border-slate-100 mb-6 mt-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-black text-base md:text-lg text-slate-800">Review Keranjang</h3>
              <button onClick={handleClearCart} className="flex items-center gap-1 text-[10px] md:text-xs font-bold text-red-500 bg-red-50 px-2 py-1 rounded hover:bg-red-100 transition"><Trash2 size={14}/> Bersihkan</button>
            </div>
            
            <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2">
              {Object.keys(cart).length === 0 && <p className="text-center text-sm font-bold text-slate-400 py-10">Keranjang Anda Kosong.</p>}
              {Object.entries(cart).map(([id, qty]) => {
                const p = products.find(prod => prod.id === parseInt(id));
                if (!p) return null;
                return (
                  <div key={id} className="flex justify-between items-center border-b border-slate-50 pb-4 last:border-0 last:pb-0">
                    <div className="flex items-center gap-3 w-[60%]">
                      <div className="w-16 h-16 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-100 overflow-hidden shrink-0 relative">
                        {p.gambar ? <img loading="lazy" referrerPolicy="no-referrer" src={formatImageUrl(p.gambar)} className="absolute inset-0 w-full h-full object-cover z-10 bg-white" onError={(e) => { e.target.onerror=null; e.target.src=FALLBACK_IMAGE; }}/> : <img src={FALLBACK_IMAGE} className="w-8 h-8 opacity-50" alt="kosong"/>}
                      </div>
                      <div className="overflow-hidden">
                        <p className="font-bold text-xs md:text-sm text-slate-800 line-clamp-1">{p.nama}</p>
                        <p className="text-[10px] text-emerald-600 font-black">{formatRupiah(p.jual)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 bg-slate-50 rounded-xl p-1 border border-slate-100 shrink-0">
                      <button onClick={() => handleUpdateCartQty(id, -1)} className="w-7 h-7 flex items-center justify-center bg-white rounded-md font-black shadow-sm text-slate-700 active:scale-95">-</button>
                      <span className="font-black text-xs w-6 text-center text-slate-800">{qty}</span>
                      <button onClick={() => handleUpdateCartQty(id, 1)} className="w-7 h-7 flex items-center justify-center bg-emerald-500 text-white rounded-md font-black shadow-sm active:scale-95">+</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-[32px] md:rounded-[40px] p-6 md:p-8 mb-8 shadow-2xl text-white relative overflow-hidden mt-auto">
             <div className="absolute -top-10 -right-10 opacity-10 rotate-12"><CreditCard size={150}/></div>
             <p className="text-[10px] md:text-xs opacity-70 font-black uppercase tracking-widest mb-1">Total Tagihan Anda</p>
             <h2 className="text-3xl md:text-5xl font-black tracking-tighter truncate">{formatRupiah(totalBelanja)}</h2>
          </div>

          <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-sm border-t border-slate-100 z-50">
            <button onClick={handleSelesaiBayar} disabled={isProcessing || Object.keys(cart).length === 0} className="w-full max-w-md mx-auto block py-4 md:py-5 bg-slate-900 text-white rounded-[20px] font-black text-lg md:text-xl shadow-2xl disabled:opacity-30 active:scale-95 transition-all hover:bg-slate-800">
              {isProcessing ? 'MENYIMPAN...' : 'Selesai & Cetak Struk'}
            </button>
          </div>
        </div>
      )}

      {/* VIEW: STRUK */}
      {view === 'struk' && (
        <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-start pt-10 px-4 pb-10">
          <div className="mb-6 flex flex-col items-center animate-slide-up text-center">
            <div className="w-14 h-14 md:w-16 md:h-16 bg-emerald-500 text-white rounded-full flex items-center justify-center mb-3 shadow-lg shadow-emerald-200"><CheckCircle size={32} /></div>
            <h2 className="text-xl md:text-2xl font-extrabold text-slate-800">Struk Tersimpan!</h2>
            <p className="text-slate-500 text-xs md:text-sm mt-1 font-bold">Lanjutkan dengan pembayaran di bawah.</p>
          </div>

          <div className="bg-white w-full max-w-md rounded-3xl shadow-xl overflow-hidden animate-fade-in relative mb-6 border border-slate-200">
            <div className="bg-slate-900 p-5 md:p-6 text-center text-white">
              {renderLogo("w-14 h-14 mb-2 mx-auto")}
              <h3 className="font-bold text-lg md:text-xl tracking-wide truncate px-4">{settings.nama_toko}</h3>
              <p className="text-[10px] md:text-xs text-slate-400 mt-1 opacity-80">E-Receipt • {strukTerakhir?.tanggal}</p>
            </div>
            
            <div className="p-5 md:p-6">
              <div className="flex justify-between items-center mb-4 pb-4 border-b border-dashed border-gray-200">
                <span className="text-[10px] md:text-xs text-gray-400 uppercase tracking-wider font-bold">ID Transaksi</span>
                <span className="text-[10px] md:text-xs font-mono text-slate-700 font-bold truncate max-w-[150px]">{strukTerakhir?.id}</span>
              </div>
              
              <div className="space-y-4 mb-6">
                {strukTerakhir?.items?.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-start gap-2">
                    <div className="flex items-start gap-3 w-[70%]">
                      <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-slate-50 flex items-center justify-center border overflow-hidden shrink-0 relative">
                        {item.gambar ? <img referrerPolicy="no-referrer" src={formatImageUrl(item.gambar)} className="absolute inset-0 w-full h-full object-cover z-10 bg-white" onError={(e) => { e.target.onerror=null; e.target.src=FALLBACK_IMAGE; }}/> : <img src={FALLBACK_IMAGE} className="w-6 h-6 opacity-50" alt="kosong"/>}
                      </div>
                      <div className="overflow-hidden">
                        <p className="font-semibold text-slate-800 text-[11px] md:text-sm line-clamp-2 leading-tight">{item.nama}</p>
                        <p className="text-[9px] md:text-[10px] text-gray-500 mt-0.5 font-bold">{item.qty} x {formatRupiah(item.jual)}</p>
                      </div>
                    </div>
                    <p className="font-bold text-slate-800 text-[11px] md:text-sm shrink-0 mt-1">{formatRupiah(item.totalHarga)}</p>
                  </div>
                ))}
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl flex justify-between items-center border border-slate-100">
                <span className="font-bold text-slate-600 text-xs md:text-sm">Total Tagihan</span>
                <span className="font-extrabold text-emerald-600 text-base md:text-xl truncate">{formatRupiah(strukTerakhir?.total)}</span>
              </div>
            </div>

            <div className="bg-emerald-50 p-5 md:p-6 text-center border-t border-emerald-100 border-dashed">
               <p className="text-[9px] md:text-[10px] text-emerald-600 uppercase font-black tracking-widest mb-2">Selesaikan Pembayaran</p>
               <h3 className="font-black text-xs md:text-sm text-emerald-900 tracking-tight leading-snug mb-4">Silahkan bayar dengan scan QRIS resmi toko kami di bawah ini.</h3>
               <div className="flex flex-col gap-4">
                 {settings.qris_url ? (
                   <div className="bg-white p-4 rounded-2xl border shadow-sm flex flex-col items-center w-full relative overflow-hidden">
                     <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-500 via-yellow-400 to-red-500"></div>
                     <p className="text-[10px] md:text-xs uppercase font-black text-slate-800 mb-3 mt-1 tracking-widest">QRIS Nasional</p>
                     <img referrerPolicy="no-referrer" src={formatImageUrl(settings.qris_url)} className="w-40 h-40 md:w-48 md:h-48 object-contain mb-4 border border-slate-100 p-1 rounded-xl" alt="QRIS Pembayaran"/>
                     <button onClick={handleDownloadQRIS} className="w-full py-2.5 md:py-3 bg-emerald-100 text-emerald-800 rounded-xl font-bold text-[9px] md:text-[10px] flex justify-center items-center gap-2 hover:bg-emerald-200 transition uppercase tracking-widest active:scale-95"><Download size={14}/> Simpan QRIS ke HP</button>
                   </div>
                 ) : (
                   <p className="text-xs font-bold text-red-500 bg-red-50 p-3 rounded-xl border border-red-100">Admin belum mengunggah foto QRIS.</p>
                 )}
               </div>
            </div>
            
            <div className="absolute top-[80px] -left-3 md:-left-4 w-6 h-6 md:w-8 md:h-8 bg-slate-100 rounded-full"></div>
            <div className="absolute top-[80px] -right-3 md:-right-4 w-6 h-6 md:w-8 md:h-8 bg-slate-100 rounded-full"></div>
          </div>

          <div className="flex gap-3 md:gap-4 w-full max-w-md pb-4">
            <button onClick={handleShareStruk} className="flex-1 py-3 md:py-4 bg-blue-100 text-blue-700 rounded-2xl font-bold shadow-sm hover:shadow-md hover:bg-blue-200 transition-all active:scale-95 flex flex-col items-center justify-center gap-1 text-[10px] md:text-xs"><Share2 size={18}/> Bagikan Struk</button>
            <button onClick={handleTutupStruk} className="flex-1 py-3 md:py-4 bg-slate-900 text-white rounded-2xl font-bold shadow-lg hover:shadow-xl hover:bg-slate-800 transition-all active:scale-95 flex flex-col items-center justify-center gap-1 text-[10px] md:text-xs"><Store size={18}/> Kembali ke Toko</button>
          </div>
        </div>
      )}

      {/* VIEWS: RIWAYAT LOKAL HP */}
      {view === 'riwayat' && (
         <div className="min-h-screen bg-slate-50 pb-20">
            <header className="bg-white p-4 shadow-sm flex items-center justify-between sticky top-0 z-40 border-b border-slate-200">
               <div className="flex items-center gap-3">
                 <button onClick={() => setView('toko')} className="p-2 bg-slate-100 text-slate-600 rounded-full hover:bg-slate-200"><ArrowLeft size={20}/></button>
                 <h1 className="font-black text-lg md:text-xl text-slate-800">Riwayat Belanja</h1>
               </div>
               {localHistory.length > 0 && (
                 <button onClick={handleClearLocalHistory} className="text-[10px] md:text-xs font-bold text-rose-500 flex items-center gap-1 bg-rose-50 px-3 py-2 rounded-xl hover:bg-rose-100 transition"><Trash2 size={14}/> Bersihkan</button>
               )}
            </header>
            <div className="p-4 max-w-3xl mx-auto space-y-4 mt-6">
               {localHistory.length === 0 ? (
                  <div className="text-center py-20 text-slate-400 font-bold flex flex-col items-center gap-3">
                     <List size={48} className="opacity-20"/>
                     <span>Belum ada riwayat belanja di HP ini.</span>
                  </div>
               ) : (
                  localHistory.map(trx => (
                     <div key={trx.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                        <div className="flex justify-between border-b border-slate-100 pb-3 mb-3">
                           <span className="text-[10px] md:text-xs font-mono text-slate-500 font-bold">{trx.id}</span>
                           <span className="text-[10px] md:text-xs font-bold text-slate-400">{trx.tanggal}</span>
                        </div>
                        <div className="space-y-3 mb-4">
                           {trx.items.map((item, idx) => (
                              <div key={idx} className="flex justify-between items-center text-xs md:text-sm font-semibold text-slate-700">
                                 <div className="flex items-center gap-3">
                                   <div className="w-8 h-8 rounded-lg border bg-slate-50 flex items-center justify-center shrink-0 overflow-hidden relative">
                                      {item.gambar ? <img loading="lazy" referrerPolicy="no-referrer" src={formatImageUrl(item.gambar)} className="absolute inset-0 w-full h-full object-cover z-10 bg-white" onError={(e) => { e.target.onerror=null; e.target.src=FALLBACK_IMAGE; }}/> : <img src={FALLBACK_IMAGE} className="w-5 h-5 opacity-50" alt="kosong"/>}
                                   </div>
                                   <span className="truncate max-w-[150px]">{item.qty}x {item.nama}</span>
                                 </div>
                                 <span>{formatRupiah(item.totalHarga)}</span>
                              </div>
                           ))}
                        </div>
                        <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                           <span className="font-bold text-sm text-slate-600">Total</span>
                           <span className="font-black text-emerald-600 text-lg md:text-xl">{formatRupiah(trx.total)}</span>
                        </div>
                        <button onClick={() => { setStrukTerakhir(trx); setView('struk'); }} className="w-full mt-3 py-3 bg-blue-50 text-blue-600 font-bold rounded-xl text-xs md:text-sm hover:bg-blue-100 transition active:scale-95 flex items-center justify-center gap-2">
                           <List size={16}/> Lihat Struk Detail
                        </button>
                     </div>
                  ))
               )}
            </div>
         </div>
      )}

      {/* VIEW: ADMIN LOGIN */}
      {view === 'admin' && !isAdminLogged && (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
          <form onSubmit={handleLogin} className="bg-white p-8 rounded-[40px] shadow-xl w-full max-w-sm border border-slate-100">
            <div className="w-20 h-20 bg-slate-50 text-slate-600 rounded-3xl flex items-center justify-center mb-6 mx-auto shadow-inner"><Lock size={32} /></div>
            <h2 className="text-2xl font-black text-center mb-2 text-slate-800 uppercase tracking-tight">Panel Admin</h2>
            <p className="text-center text-xs font-bold text-gray-400 mb-8 uppercase tracking-widest">Masukkan Sandi Keamanan</p>
            <input type="password" placeholder="••••••" value={loginInput} onChange={e => setLoginInput(e.target.value)} className="w-full bg-slate-50 border border-gray-100 rounded-2xl px-4 py-4 mb-6 focus:outline-none focus:border-emerald-500 font-black text-center tracking-[0.5em] text-xl" autoFocus />
            <button type="submit" className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-emerald-200 active:scale-95 transition-all text-lg">Buka Panel</button>
            <button type="button" onClick={() => setView('toko')} className="w-full text-slate-400 mt-6 text-xs font-bold uppercase tracking-widest hover:text-slate-600 transition">Kembali ke Toko</button>
          </form>
        </div>
      )}

      {/* VIEW: ADMIN DASHBOARD */}
      {view === 'admin' && isAdminLogged && adminData && (
        <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row relative w-full overflow-hidden">
          <aside className="bg-slate-950 text-white w-full md:w-64 flex-shrink-0 flex flex-col shadow-2xl sticky top-0 z-40 md:h-screen">
            <div className="hidden md:flex p-6 items-center gap-3 border-b border-slate-800 flex-shrink-0">
               {renderLogo("w-8 h-8")}
               <div><h2 className="font-extrabold text-xl text-white leading-tight tracking-wide">Admin Area</h2><p className="text-[10px] text-emerald-400 font-black uppercase tracking-widest mt-1">Toko Kejujuran</p></div>
            </div>
            <nav className="p-2 md:p-4 grid grid-cols-4 md:flex md:flex-col gap-2 w-full">
              <button onClick={() => {setAdminTab('analisa'); setEditingId(null); setShowAddForm(false);}} className={`flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 p-2 md:p-4 rounded-xl md:rounded-2xl transition-all ${adminTab==='analisa' ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}><BarChart3 size={20} className="md:w-6 md:h-6 shrink-0" /><span className="text-[10px] md:text-sm font-black text-center md:text-left leading-tight">Analisa<br className="md:hidden"/>Penjualan</span></button>
              <button onClick={() => {setAdminTab('barang'); setEditingId(null); setShowAddForm(false);}} className={`flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 p-2 md:p-4 rounded-xl md:rounded-2xl transition-all ${adminTab==='barang' ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}><Package size={20} className="md:w-6 md:h-6 shrink-0" /><span className="text-[10px] md:text-sm font-black text-center md:text-left leading-tight">Data<br className="md:hidden"/>Barang</span></button>
              <button onClick={() => {setAdminTab('pengaturan'); setEditingId(null); setShowAddForm(false);}} className={`flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 p-2 md:p-4 rounded-xl md:rounded-2xl transition-all ${adminTab==='pengaturan' ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}><Settings size={20} className="md:w-6 md:h-6 shrink-0" /><span className="text-[10px] md:text-sm font-black text-center md:text-left leading-tight">Pengaturan<br className="md:hidden"/>Toko</span></button>
              <button onClick={handleLogout} className="flex flex-col md:flex-row md:mt-auto items-center justify-center md:justify-start gap-1 md:gap-3 p-2 md:p-4 rounded-xl md:rounded-2xl text-rose-500 hover:bg-slate-800 hover:text-rose-400 transition-all"><LogOut size={20} className="md:w-6 md:h-6 shrink-0" /><span className="text-[10px] md:text-sm font-black text-center md:text-left leading-tight">Keluar<br className="md:hidden"/>Admin</span></button>
            </nav>
          </aside>
          
          <main className="flex-1 p-4 md:p-10 overflow-y-auto w-full max-w-7xl mx-auto">
             
             {/* TAB PENGATURAN */}
             {adminTab === 'pengaturan' && (
               <div className="max-w-4xl animate-fade-in mx-auto md:mx-0">
                  <h1 className="text-3xl font-black tracking-tighter text-slate-800 mb-8">Konfigurasi Toko</h1>
                  <div className="bg-white p-6 md:p-10 rounded-[40px] border border-slate-200 shadow-sm space-y-8">
                     <div className="space-y-3"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 flex items-center gap-2"><Store size={14}/> Nama Toko Digital</label><input value={settings.nama_toko || ''} onChange={e => setSettings({...settings, nama_toko: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-3xl font-black focus:ring-4 focus:ring-emerald-500/20 outline-none transition-all text-sm md:text-lg"/></div>
                     <hr className="border-slate-100"/>
                     
                     {/* PENGATURAN LOGO TOKO / FAVICON */}
                     <div className="space-y-3">
                       <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 flex items-center gap-2"><ImageIcon size={14}/> Logo Toko & Ikon Aplikasi (PWA)</label>
                       <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 bg-slate-50 border border-slate-200 p-6 rounded-[32px]">
                         <div className="flex flex-col items-center gap-3 w-full sm:w-auto shrink-0">
                           <div className="w-40 h-40 bg-white rounded-3xl border-2 border-dashed border-emerald-300 flex items-center justify-center p-2 overflow-hidden shadow-sm relative">
                             {settings.logo_url ? (<img referrerPolicy="no-referrer" src={formatImageUrl(settings.logo_url)} className="w-full h-full object-contain" alt="Logo Preview" onError={(e) => { e.target.onerror=null; e.target.src=FALLBACK_IMAGE; }}/>) : (<span className="text-xs text-slate-400 font-bold text-center">Belum ada Logo</span>)}
                           </div>
                         </div>
                         <div className="flex-1 w-full space-y-4">
                           <p className="text-[10px] text-slate-500 font-bold leading-relaxed">Penting: Logo ini akan mengubah Ikon Aplikasi di layar HP (PWA) dan Tab Browser (Favicon). Format rasio 1:1.</p>
                           <label className="w-full flex items-center justify-center gap-2 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 p-4 rounded-2xl font-black cursor-pointer transition-all active:scale-95 border border-emerald-200 text-xs md:text-sm"><UploadCloud size={18}/> Upload Logo dari Galeri<input type="file" accept="image/*" className="hidden" onChange={handleUploadLogo} /></label>
                           <div className="flex items-center gap-3"><div className="h-[1px] bg-slate-300 flex-1"></div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ATAU PASTE LINK</span><div className="h-[1px] bg-slate-300 flex-1"></div></div>
                           <input placeholder="Link G-Drive/GitHub..." value={settings.logo_url || ''} onChange={e => setSettings({...settings, logo_url: e.target.value})} className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold focus:ring-4 focus:ring-emerald-500/20 outline-none text-xs"/>
                         </div>
                       </div>
                     </div>

                     <hr className="border-slate-100"/>
                     <div className="space-y-3">
                       <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 flex items-center gap-2"><QrCode size={14}/> Foto QRIS Pembayaran Utama</label>
                       <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 bg-slate-50 border border-slate-200 p-6 rounded-[32px]">
                         <div className="flex flex-col items-center gap-3 w-full sm:w-auto shrink-0"><div className="w-40 h-40 bg-white rounded-3xl border-2 border-dashed border-emerald-300 flex items-center justify-center p-2 overflow-hidden shadow-sm relative">{settings.qris_url ? (<img referrerPolicy="no-referrer" src={formatImageUrl(settings.qris_url)} className="w-full h-full object-contain" alt="QRIS Preview" onError={(e) => { e.target.onerror=null; e.target.src=FALLBACK_IMAGE; }}/>) : (<span className="text-xs text-slate-400 font-bold text-center">Belum ada QRIS</span>)}</div></div>
                         <div className="flex-1 w-full space-y-4">
                           <label className="w-full flex items-center justify-center gap-2 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 p-4 rounded-2xl font-black cursor-pointer transition-all active:scale-95 border border-emerald-200 text-xs md:text-sm"><UploadCloud size={18}/> Upload QRIS dari Galeri<input type="file" accept="image/*" className="hidden" onChange={handleUploadQRIS} /></label>
                           <div className="flex items-center gap-3"><div className="h-[1px] bg-slate-300 flex-1"></div><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ATAU PASTE LINK</span><div className="h-[1px] bg-slate-300 flex-1"></div></div>
                           <input placeholder="Link G-Drive/GitHub..." value={settings.qris_url || ''} onChange={e => setSettings({...settings, qris_url: e.target.value})} className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold focus:ring-4 focus:ring-emerald-500/20 outline-none text-xs"/>
                         </div>
                       </div>
                     </div>
                     <hr className="border-slate-100"/>
                     <div className="space-y-3"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 flex items-center gap-2"><CreditCard size={14}/> Info Rekening Manual (Cadangan)</label><input value={settings.rekening || ''} onChange={e => setSettings({...settings, rekening: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-3xl font-bold focus:ring-4 focus:ring-emerald-500/20 outline-none transition-all text-xs md:text-sm"/><p className="text-[10px] text-slate-400 font-bold ml-2">Format: NAMA BANK [SPASI] NO REKENING [SPASI] a.n NAMA PEMILIK</p></div>
                     <hr className="border-slate-100"/>
                     <div className="space-y-3"><label className="text-[10px] font-black text-blue-500 uppercase tracking-widest ml-2 flex items-center gap-2"><Sparkles size={14}/> Gemini API Key (Untuk AI Gambar)</label><input type="password" value={geminiKey} onChange={e => setGeminiKey(e.target.value)} placeholder="AIzaSy..." className="w-full p-4 bg-blue-50/50 text-blue-900 rounded-3xl font-bold border border-blue-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all text-xs md:text-sm"/><p className="text-[10px] text-slate-400 font-bold ml-2">Tersimpan aman di memori HP Anda. Diperlukan untuk merapihkan foto otomatis.</p></div>
                     <hr className="border-slate-100"/>
                     <div className="space-y-3"><label className="text-[10px] font-black text-rose-500 uppercase tracking-widest ml-2 flex items-center gap-2"><Lock size={14}/> Sandi Rahasia Admin</label><input type="text" value={settings.admin_password || ''} onChange={e => setSettings({...settings, admin_password: e.target.value})} className="w-full p-4 bg-rose-50/50 text-rose-900 rounded-3xl font-black border border-rose-200 focus:border-rose-400 focus:ring-4 focus:ring-rose-500/20 outline-none transition-all tracking-[0.5em] text-lg md:text-xl text-center"/></div>
                     <div className="space-y-3 pt-4 border-t border-slate-100 mt-6">
                       <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 flex items-center gap-2"><Settings size={14}/> Sistem & Perbaikan</label>
                       <button onClick={() => { if(window.confirm('Aplikasi akan memuat ulang dan menghapus memori sementara. Lanjutkan?')) { localStorage.clear(); window.location.reload(true); } }} className="w-full py-4 bg-orange-100 text-orange-700 rounded-[24px] font-bold text-sm hover:bg-orange-200 transition-all flex items-center justify-center gap-2 active:scale-95 shadow-sm"><RefreshCw size={18}/> Hapus Cache & Refresh Aplikasi</button>
                       <p className="text-[10px] text-slate-400 font-bold ml-2 text-center">Gunakan tombol ini jika tampilan toko tidak berubah setelah pembaruan.</p>
                     </div>
                     <button disabled={isProcessing} onClick={handleSaveSettings} className="w-full py-5 bg-slate-900 text-white rounded-[32px] font-black text-sm md:text-lg shadow-xl shadow-slate-300 hover:bg-slate-800 transition-all active:scale-95 mt-8 disabled:opacity-50">{isProcessing ? 'MENYIMPAN...' : 'SIMPAN SEMUA PENGATURAN'}</button>
                  </div>
               </div>
             )}

             {/* TAB ANALISA */}
             {adminTab === 'analisa' && (
               <div className="animate-fade-in max-w-7xl mx-auto w-full pb-10">
                  <div className="flex flex-col xl:flex-row justify-between xl:items-center mb-8 gap-6 w-full">
                    <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-slate-800">Ikhtisar Penjualan & Inventori</h1>
                    <div className="flex flex-col md:flex-row gap-4 w-full xl:w-auto">
                      <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm w-full md:w-auto">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Filter Waktu Trx:</span>
                        <input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)} className="bg-slate-50 px-2 py-2 rounded-xl text-xs md:text-sm font-bold outline-none text-slate-700 border border-slate-100 flex-1 md:flex-none"/>
                        <span className="text-slate-300 font-black hidden md:inline">-</span>
                        <input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} className="bg-slate-50 px-2 py-2 rounded-xl text-xs md:text-sm font-bold outline-none text-slate-700 border border-slate-100 flex-1 md:flex-none"/>
                        {(filterStart || filterEnd) && <button onClick={() => {setFilterStart(''); setFilterEnd('');}} className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-500 rounded-xl transition-colors shrink-0"><X size={16}/></button>}
                      </div>
                      <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                        <button onClick={handleExportCSV} className="bg-slate-900 text-white px-4 py-3 md:px-6 rounded-2xl font-black flex items-center justify-center gap-2 shadow-xl active:scale-95 transition-all text-xs md:text-sm"><Download size={16}/> EXPORT CSV</button>
                        <button onClick={handleClearTransactions} disabled={isProcessing} className="bg-rose-600 text-white px-4 py-3 md:px-6 rounded-2xl font-black flex items-center justify-center gap-2 shadow-xl active:scale-95 transition-all text-xs md:text-sm"><Trash2 size={16}/> RESET TRX</button>
                      </div>
                    </div>
                  </div>

                  {/* 1. SECTION: REKAP KESELURUHAN (MASTER AWAL) */}
                  <h2 className="text-lg md:text-2xl font-black text-slate-800 mb-5 flex items-center gap-3"><Store className="text-blue-600" size={26}/> 1. Ringkasan Total Keseluruhan (Master)</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-12">
                     <div className="bg-white p-5 md:p-6 rounded-3xl md:rounded-[32px] shadow-sm border border-gray-100 relative overflow-hidden flex flex-col justify-between h-full">
                        <div className="absolute top-0 right-0 p-4 opacity-5"><Package size={60}/></div>
                        <div className="relative z-10 w-full">
                           <p className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-wider mb-1.5 break-normal">Total Barang Awal</p>
                           <p className="text-lg sm:text-xl xl:text-2xl font-black text-slate-900 tracking-tighter">{adminData.grandTotalStokAwal} Pcs</p>
                        </div>
                        <p className="text-[10px] md:text-xs font-bold text-slate-500 mt-2 relative z-10">Total kuantitas kulakan awal</p>
                     </div>
                     <div className="bg-white p-5 md:p-6 rounded-3xl md:rounded-[32px] shadow-sm border border-gray-100 relative overflow-hidden flex flex-col justify-between h-full">
                        <div className="absolute top-0 right-0 p-4 opacity-5"><CreditCard size={60}/></div>
                        <div className="relative z-10 w-full">
                           <p className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-wider mb-1.5 break-normal">Total Modal Keseluruhan</p>
                           <p className="text-lg sm:text-xl xl:text-2xl font-black text-rose-600 tracking-tighter">{formatRupiah(adminData.grandTotalModalAwal)}</p>
                        </div>
                        <p className="text-[10px] md:text-xs font-bold text-slate-500 mt-2 relative z-10">Modal investasi stok awal</p>
                     </div>
                     <div className="bg-white p-5 md:p-6 rounded-3xl md:rounded-[32px] shadow-sm border border-gray-100 relative overflow-hidden flex flex-col justify-between h-full">
                        <div className="absolute top-0 right-0 p-4 opacity-5"><BarChart3 size={60}/></div>
                        <div className="relative z-10 w-full">
                           <p className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-wider mb-1.5 break-normal">Potensi Omset Keseluruhan</p>
                           <p className="text-lg sm:text-xl xl:text-2xl font-black text-blue-600 tracking-tighter">{formatRupiah(adminData.totalOmsetKeseluruhan)}</p>
                        </div>
                        <p className="text-[10px] md:text-xs font-bold text-slate-500 mt-2 relative z-10">Target omset jika laku semua</p>
                     </div>
                     <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-5 md:p-6 rounded-3xl md:rounded-[32px] shadow-sm text-white relative overflow-hidden flex flex-col justify-between h-full">
                        <div className="absolute top-0 right-0 p-4 opacity-10"><Sparkles size={60}/></div>
                        <div className="relative z-10 w-full">
                           <p className="text-[10px] md:text-xs font-black text-emerald-100 uppercase tracking-wider mb-1.5 break-normal">Potensi Profit Keseluruhan</p>
                           <p className="text-lg sm:text-xl xl:text-2xl font-black drop-shadow-sm tracking-tighter">{formatRupiah(adminData.totalProfitKeseluruhan)}</p>
                        </div>
                        <p className="text-[10px] md:text-xs font-bold text-emerald-50 mt-2 relative z-10">Target untung bersih maksimal</p>
                     </div>
                  </div>

                  {/* 2. SECTION: SISA INVENTORI */}
                  <h2 className="text-lg md:text-2xl font-black text-slate-800 mb-5 flex items-center gap-3"><Package className="text-orange-500" size={26}/> 2. Status Saat Ini (Inventori / Sisa Belum Terjual)</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-12">
                     <div className="bg-white p-5 md:p-6 rounded-3xl md:rounded-[32px] shadow-sm border border-gray-100 relative overflow-hidden flex flex-col justify-between h-full">
                        <div className="absolute top-0 right-0 p-4 opacity-5"><List size={60}/></div>
                        <div className="relative z-10 w-full">
                           <p className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-wider mb-1.5 break-normal">Sisa Stok Barang</p>
                           <p className="text-lg sm:text-xl xl:text-2xl font-black text-slate-900 tracking-tighter">{adminData.grandTotalSisaStok} Pcs</p>
                        </div>
                        <p className="text-[10px] md:text-xs font-bold text-slate-500 mt-2 relative z-10">Dari {adminData.totalJenisBarang} jenis item aktif</p>
                     </div>
                     <div className="bg-white p-5 md:p-6 rounded-3xl md:rounded-[32px] shadow-sm border border-gray-100 relative overflow-hidden flex flex-col justify-between h-full">
                        <div className="absolute top-0 right-0 p-4 opacity-5"><Store size={60}/></div>
                        <div className="relative z-10 w-full">
                           <p className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-wider mb-1.5 break-normal">Modal Masih Mengendap</p>
                           <p className="text-lg sm:text-xl xl:text-2xl font-black text-rose-600 tracking-tighter">{formatRupiah(adminData.totalInventoryModal)}</p>
                        </div>
                        <p className="text-[10px] md:text-xs font-bold text-slate-500 mt-2 relative z-10">Uang modal tertahan di sisa stok</p>
                     </div>
                     <div className="bg-white p-5 md:p-6 rounded-3xl md:rounded-[32px] shadow-sm border border-gray-100 relative overflow-hidden flex flex-col justify-between h-full">
                        <div className="absolute top-0 right-0 p-4 opacity-5"><BarChart3 size={60}/></div>
                        <div className="relative z-10 w-full">
                           <p className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-wider mb-1.5 break-normal">Potensi Sisa Omset</p>
                           <p className="text-lg sm:text-xl xl:text-2xl font-black text-blue-600 tracking-tighter">{formatRupiah(adminData.totalInventoryPotentialRevenue)}</p>
                        </div>
                        <p className="text-[10px] md:text-xs font-bold text-slate-500 mt-2 relative z-10">Omset jika sisa stok habis terjual</p>
                     </div>
                     <div className="bg-white p-5 md:p-6 rounded-3xl md:rounded-[32px] shadow-sm border border-gray-100 relative overflow-hidden flex flex-col justify-between h-full">
                        <div className="absolute top-0 right-0 p-4 opacity-5"><Sparkles size={60}/></div>
                        <div className="relative z-10 w-full">
                           <p className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-wider mb-1.5 break-normal">Potensi Sisa Profit</p>
                           <p className="text-lg sm:text-xl xl:text-2xl font-black text-emerald-600 tracking-tighter">{formatRupiah(adminData.grandTotalPotensiSisaProfit)}</p>
                        </div>
                        <p className="text-[10px] md:text-xs font-bold text-slate-500 mt-2 relative z-10">Sisa target keuntungan</p>
                     </div>
                  </div>

                  {/* 3. SECTION: REKAP PENJUALAN (HISTORIS/LAKU) */}
                  <h2 className="text-lg md:text-2xl font-black text-slate-800 mb-5 flex items-center gap-3"><CheckCircle className="text-emerald-500" size={26}/> 3. Performa Realisasi (Sudah Terjual / Laci Kasir)</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-12">
                     <div className="bg-white p-5 md:p-6 rounded-3xl md:rounded-[32px] shadow-sm border border-gray-100 relative overflow-hidden flex flex-col justify-between h-full">
                        <div className="absolute top-0 right-0 p-4 opacity-5"><Package size={60}/></div>
                        <div className="relative z-10 w-full">
                           <p className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-wider mb-1.5 break-normal">Total Barang Laku</p>
                           <p className="text-lg sm:text-xl xl:text-2xl font-black text-slate-900 tracking-tighter">{adminData.totalBarangTerjual} Pcs</p>
                        </div>
                        <p className="text-[10px] md:text-xs font-bold text-slate-500 mt-2 relative z-10">Dari {adminData.filteredTransactions.length} nota transaksi</p>
                     </div>
                     <div className="bg-white p-5 md:p-6 rounded-3xl md:rounded-[32px] shadow-sm border border-gray-100 relative overflow-hidden flex flex-col justify-between h-full">
                        <div className="absolute top-0 right-0 p-4 opacity-5"><Store size={60}/></div>
                        <div className="relative z-10 w-full">
                           <p className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-wider mb-1.5 break-normal">Modal Telah Kembali</p>
                           <p className="text-lg sm:text-xl xl:text-2xl font-black text-blue-600 tracking-tighter">{formatRupiah(adminData.totalModalTerjual)}</p>
                        </div>
                        <p className="text-[10px] md:text-xs font-bold text-slate-500 mt-2 relative z-10">Sesuai historis saat terjual</p>
                     </div>
                     <div className="bg-white p-5 md:p-6 rounded-3xl md:rounded-[32px] shadow-sm border border-gray-100 relative overflow-hidden flex flex-col justify-between h-full">
                        <div className="absolute top-0 right-0 p-4 opacity-5"><TrendingUp size={60}/></div>
                        <div className="relative z-10 w-full">
                           <p className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-wider mb-1.5 break-normal">Omset Masuk Laci</p>
                           <p className="text-lg sm:text-xl xl:text-2xl font-black text-slate-900 tracking-tighter">{formatRupiah(adminData.totalPendapatanKotor)}</p>
                        </div>
                        <p className="text-[10px] md:text-xs font-bold text-slate-500 mt-2 relative z-10">Penjualan kotor nyata</p>
                     </div>
                     <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-5 md:p-6 rounded-3xl md:rounded-[32px] shadow-sm text-white relative overflow-hidden flex flex-col justify-between h-full">
                        <div className="absolute top-0 right-0 p-4 opacity-10"><Sparkles size={60}/></div>
                        <div className="relative z-10 w-full">
                           <p className="text-[10px] md:text-xs font-black text-emerald-100 uppercase tracking-wider mb-1.5 break-normal">Profit Bersih Realisasi</p>
                           <p className="text-lg sm:text-xl xl:text-2xl font-black drop-shadow-sm tracking-tighter">{formatRupiah(adminData.totalKeuntunganBersih)}</p>
                        </div>
                        <p className="text-[10px] md:text-xs font-bold text-emerald-50 mt-2 flex items-center gap-1.5 relative z-10"><TrendingUp size={14}/> Margin Bersih: {adminData.totalPendapatanKotor > 0 ? ((adminData.totalKeuntunganBersih / adminData.totalPendapatanKotor) * 100).toFixed(1) : '0'}%</p>
                     </div>
                  </div>

                  <div className="bg-white rounded-3xl md:rounded-[40px] border border-slate-100 shadow-sm overflow-hidden flex flex-col mb-8 w-full">
                    <div className="p-4 md:p-6 border-b border-slate-100"><h2 className="font-black text-base md:text-xl text-slate-800 flex items-center gap-2"><Package className="text-emerald-500" size={20}/> Rekap Penjualan per Barang (Historis)</h2></div>
                    <div className="overflow-x-auto w-full block">
                      <table className="w-full text-left min-w-[800px] border-collapse">
                         <thead className="bg-slate-50 border-b border-slate-200">
                           <tr className="text-[10px] font-black uppercase text-slate-500 tracking-widest whitespace-nowrap">
                             <th className="p-4 md:p-6">Nama Barang</th>
                             <th className="p-4 md:p-6 text-center">Qty Terjual</th>
                             <th className="p-4 md:p-6 text-center">Profit Satuan</th>
                             <th className="p-4 md:p-6 text-center">Sisa Stok</th>
                             <th className="p-4 md:p-6 text-right">Omset (Terjual)</th>
                             <th className="p-4 md:p-6 text-right">Profit Terjual</th>
                           </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-50">
                           {adminData.productRankings.length === 0 && <tr><td colSpan="6" className="p-6 text-center text-slate-400 font-bold text-xs">Data kosong.</td></tr>}
                           {adminData.productRankings.map((p) => (
                             <tr key={p.id} className="text-xs md:text-sm font-bold hover:bg-slate-50 transition-colors">
                               <td className="p-3 md:p-4 flex items-center gap-3 break-words min-w-[200px]">
                                 <div className="w-10 h-10 rounded-lg border border-slate-200 flex items-center justify-center bg-white shrink-0 overflow-hidden relative">
                                    {p.gambar ? <img loading="lazy" referrerPolicy="no-referrer" src={formatImageUrl(p.gambar)} className="absolute inset-0 w-full h-full object-cover z-10 bg-white" alt="img" onError={(e) => { e.target.onerror=null; e.target.src=FALLBACK_IMAGE; }}/> : <img src={FALLBACK_IMAGE} className="w-4 h-4 opacity-50" alt="kosong"/>}
                                 </div>
                                 <span className="text-slate-700 leading-tight">{p.nama}</span>
                               </td>
                               <td className="p-3 md:p-4 text-center text-emerald-600 font-black whitespace-nowrap">{p.qtyTerjual}</td>
                               <td className="p-3 md:p-4 text-center text-emerald-600 whitespace-nowrap">{formatRupiah(p.jual - p.modal)}</td>
                               <td className="p-3 md:p-4 text-center text-blue-600 font-black whitespace-nowrap">{p.stok}</td>
                               <td className="p-3 md:p-4 text-right text-slate-800 break-words min-w-[120px]">{formatRupiah(p.revenue)}</td>
                               <td className="p-3 md:p-4 text-right text-emerald-700 font-black break-words min-w-[120px]">{formatRupiah(p.profitTerjual)}</td>
                             </tr>
                           ))}
                         </tbody>
                      </table>
                    </div>
                  </div>
                  
                  <div className="grid lg:grid-cols-2 gap-6 mb-8 w-full">
                      <div className="bg-white rounded-3xl md:rounded-[40px] border border-slate-100 shadow-sm overflow-hidden flex flex-col w-full">
                        <div className="p-4 md:p-6 border-b border-slate-100"><h2 className="font-black text-base md:text-xl text-slate-800 flex items-center gap-2"><TrendingUp className="text-orange-500" size={20}/> 10 Barang Paling Laku</h2></div>
                        <div className="overflow-x-auto w-full block">
                          <table className="w-full text-left min-w-[300px] border-collapse">
                             <tbody className="divide-y divide-slate-50">
                               {adminData.topSelling.length === 0 && <tr><td className="p-6 text-center text-slate-400 font-bold text-xs">Kosong.</td></tr>}
                               {adminData.topSelling.map((p, idx) => (
                                 <tr key={p.id} className="text-xs md:text-sm font-bold"><td className="p-3 flex items-center gap-2 break-words"><span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] ${idx < 3 ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'}`}>{idx + 1}</span><span className="text-slate-700 leading-tight">{p.nama}</span></td><td className="p-3 text-right whitespace-nowrap"><span className="px-2 py-1 rounded bg-emerald-100 text-emerald-700 text-[10px]">{p.qtyTerjual} terjual</span></td></tr>
                               ))}
                             </tbody>
                          </table>
                        </div>
                      </div>
                      <div className="bg-white rounded-3xl md:rounded-[40px] border border-slate-100 shadow-sm overflow-hidden flex flex-col w-full">
                        <div className="p-4 md:p-6 border-b border-slate-100"><h2 className="font-black text-base md:text-xl text-slate-800 flex items-center gap-2"><TrendingDown className="text-red-500" size={20}/> Perhatian: Kurang Laku</h2></div>
                        <div className="overflow-x-auto w-full block">
                          <table className="w-full text-left min-w-[300px] border-collapse">
                             <tbody className="divide-y divide-slate-50">
                               {adminData.bottomSelling.length === 0 && <tr><td className="p-6 text-center text-slate-400 font-bold text-xs">Semua laku!</td></tr>}
                               {adminData.bottomSelling.map((item, idx) => (
                                 <tr key={idx} className="text-xs md:text-sm font-bold"><td className="p-3 text-slate-700 break-words leading-tight">{item.nama}</td><td className="p-3 text-center text-red-500 whitespace-nowrap">{item.qtyTerjual} terjual</td><td className="p-3 text-right text-[10px] text-slate-400 whitespace-nowrap">Nganggur {item.daysActive}h</td></tr>
                               ))}
                             </tbody>
                          </table>
                        </div>
                      </div>
                  </div>
                  <div className="bg-white rounded-3xl md:rounded-[32px] shadow-sm border border-gray-100 p-4 md:p-8 w-full">
                    <div className="flex flex-col md:flex-row justify-between md:items-center mb-4 gap-3">
                      <h2 className="font-black text-base md:text-lg flex items-center gap-2 text-slate-900"><List className="text-blue-500" size={20}/> Riwayat Transaksi Lengkap</h2>
                      <select value={sortTrx} onChange={e => setSortTrx(e.target.value)} className="bg-slate-50 px-3 py-2 rounded-xl text-xs font-bold outline-none text-slate-700 border border-slate-200">
                         <option value="terbaru">Paling Baru</option><option value="terlama">Paling Lama</option><option value="terbesar">Nominal Terbesar</option><option value="terkecil">Nominal Terkecil</option>
                      </select>
                    </div>
                    <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 w-full block">
                      {adminData.sortedTransactions.length === 0 ? <p className="text-gray-400 text-xs font-bold text-center py-10">Belum ada transaksi.</p> : adminData.sortedTransactions.map(t => (
                        <div key={t.id} className="border border-gray-200 rounded-2xl p-4 bg-gray-50/50">
                          <div className="flex justify-between items-center text-[10px] md:text-xs mb-2 pb-2 border-b border-gray-200"><span className="font-mono font-bold text-slate-500">{t.id} • {t.tanggal}</span><span className="font-black px-2 py-0.5 rounded uppercase bg-slate-200 text-slate-600">{t.metode}</span></div>
                          <div className="space-y-1 mb-2">{t.items.map((i, idx) => (<div key={idx} className="text-[10px] md:text-xs flex justify-between text-slate-700 font-bold"><span className="break-words pr-2 leading-tight">{i.qty}x {i.nama}</span><span className="text-slate-900 shrink-0 whitespace-nowrap">{formatRupiah(i.totalHarga)}</span></div>))}</div>
                          <div className="flex flex-col sm:flex-row justify-between sm:items-end mt-2 pt-2 border-t border-gray-200 gap-3">
                            <div className="flex items-center gap-2 w-full sm:w-auto">
                               <button onClick={() => setEditingTrx(t)} className="flex-1 sm:flex-none flex items-center justify-center gap-1 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-[10px] font-bold"><Edit size={14}/> Edit</button>
                               <button onClick={() => handleDeleteSingleTransaction(t.id)} className="flex-1 sm:flex-none flex items-center justify-center gap-1 px-3 py-2 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 transition-colors text-[10px] font-bold"><Trash2 size={14}/> Batal & Kembalikan Stok</button>
                            </div>
                            <div className="flex justify-between sm:justify-end items-end gap-3 w-full sm:w-auto"><span className="text-[9px] uppercase font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100 whitespace-nowrap">Untung {formatRupiah(t.profit)}</span><span className="font-black text-base md:text-xl text-slate-900 whitespace-nowrap">{formatRupiah(t.total)}</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
               </div>
             )}

             {/* TAB BARANG */}
             {adminTab === 'barang' && (
               <div className="animate-fade-in max-w-7xl mx-auto w-full pb-10">
                  <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4">
                    <h1 className="text-3xl font-black tracking-tighter text-slate-800">Manajemen Barang</h1>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button onClick={handleClearAllProducts} disabled={isProcessing} className="bg-rose-100 text-rose-600 px-4 py-3 rounded-xl font-black flex items-center justify-center gap-2 shadow-sm hover:bg-rose-200 active:scale-95 transition-all uppercase text-xs w-full sm:w-auto"><Trash2 size={16}/> Hapus Semua</button>
                      <button onClick={() => { setEditingId(null); setNewProduct({ nama: '', modal: 0, jual: 0, stok: 0, barcode: '', diskonQty: '', diskonHarga: '', gambar: '' }); setUseDiskon(false); setShowAddForm(!showAddForm); }} className="bg-emerald-600 text-white px-4 py-3 rounded-xl font-black flex items-center justify-center gap-2 shadow-md hover:bg-emerald-500 active:scale-95 transition-all uppercase text-xs w-full sm:w-auto">{showAddForm ? <X size={16}/> : <PlusCircle size={16}/>} {showAddForm ? 'Tutup Form' : 'Tambah Barang'}</button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
                      <div className="bg-white p-5 md:p-6 rounded-3xl md:rounded-[32px] shadow-sm border border-slate-100 flex flex-col justify-between h-full relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-5"><Store size={60}/></div>
                        <div className="relative z-10 w-full">
                          <span className="text-slate-400 text-[10px] md:text-xs font-black uppercase tracking-wider mb-1.5 break-words block">Total Produk</span>
                          <span className="text-lg sm:text-xl xl:text-2xl font-extrabold text-slate-800 block break-words whitespace-normal tracking-tighter">{adminData.totalJenisBarang} Item</span>
                        </div>
                      </div>
                      <div className="bg-white p-5 md:p-6 rounded-3xl md:rounded-[32px] shadow-sm border border-slate-100 flex flex-col justify-between h-full relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-5"><List size={60}/></div>
                        <div className="relative z-10 w-full">
                          <span className="text-slate-400 text-[10px] md:text-xs font-black uppercase tracking-wider mb-1.5 break-words block">Total Stok Awal</span>
                          <span className="text-lg sm:text-xl xl:text-2xl font-extrabold text-blue-600 block break-words whitespace-normal tracking-tighter">{adminData.grandTotalStokAwal} Pcs</span>
                        </div>
                        <div className="text-[10px] md:text-xs font-bold text-slate-500 mt-2 relative z-10 break-words">Sisa + Terjual</div>
                      </div>
                      <div className="bg-white p-5 md:p-6 rounded-3xl md:rounded-[32px] shadow-sm border border-slate-100 flex flex-col justify-between h-full relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-5"><CreditCard size={60}/></div>
                        <div className="relative z-10 w-full">
                          <span className="text-slate-400 text-[10px] md:text-xs font-black uppercase tracking-wider mb-1.5 break-words block">Total Modal Awal</span>
                          <span className="text-lg sm:text-xl xl:text-2xl font-extrabold text-rose-600 block break-words whitespace-normal tracking-tighter">{formatRupiah(adminData.grandTotalModalAwal)}</span>
                        </div>
                        <div className="text-[10px] md:text-xs font-bold text-slate-500 mt-2 relative z-10 break-words">Stok Awal x Harga Modal</div>
                      </div>
                      <div className="bg-white p-5 md:p-6 rounded-3xl md:rounded-[32px] shadow-sm border border-slate-100 flex flex-col justify-between h-full relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-5"><Sparkles size={60}/></div>
                        <div className="relative z-10 w-full">
                          <span className="text-slate-400 text-[10px] md:text-xs font-black uppercase tracking-wider mb-1.5 break-words block">Potensi Sisa Profit</span>
                          <span className="text-lg sm:text-xl xl:text-2xl font-extrabold text-emerald-600 block break-words whitespace-normal tracking-tighter">{formatRupiah(adminData.grandTotalPotensiSisaProfit)}</span>
                        </div>
                        <div className="text-[10px] md:text-xs font-bold text-slate-500 mt-2 relative z-10 break-words">Jika sisa stok habis terjual</div>
                      </div>
                  </div>

                  {showAddForm && (
                    <form onSubmit={handleAddProduct} className={`p-5 md:p-8 rounded-3xl md:rounded-[40px] border shadow-sm mb-8 grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6 animate-slide-up ${editingId ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200'}`}>
                       <div className="md:col-span-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-slate-200 pb-3 mb-1"><h3 className="font-black text-slate-800 text-lg flex items-center gap-2">{editingId ? <><Edit className="text-blue-600" size={20}/> Edit Data Barang</> : <><PlusCircle className="text-emerald-600" size={20}/> Input Barang Baru</>}</h3></div>
                       <div className="md:col-span-4 flex flex-col md:flex-row gap-4 md:gap-6 bg-slate-50 p-4 md:p-6 rounded-2xl border border-slate-200">
                         <div className="w-full md:w-32 h-32 bg-white rounded-2xl border-2 border-dashed border-emerald-300 flex items-center justify-center shrink-0 overflow-hidden shadow-sm relative">
                           {newProduct.gambar ? <img src={formatImageUrl(newProduct.gambar)} className="w-full h-full object-cover" alt="Preview" onError={(e) => { e.target.onerror=null; e.target.src=FALLBACK_IMAGE; }}/> : <img src={FALLBACK_IMAGE} className="w-16 h-16 opacity-50" alt="kosong"/>}
                         </div>
                         <div className="flex-1 space-y-3">
                           <p className="text-[9px] md:text-[10px] font-black uppercase text-slate-500 tracking-widest">Gambar Produk (Pilih Kamera HP)</p>
                           <div className="flex flex-col gap-2">
                             <div className="flex flex-wrap gap-2">
                               <button type="button" onClick={handleGenerateGeminiImage} disabled={isProcessing} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 text-white px-3 py-2 rounded-lg font-bold text-[10px] md:text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50"><Sparkles size={14}/> Generate AI</button>
                               <label className="bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 px-3 py-2 rounded-lg font-bold text-[10px] md:text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"><Camera size={14}/> Kamera / Upload <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleUploadProductImage} /></label>
                               {newProduct.gambar && newProduct.gambar.startsWith('data:image') && <button type="button" onClick={handleEnhanceWithAI} disabled={isProcessing} className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200 px-3 py-2 rounded-lg font-bold text-[10px] active:scale-95 disabled:opacity-50"><Wand2 size={14}/> Rapihkan AI</button>}
                             </div>
                             <div className="bg-blue-50 border border-blue-100 rounded-lg p-2 flex items-center justify-between gap-2 mt-1">
                                <span className="text-[9px] font-bold text-blue-700 w-[60%] leading-tight truncate">Paste Link Google Drive di bawah</span>
                                <a href="https://drive.google.com/drive/folders/1KbB_QVH_TclNJkQSziFJ7VTGbOo_oA0r?hl=ID" target="_blank" rel="noreferrer" className="bg-blue-600 text-white px-2 py-1.5 rounded font-black text-[9px] flex items-center gap-1 hover:bg-blue-700 shrink-0"><ExternalLink size={12}/> Buka Folder</a>
                             </div>
                             <input type="text" placeholder="Paste Link Gambar / Google Drive disini..." value={newProduct.gambar || ''} onChange={e => setNewProduct({...newProduct, gambar: e.target.value})} className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-xs focus:ring-2 focus:ring-emerald-500 outline-none font-semibold text-slate-700 shadow-sm"/>
                           </div>
                         </div>
                       </div>
                       <div className="md:col-span-2">
                         <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Nama Produk</label>
                         <input required value={newProduct.nama} onChange={e => setNewProduct({...newProduct, nama: e.target.value})} className="w-full p-3 bg-white rounded-xl font-bold border border-slate-200 outline-none text-sm"/>
                       </div>
                       <div className="md:col-span-2">
                         <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Barcode</label>
                         <div className="flex gap-2">
                           <input value={newProduct.barcode} onChange={e => setNewProduct({...newProduct, barcode: e.target.value})} className="w-full p-3 bg-white rounded-xl font-bold border border-slate-200 outline-none text-sm" placeholder="Ketik/Scan"/>
                           <button type="button" onClick={() => { setScanTarget('admin'); setIsScanningModalOpen(true); }} className="bg-slate-900 text-white p-3 rounded-xl"><Camera size={20}/></button>
                         </div>
                       </div>
                       <div className="md:col-span-2">
                         <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Harga Modal</label>
                         <input required type="number" value={newProduct.modal} onChange={e => setNewProduct({...newProduct, modal: parseInt(e.target.value)})} className="w-full p-3 bg-white rounded-xl font-bold border border-slate-200 outline-none text-sm"/>
                       </div>
                       <div className="md:col-span-1">
                         <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Harga Jual</label>
                         <input required type="number" value={newProduct.jual} onChange={e => setNewProduct({...newProduct, jual: parseInt(e.target.value)})} className="w-full p-3 bg-white rounded-xl font-bold border border-slate-200 outline-none text-sm"/>
                       </div>
                       <div className="md:col-span-1">
                         <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Stok (Sisa Hari Ini)</label>
                         <input required type="number" value={newProduct.stok} onChange={e => setNewProduct({...newProduct, stok: parseInt(e.target.value)})} className="w-full p-3 bg-white rounded-xl font-bold border border-slate-200 outline-none text-sm"/>
                       </div>
                       <div className="flex items-center gap-2 pt-1 ml-1 md:col-span-4">
                         <input type="checkbox" checked={useDiskon} onChange={e => setUseDiskon(e.target.checked)} className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"/>
                         <span className="font-black text-[10px] text-slate-600 uppercase tracking-widest cursor-pointer" onClick={() => setUseDiskon(!useDiskon)}>Aktifkan Harga Grosir?</span>
                       </div>
                       {useDiskon && (
                         <div className="flex flex-col md:flex-row gap-3 md:col-span-4 animate-fade-in bg-orange-50 p-4 rounded-2xl border border-orange-200">
                           <div className="w-full md:w-1/2">
                             <label className="text-[9px] font-black uppercase text-orange-700 mb-1 block tracking-widest ml-1">Minimal Beli (Qty)</label>
                             <input type="number" value={newProduct.diskonQty} onChange={e => setNewProduct({...newProduct, diskonQty: e.target.value})} className="w-full p-3 bg-white rounded-xl border border-orange-100 font-bold text-orange-900 focus:ring-2 outline-none text-sm"/>
                           </div>
                           <div className="w-full md:w-1/2">
                             <label className="text-[9px] font-black uppercase text-orange-700 mb-1 block tracking-widest ml-1">Total Harga Grosir (Bukan Satuan)</label>
                             <input type="number" value={newProduct.diskonHarga} onChange={e => setNewProduct({...newProduct, diskonHarga: e.target.value})} className="w-full p-3 bg-white rounded-xl border border-orange-100 font-bold text-orange-900 focus:ring-2 outline-none text-sm"/>
                           </div>
                         </div>
                       )}
                       <button disabled={isProcessing} className={`text-white py-4 rounded-2xl font-black text-sm md:text-base md:col-span-4 mt-2 transition-all active:scale-[0.98] shadow-xl disabled:opacity-50 ${editingId ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-200' : 'bg-slate-900 hover:bg-slate-800'}`}>{isProcessing ? 'MENYIMPAN...' : (editingId ? 'UPDATE BARANG SEKARANG' : 'SIMPAN BARANG BARU')}</button>
                    </form>
                 )}
                 <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden w-full">
                    <div className="overflow-x-auto w-full block">
                      <table className="w-full text-left min-w-[800px] border-collapse">
                         <thead className="bg-slate-50 border-b border-slate-200">
                           <tr className="text-[10px] font-black uppercase text-slate-500 tracking-widest whitespace-nowrap">
                             <th className="p-4 md:p-6">Produk</th>
                             <th className="p-4 md:p-6 text-center">Stok & Histori</th>
                             <th className="p-4 md:p-6">Info Harga</th>
                             <th className="p-4 md:p-6">Total Modal & Potensi</th>
                             <th className="p-4 md:p-6 text-center">Aksi (CRUD)</th>
                           </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-100">
                           {adminData.inventoryList.length === 0 && <tr><td colSpan="5" className="p-10 text-center text-slate-400 font-bold text-sm">Barang masih kosong.</td></tr>}
                           {adminData.inventoryList.map(p => (
                             <tr key={p.id} className={`transition-colors ${editingId === p.id ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}>
                               <td className="p-4 md:p-6 flex items-center gap-3 md:gap-4 break-words min-w-[200px]">
                                 <div className="w-12 h-12 md:w-16 md:h-16 bg-slate-50 rounded-xl md:rounded-2xl border shadow-sm flex items-center justify-center shrink-0 overflow-hidden relative">
                                   {p.gambar ? <img loading="lazy" referrerPolicy="no-referrer" src={formatImageUrl(p.gambar)} className="absolute inset-0 w-full h-full object-cover z-10 bg-white" onError={(e) => { e.target.onerror=null; e.target.src=FALLBACK_IMAGE; }}/> : <img src={FALLBACK_IMAGE} className="w-6 h-6 opacity-50" alt="kosong"/>}
                                 </div>
                                 <div className="min-w-0 flex-1">
                                   <span className="font-extrabold text-sm md:text-base text-slate-900 block leading-tight">{p.nama}</span>
                                   {p.barcode ? <span className="font-mono text-[9px] md:text-[10px] text-slate-500 mt-1 uppercase tracking-widest flex items-center gap-1"><Barcode size={10}/> {p.barcode}</span> : <span className="text-[9px] text-slate-400 mt-1 italic">No Barcode</span>}
                                 </div>
                               </td>
                               <td className="p-4 md:p-6 text-center whitespace-nowrap">
                                  <span className={`px-3 py-1 md:px-4 md:py-2 rounded-lg md:rounded-xl text-[10px] md:text-xs font-black tracking-widest uppercase ${p.stok > 10 ? 'bg-emerald-100 text-emerald-800' : p.stok > 0 ? 'bg-orange-100 text-orange-800' : 'bg-rose-100 text-rose-800'}`}>Sisa: {p.stok}</span>
                                  <div className="text-[10px] md:text-xs font-bold text-slate-500 mt-2">Terjual: {p.qtyTerjual}</div>
                                  <div className="text-[10px] md:text-xs font-bold text-blue-600 mt-0.5">Total Awal: {p.stokAwal}</div>
                               </td>
                               <td className="p-4 md:p-6 min-w-[150px] break-words">
                                  <div className="font-black text-sm md:text-base text-emerald-700">Jual: {formatRupiah(p.jual)}</div>
                                  <div className="text-[10px] md:text-xs font-bold text-slate-500 mt-0.5 md:mt-1">Modal: {formatRupiah(p.modal)}</div>
                                  {p.diskon && <div className="text-[9px] text-orange-700 font-black bg-orange-100 px-1.5 py-0.5 rounded md:rounded-lg w-max mt-1 border border-orange-200">GROSIR: {p.diskon.min_qty} = {formatRupiah(p.diskon.harga_total)}</div>}
                               </td>
                               <td className="p-4 md:p-6 min-w-[180px] break-words">
                                  <div className="text-xs md:text-sm font-extrabold text-rose-600 mb-1 leading-tight" title="Total Stok Awal x Modal">Modal Awal:<br/>{formatRupiah(p.modalTotalAwal)}</div>
                                  <div className="text-[10px] md:text-xs font-bold text-emerald-600 mb-1 leading-tight" title="Potensi Sisa Profit (Sisa Stok x Untung)">Potensi Profit:<br/>{formatRupiah(p.potensiSisaProfit)}</div>
                                  <div className="text-[9px] font-bold text-slate-500 inline-block bg-slate-100 px-2 py-0.5 rounded">Margin: {p.jual > 0 ? ((((p.jual||0) - (p.modal||0))/(p.jual||1))*100).toFixed(1) : '0'}%</div>
                               </td>
                               <td className="p-4 md:p-6 text-center whitespace-nowrap">
                                 <div className="flex items-center justify-center gap-2">
                                   <button onClick={() => handleEditClick(p)} className="p-2 md:p-3 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-xl md:rounded-2xl transition-colors shadow-sm"><Edit size={18}/></button>
                                   <button onClick={() => handleDeleteProduct(p.id)} disabled={isProcessing} className="p-2 md:p-3 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white rounded-xl md:rounded-2xl transition-colors shadow-sm disabled:opacity-50"><Trash2 size={18}/></button>
                                 </div>
                               </td>
                             </tr>
                           ))}
                         </tbody>
                         <tfoot className="bg-slate-100 border-t-2 border-slate-200">
                           <tr>
                             <td className="p-4 md:p-6 text-right font-black text-slate-600 uppercase tracking-widest text-[10px] md:text-xs">TOTAL KESELURUHAN</td>
                             <td className="p-4 md:p-6 text-center">
                               <div className="font-black text-slate-800 text-sm md:text-base">Awal: {adminData.grandTotalStokAwal}</div>
                               <div className="font-bold text-blue-600 text-xs md:text-sm mt-0.5">Sisa: {adminData.grandTotalSisaStok}</div>
                             </td>
                             <td className="p-4 md:p-6 text-center font-black text-slate-500">-</td>
                             <td className="p-4 md:p-6 break-words">
                                <div className="text-sm md:text-base font-extrabold text-rose-700 mb-1 leading-tight">Total Modal:<br/>{formatRupiah(adminData.grandTotalModalAwal)}</div>
                                <div className="text-xs md:text-sm font-extrabold text-emerald-700 leading-tight">Total Potensi:<br/>{formatRupiah(adminData.grandTotalPotensiSisaProfit)}</div>
                             </td>
                             <td className="p-4 md:p-6"></td>
                           </tr>
                         </tfoot>
                       </table>
                    </div>
                 </div>
              </div>
             )}
          </main>
        </div>
      )}
    </div>
  );
}

export default class App extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, errorInfo: null }; }
  static getDerivedStateFromError(error) { return { hasError: true }; }
  componentDidCatch(error, errorInfo) { this.setState({ errorInfo: String(error) + '\n' + errorInfo.componentStack }); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', background: '#f87171', color: 'white', minHeight: '100vh', fontFamily: 'sans-serif' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: '900' }}>⚠️ Aplikasi Mengalami Crash Server (V3.5 Locked Blueprint)</h1>
          <p style={{ marginTop: '10px', fontSize: '1.2rem' }}>Layar putih berhasil dihindari! Masalahnya ada pada kode di bawah ini:</p>
          <pre style={{ background: 'rgba(0,0,0,0.3)', padding: '20px', borderRadius: '10px', marginTop: '20px', whiteSpace: 'pre-wrap', fontWeight: 'bold' }}>{String(this.state.errorInfo)}</pre>
          <button onClick={() => { localStorage.clear(); window.location.reload(true); }} style={{ marginTop: '20px', padding: '10px 20px', borderRadius: '10px', border: 'none', background: 'white', color: '#f87171', fontWeight: 'bold', cursor: 'pointer' }}>Hapus Cache & Muat Ulang</button>
        </div>
      );
    }
    return <MainApp />;
  }
}

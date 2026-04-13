import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Coffee, Utensils, Package, IceCream, Droplet, Candy, 
  CheckCircle, Settings, BarChart3, PlusCircle, 
  Store, QrCode, CreditCard, ChevronRight, ArrowLeft,
  Search, X, Lock, LogOut, TrendingUp, Edit, Trash2, List, TrendingDown,
  Fish, Carrot, Apple, Beef, Soup, Cookie, Pill, Sparkles, Flame, ShoppingBasket, Camera, Download, Power, UploadCloud,
  AlertTriangle, Copy
} from 'lucide-react';

// =========================================================================
// PENGATURAN KONEKSI SUPABASE (DYNAMIC SCRIPT - BEBAS ERROR BUILD)
// =========================================================================
let supabaseClient = null;

// --- LOGIKA BANTUAN ---
const formatRupiah = (angka) => {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka || 0);
};

const formatImageUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('data:image') || url.startsWith('blob:')) return url; 
  const driveMatch = url.match(/(?:file\/d\/|id=)([a-zA-Z0-9_-]+)/);
  if (driveMatch && driveMatch[1]) return `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
  if (url.includes('github.com') && url.includes('/blob/')) return url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
  return url;
};

const getDynamicIcon = (namaBarang) => {
  const name = (namaBarang || '').toLowerCase();
  if (name.match(/kopi|minum|teh|coca|susu/)) return <Coffee className="w-10 h-10 text-amber-700" />;
  if (name.match(/air|mineral|aqua|le minerale/)) return <Droplet className="w-10 h-10 text-blue-500" />;
  if (name.match(/nasi|mie|roti|makan|lontong/)) return <Utensils className="w-10 h-10 text-orange-600" />;
  if (name.match(/daging|sapi|ayam|kambing/)) return <Beef className="w-10 h-10 text-rose-700" />;
  if (name.match(/ikan|lele|nila|udang/)) return <Fish className="w-10 h-10 text-sky-500" />;
  if (name.match(/sayur|bayam|kangkung|wortel|tomat/)) return <Carrot className="w-10 h-10 text-orange-500" />;
  if (name.match(/buah|apel|jeruk|pisang|mangga/)) return <Apple className="w-10 h-10 text-red-500" />;
  if (name.match(/terasi|garam|gula|merica|micin|bumbu|kecap|saus/)) return <Soup className="w-10 h-10 text-amber-800" />;
  if (name.match(/es|ice|krim/)) return <IceCream className="w-10 h-10 text-pink-500" />;
  if (name.match(/permen|candy|yupi/)) return <Candy className="w-10 h-10 text-purple-500" />;
  if (name.match(/snack|chiki|keripik|biskuit|kue/)) return <Cookie className="w-10 h-10 text-yellow-600" />;
  if (name.match(/obat|panadol|paramex|bodrex/)) return <Pill className="w-10 h-10 text-red-600" />;
  if (name.match(/sabun|shampo|rinso|sunlight|cuci|odol|pasta gigi|deterjen/)) return <Sparkles className="w-10 h-10 text-teal-400" />;
  if (name.match(/rokok|korek|mancis/)) return <Flame className="w-10 h-10 text-orange-500" />;
  return <ShoppingBasket className="w-10 h-10 text-slate-800" />;
};

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
  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState({ show: false, msg: '', type: 'success' });
  
  const [view, setView] = useState(() => {
    try { if (typeof window !== 'undefined') return localStorage.getItem('tokojujur_view') || 'toko'; } catch(e) {}
    return 'toko';
  }); 
  
  const [products, setProducts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [settings, setSettings] = useState({ 
    nama_toko: 'Memuat Toko...', qris_url: '', rekening: '', admin_password: '' 
  });
  
  const [cart, setCart] = useState({});
  const [metodeBayar, setMetodeBayar] = useState(null); 
  const [strukTerakhir, setStrukTerakhir] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [tempQty, setTempQty] = useState(0);

  // STATE LIVE SCANNER CANGGIH
  const [isScanningModalOpen, setIsScanningModalOpen] = useState(false);
  const [scanTarget, setScanTarget] = useState(''); 
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [isAdminLogged, setIsAdminLogged] = useState(() => {
    try { return typeof window !== 'undefined' && localStorage.getItem('tokojujur_admin') === 'true'; } catch(e) { return false; }
  });
  const [adminTab, setAdminTab] = useState(() => {
    try { if (typeof window !== 'undefined') return localStorage.getItem('tokojujur_admintab') || 'analisa'; } catch(e){}
    return 'analisa';
  }); 
  const [loginInput, setLoginInput] = useState('');
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null); 
  const [newProduct, setNewProduct] = useState({ nama: '', modal: 0, jual: 0, stok: 0, barcode: '', diskonQty: '', diskonHarga: '' });
  const [useDiskon, setUseDiskon] = useState(false);

  const showToast = (msg, type = 'success') => {
    setToast({ show: true, msg: String(msg), type });
    setTimeout(() => setToast({ show: false, msg: '', type: 'success' }), 4500); 
  };

  // SYSTEM PWA & NOTIFIKASI & FAVICON
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') Notification.requestPermission();
      let link = document.querySelector("link[rel~='icon']");
      if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
      link.href = "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🏪</text></svg>";
      if (!document.querySelector('link[rel="manifest"]')) {
        const manifest = {
          name: "Toko Kejujuran", short_name: "Toko", display: "standalone", background_color: "#f8fafc", theme_color: "#059669",
          icons: [{ src: "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🏪</text></svg>", sizes: "192x192", type: "image/svg+xml", purpose: "any maskable" }]
        };
        const blob = new Blob([JSON.stringify(manifest)], {type: 'application/json'});
        const manifestLink = document.createElement('link'); manifestLink.rel = 'manifest'; manifestLink.href = URL.createObjectURL(blob); document.head.appendChild(manifestLink);
      }
    }
  }, []);

  useEffect(() => { try { localStorage.setItem('tokojujur_view', view); } catch(e){} }, [view]);
  useEffect(() => { try { localStorage.setItem('tokojujur_admintab', adminTab); } catch(e){} }, [adminTab]);

  // INISIALISASI SUPABASE KLIEN (AMAN & DINAMIS)
  useEffect(() => {
    const initSupabase = () => {
      try {
        const env = typeof import.meta !== 'undefined' ? import.meta.env : {};
        const url = env.VITE_SUPABASE_URL || '';
        const key = env.VITE_SUPABASE_ANON_KEY || '';
        if (url && key && window.supabase && !supabaseClient) {
          supabaseClient = window.supabase.createClient(url, key);
        }
      } catch(e) {}
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

  // =========================================================================
  // REALTIME INSTAN (SEKEJAP MATA) - DIRECT PAYLOAD INJECTION
  // =========================================================================
  useEffect(() => {
    if (!dbReady) return;
    if (!supabaseClient) { setIsLoadingDB(false); return; }
    
    // Load awal
    const loadInitialData = async () => {
      setIsLoadingDB(true);
      const [prodRes, trxRes, setRes] = await Promise.all([
        supabaseClient.from('produk').select('*').order('id', { ascending: true }),
        supabaseClient.from('transaksi').select('*').order('id', { ascending: false }),
        supabaseClient.from('pengaturan').select('*').eq('id', 1).single()
      ]);
      if (prodRes.data) setProducts(prodRes.data);
      if (trxRes.data) setTransactions(trxRes.data);
      if (setRes.data) setSettings(setRes.data);
      setIsLoadingDB(false);
    };
    loadInitialData();

    // Subscribe Realtime Langsung Ubah State Tanpa Fetch Ulang!
    const channel = supabaseClient.channel('toko-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'produk' }, (payload) => {
        setProducts(prev => {
          if (prev.some(p => p.id === payload.new.id)) return prev; // Hindari duplikat jika device ini yg kirim
          return [...prev, payload.new];
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'produk' }, (payload) => {
        setProducts(prev => prev.map(p => p.id === payload.new.id ? payload.new : p));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'produk' }, (payload) => {
        setProducts(prev => prev.filter(p => p.id !== payload.old.id));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transaksi' }, (payload) => {
        setTransactions(prev => {
          if (prev.some(t => t.id === payload.new.id)) return prev;
          return [payload.new, ...prev]; // Tambah ke paling atas
        });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'transaksi' }, (payload) => {
        // Jika trx dihapus (saat clear history)
        setTransactions(prev => prev.filter(t => t.id !== payload.old.id));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pengaturan' }, (payload) => {
        setSettings(payload.new);
      })
      .subscribe();
      
    return () => { supabaseClient.removeChannel(channel); }
  }, [dbReady]);

  // =========================================================================
  // LOGIKA LIVE BARCODE SCANNER (AUTO-FOCUS & HD)
  // =========================================================================
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
      showToast('Akses kamera ditolak atau perangkat tidak mendukung.', 'error');
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
      showToast('Barang belum terdaftar di toko', 'error');
    }
  };

  const handleBarcodeResultAdmin = async (code) => {
    setNewProduct(prev => ({ ...prev, barcode: code }));
    showToast('Barcode Terbaca! Mencari di internet...', 'success');
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`);
      const data = await res.json();
      if (data.status === 1 && data.product && data.product.product_name) {
        setNewProduct(prev => ({ ...prev, nama: data.product.product_name }));
        showToast('Nama otomatis berhasil terisi!', 'success');
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
              stopScanner();
              if (scanTarget === 'toko') handleBarcodeResultToko(code);
              else handleBarcodeResultAdmin(code);
            }
          } catch (e) {}
        }
      }, 300); // 300ms super cepat
    }
    return () => clearInterval(interval);
  }, [isScanningModalOpen, scanTarget, products]);

  // =========================================================================
  // LOGIKA KERANJANG
  // =========================================================================
  const openProductModal = (product) => {
    setSelectedProduct(product);
    setTempQty(cart[product.id] || 0);
  };

  const saveToCart = () => {
    if (tempQty === 0) {
      const newCart = { ...cart };
      delete newCart[selectedProduct.id];
      setCart(newCart);
    } else {
      setCart({ ...cart, [selectedProduct.id]: tempQty });
    }
    setSelectedProduct(null);
  };

  const totalBelanja = useMemo(() => {
    return Object.entries(cart).reduce((total, [id, qty]) => {
      const p = products.find(prod => prod.id === parseInt(id));
      return total + (p ? hitungTotalHargaItem(p, qty) : 0);
    }, 0);
  }, [cart, products]);

  const jumlahItem = Object.values(cart).reduce((a, b) => a + b, 0);

  // =========================================================================
  // TRANSAKSI SEKEJAP MATA (OPTIMISTIC + SUPABASE INSERT)
  // =========================================================================
  const handleSelesaiBayar = async () => {
    if (!supabaseClient) return showToast('Koneksi Database Terputus!', 'error');
    setIsProcessing(true);

    const detailPesanan = Object.entries(cart).map(([id, qty]) => {
      const p = products.find(prod => prod.id === parseInt(id));
      const subTotal = hitungTotalHargaItem(p, qty);
      return { 
        id: p.id, nama: p.nama, modal: p.modal || 0, jual: p.jual || 0, 
        qty, totalHarga: subTotal, profitItem: subTotal - ((p.modal || 0) * qty) 
      };
    });
    
    const totalModal = detailPesanan.reduce((s, i) => s + (i.modal * i.qty), 0);
    const newTransaction = { 
      id: `TRX-${Date.now()}`, 
      tanggal: new Date().toLocaleString('id-ID'), 
      items: detailPesanan, 
      total: totalBelanja, 
      modal: totalModal, 
      profit: totalBelanja - totalModal, 
      metode: metodeBayar 
    };

    // OPTIMISTIC UI: Langsung ubah layar sebelum tunggu server agar sekejap mata
    setTransactions(prev => [newTransaction, ...prev]);
    setProducts(prev => prev.map(prod => {
      const boughtItem = detailPesanan.find(i => i.id === prod.id);
      return boughtItem ? { ...prod, stok: (prod.stok || 0) - boughtItem.qty } : prod;
    }));
    
    setStrukTerakhir(newTransaction);
    setView('struk');
    setCart({});
    setIsProcessing(false);

    // BACKGROUND SYNC KE SERVER
    const { error: trxError } = await supabaseClient.from('transaksi').insert([newTransaction]);
    if (trxError) {
       showToast(`Data gagal masuk ke server. Peringatan: ${trxError.message}`, 'error');
       // Realtime rollback is complex, but the error toast alerts the admin.
    }
    
    // Update stok satu per satu di background
    for (const item of detailPesanan) {
      const prod = products.find(p => p.id === item.id);
      if (prod) {
        await supabaseClient.from('produk').update({ stok: (prod.stok || 0) - item.qty }).eq('id', item.id);
      }
    }
  };

  const handleTutupStruk = () => {
    setCart({});
    setMetodeBayar(null);
    setStrukTerakhir(null);
    setView('toko');
  };

  const handleExitApp = () => {
    if (window.confirm('Keluar dari aplikasi Toko Kejujuran?')) {
      try { window.close(); } catch (e) {}
      setTimeout(() => {
        showToast('Tutup tab/browser Anda secara manual jika jendela tidak menutup.', 'success');
        setCart({});
        setView('toko');
        setIsAdminLogged(false);
      }, 500);
    }
  };

  // =========================================================================
  // ADMIN FUNCTIONS
  // =========================================================================
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
      if (file.size > 1048576) return showToast('Ukuran gambar terlalu besar. Maksimal 1MB.', 'error');
      const reader = new FileReader();
      reader.onloadend = () => {
        setSettings({ ...settings, qris_url: reader.result });
        showToast('Gambar siap disimpan!', 'success');
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
    
    // Optimistic
    setSettings(settings);
    
    const { error } = await supabaseClient.from('pengaturan').update({
      nama_toko: settings.nama_toko, qris_url: settings.qris_url,
      rekening: settings.rekening, admin_password: settings.admin_password
    }).eq('id', 1);
    
    if (error) showToast(`Gagal: ${error.message} (Cek RLS Supabase)`, 'error');
    else showToast('Pengaturan Disimpan ke Database', 'success');
    
    setIsProcessing(false);
  };

  // CRUD BARANG (ANTI DUPLIKAT & SEKEJAP MATA)
  const handleEditClick = (product) => {
    setNewProduct({
      nama: product.nama, modal: product.modal || 0, jual: product.jual || 0, stok: product.stok || 0,
      barcode: product.barcode || '', diskonQty: product.diskon ? product.diskon.min_qty : '', diskonHarga: product.diskon ? product.diskon.harga_total : ''
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

    if (isDuplicate) return showToast('GAGAL: Nama Barang atau Barcode sudah terdaftar!', 'error');

    setIsProcessing(true);
    let disc = null;
    if (useDiskon) disc = { min_qty: parseInt(newProduct.diskonQty) || 1, harga_total: parseInt(newProduct.diskonHarga) || 0 };
    
    const targetId = editingId ? editingId : Date.now();
    const tempProd = { 
      nama: newProduct.nama, barcode: newProduct.barcode, modal: newProduct.modal||0, 
      jual: newProduct.jual||0, stok: newProduct.stok||0, diskon: disc
    };
    
    // OPTIMISTIC UI
    if (editingId) setProducts(p => p.map(item => item.id === editingId ? { ...item, ...tempProd } : item));
    else setProducts(p => [...p, { ...tempProd, id: targetId, tanggal_dibuat: new Date().toISOString() }]);

    setShowAddForm(false);
    setEditingId(null);
    setNewProduct({ nama: '', modal: 0, jual: 0, stok: 0, barcode: '', diskonQty: '', diskonHarga: '' });
    setUseDiskon(false);
    
    // BACKGROUND SYNC
    if (editingId) {
      const { error } = await supabaseClient.from('produk').update(tempProd).eq('id', editingId);
      if (error) showToast(`Gagal Edit Server: ${error.message}`, 'error');
      else showToast('Berhasil update server!', 'success');
    } else {
      const { error } = await supabaseClient.from('produk').insert([{ ...tempProd, id: targetId, tanggal_dibuat: new Date().toISOString() }]);
      if (error) showToast(`Gagal Tambah Server: ${error.message}`, 'error');
      else showToast('Berhasil simpan ke server!', 'success');
    }
    setIsProcessing(false);
  };

  const handleDeleteProduct = async (id) => {
    if (!supabaseClient) return;
    if(window.confirm("Yakin ingin menghapus barang ini secara permanen?")) {
       setProducts(prev => prev.filter(item => item.id !== id)); // Optimistic
       const { error } = await supabaseClient.from('produk').delete().eq('id', id);
       if (error) showToast(`Gagal Hapus Server: ${error.message}`, 'error');
       else showToast('Dihapus dari server', 'success');
    }
  };

  const handleClearAllProducts = async () => {
    if (!supabaseClient) return;
    if (window.confirm("PERINGATAN SANGAT PENTING!\n\nApakah Anda benar-benar yakin ingin MENGHAPUS SELURUH BARANG TOKO?\n\nData yang dihapus TIDAK BISA DIKEMBALIKAN!")) {
      setProducts([]); // Optimistic
      const { error } = await supabaseClient.from('produk').delete().neq('id', 0); 
      if (error) showToast(`Gagal Server: ${error.message}`, 'error');
      else showToast('Seluruh daftar barang dihapus!', 'success');
    }
  };

  const handleClearTransactions = async () => {
    if (!supabaseClient) return;
    if (window.confirm("PERINGATAN SANGAT PENTING!\n\nApakah Anda benar-benar yakin MENGHAPUS SELURUH RIWAYAT TRANSAKSI PENJUALAN?\n\nData yang dihapus TIDAK BISA DIKEMBALIKAN!")) {
      setTransactions([]); // Optimistic
      const { error } = await supabaseClient.from('transaksi').delete().neq('id', '0'); 
      if (error) showToast(`Gagal Server: ${error.message}`, 'error');
      else showToast('Seluruh riwayat transaksi dihapus!', 'success');
    }
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

  // --- RENDER UI AMAN ---

  if (!dbReady) return <div className="min-h-screen bg-slate-900 flex items-center justify-center font-sans"></div>;

  if (!supabaseClient) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8 text-white text-center font-sans">
        <AlertTriangle size={80} className="text-amber-500 mb-6 animate-pulse" />
        <h1 className="text-2xl font-bold mb-4 text-rose-500 uppercase tracking-tighter">Database Belum Terhubung!</h1>
        <p className="text-slate-400 max-w-md mb-8 font-medium">Aplikasi Anda sudah siap. Namun variabel lingkungan <code className="text-emerald-400">VITE_SUPABASE_URL</code> dan <code className="text-emerald-400">VITE_SUPABASE_ANON_KEY</code> belum terbaca.</p>
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

  const searchFilteredProducts = products.filter(p => p.nama?.toLowerCase().includes(searchQuery.toLowerCase()) || p.barcode?.includes(searchQuery));

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-emerald-100">
      
      {/* MODAL LIVE SCANNER KAMERA SUPER FOKUS */}
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
              <p className="absolute -bottom-10 text-white font-bold tracking-widest opacity-80 text-xs">Pindai Otomatis...</p>
            </div>
          </div>
        </div>
      )}

      {/* GLOBAL TOAST */}
      {toast.show && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 bg-slate-900 text-white rounded-full shadow-2xl font-bold flex items-center gap-2 animate-slide-up border border-slate-700 w-max max-w-[90%] text-center text-sm md:text-base">
          {toast.type === 'success' ? <CheckCircle size={20} className="text-emerald-400 shrink-0"/> : <AlertTriangle size={20} className="text-rose-400 shrink-0"/>}
          {toast.msg}
        </div>
      )}

      {/* VIEW: TOKO */}
      {view === 'toko' && (
        <div className="pb-28">
          <header className="bg-white p-4 shadow-sm sticky top-0 z-40">
            <div className="flex justify-between items-center mb-4 max-w-5xl mx-auto">
              <div className="flex items-center gap-2 text-emerald-600 font-black text-xl"><Store/> {settings.nama_toko}</div>
              <div className="flex items-center gap-2">
                <button onClick={() => setView('admin')} className="p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition shadow-sm" title="Masuk Mode Admin"><Lock size={18}/></button>
                <button onClick={handleExitApp} className="p-2 bg-rose-50 text-rose-500 rounded-full hover:bg-rose-100 transition shadow-sm" title="Keluar Aplikasi"><Power size={18}/></button>
              </div>
            </div>
            <div className="flex gap-2 max-w-5xl mx-auto">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 text-slate-400" size={20}/>
                <input type="text" placeholder="Cari barang atau ketik barcode..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} className="w-full bg-slate-100 rounded-xl pl-10 pr-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500 font-medium transition-all border-none"/>
              </div>
              <button onClick={() => startScanner('toko')} className="bg-slate-800 text-white p-3 rounded-xl cursor-pointer hover:bg-slate-700 transition active:scale-95 flex items-center shadow-lg" title="Scan Langsung via Kamera"><Camera size={24}/></button>
            </div>
          </header>

          <main className="p-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 max-w-5xl mx-auto">
            {searchFilteredProducts.map(p => (
              <div key={p.id} onClick={() => openProductModal(p)} className="bg-white p-4 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col items-center text-center relative active:scale-95 transition-all group hover:shadow-md cursor-pointer border-b-4 border-b-slate-100 overflow-hidden">
                {cart[p.id] > 0 && <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[10px] font-black px-2 py-1 rounded-bl-xl shadow-lg">{cart[p.id]}</div>}
                <div className="mb-4 bg-slate-50 p-4 rounded-full transition-colors flex items-center justify-center">{getDynamicIcon(p.nama)}</div>
                <h3 className="font-bold text-sm mb-1 line-clamp-2 h-10 text-slate-700">{p.nama}</h3>
                <p className="text-emerald-600 font-black mb-2 text-lg">{formatRupiah(p.jual)}</p>
                <div className={`text-[10px] font-black px-2 py-0.5 rounded-full ${(p.stok||0) > 5 ? 'bg-blue-50 text-blue-500' : 'bg-rose-50 text-rose-500'}`}>Sisa: {p.stok || 0}</div>
              </div>
            ))}
            {searchFilteredProducts.length === 0 && <div className="col-span-full text-center text-slate-400 mt-10 font-bold">Barang tidak ditemukan.</div>}
          </main>

          {selectedProduct && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-4 animate-fade-in">
              <div className="bg-white w-full max-w-md rounded-[32px] p-8 shadow-2xl animate-slide-up border-4 border-white">
                <div className="flex justify-between items-center mb-8">
                   <div className="flex items-center gap-4">
                     <div className="p-4 bg-slate-50 rounded-2xl text-4xl">{getDynamicIcon(selectedProduct.nama)}</div>
                     <div><h3 className="font-black text-xl text-slate-800 leading-tight">{selectedProduct.nama}</h3><p className="text-emerald-600 font-black text-lg">{formatRupiah(selectedProduct.jual)}</p></div>
                   </div>
                   <button onClick={() => setSelectedProduct(null)} className="p-2 bg-slate-100 rounded-full"><X/></button>
                </div>
                {selectedProduct.diskon && (
                  <div className="bg-orange-50 text-orange-700 p-4 rounded-2xl text-sm mb-6 border border-orange-200 text-center font-black">
                    🔥 Beli {selectedProduct.diskon.min_qty} bayar {formatRupiah(selectedProduct.diskon.harga_total)}
                  </div>
                )}
                <div className="flex items-center justify-between bg-slate-50 p-5 rounded-3xl mb-8 border border-slate-100">
                   <button onClick={() => setTempQty(Math.max(0, tempQty-1))} className="w-14 h-14 bg-white rounded-2xl shadow-sm font-black text-2xl border active:bg-slate-100 transition">-</button>
                   <input type="number" value={tempQty === 0 ? '' : tempQty} onChange={e => setTempQty(Math.min(selectedProduct.stok||0, Math.max(0, parseInt(e.target.value)||0)))} className="bg-transparent text-center font-black text-4xl w-24 outline-none text-slate-800" placeholder="0"/>
                   <button onClick={() => setTempQty(Math.min(selectedProduct.stok||0, tempQty+1))} className="w-14 h-14 bg-emerald-600 text-white rounded-2xl shadow-sm font-black text-2xl active:bg-emerald-700 transition">+</button>
                </div>
                <button onClick={saveToCart} className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black text-xl shadow-xl active:scale-95 transition-all hover:bg-slate-800">Simpan ke Keranjang</button>
              </div>
            </div>
          )}

          {jumlahItem > 0 && !selectedProduct && (
            <div className="fixed bottom-6 left-4 right-4 z-50 max-w-md mx-auto">
              <button onClick={() => setView('checkout')} className="w-full bg-emerald-600 text-white p-5 rounded-[2rem] shadow-2xl flex justify-between items-center active:scale-95 transition-all border-4 border-emerald-500/20">
                <div className="text-left"><p className="text-[10px] opacity-80 font-black uppercase tracking-widest mb-1">{jumlahItem} Barang Terpilih</p><p className="text-2xl font-black">{formatRupiah(totalBelanja)}</p></div>
                <div className="flex items-center gap-2 font-black bg-white/20 px-4 py-2 rounded-2xl">BAYAR <ChevronRight/></div>
              </button>
            </div>
          )}
        </div>
      )}

      {/* VIEW: CHECKOUT */}
      {view === 'checkout' && (
        <div className="max-w-md mx-auto p-6 min-h-screen flex flex-col">
          <button onClick={() => setView('toko')} className="flex items-center gap-2 font-black mb-8 text-slate-400 hover:text-slate-600 transition"><ArrowLeft/> Kembali Belanja</button>
          
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-[40px] p-8 mb-8 shadow-2xl text-white relative overflow-hidden">
             <div className="absolute -top-10 -right-10 opacity-10 rotate-12"><CreditCard size={150}/></div>
             <p className="text-xs opacity-70 font-black uppercase tracking-widest mb-2">Total Tagihan Anda</p>
             <h2 className="text-5xl font-black tracking-tighter">{formatRupiah(totalBelanja)}</h2>
          </div>

          <h3 className="font-black text-lg mb-4 ml-1 text-slate-800">Pilih Pembayaran:</h3>
          <div className="space-y-4 mb-10">
             <button onClick={() => setMetodeBayar('qris')} className={`w-full p-5 rounded-3xl border-2 flex items-center gap-5 transition-all ${metodeBayar==='qris' ? 'border-emerald-500 bg-emerald-50 shadow-inner' : 'border-slate-100 bg-white hover:border-slate-200'}`}>
               <div className="p-3 bg-white rounded-lg shadow-sm border"><QrCode className="text-emerald-600" size={28}/></div>
               <div className="text-left"><p className="font-black text-lg text-slate-800">QRIS Cepat</p><p className="text-xs text-slate-500 font-semibold">Scan via e-Wallet/M-Banking</p></div>
             </button>
             <button onClick={() => setMetodeBayar('transfer')} className={`w-full p-5 rounded-3xl border-2 flex items-center gap-5 transition-all ${metodeBayar==='transfer' ? 'border-blue-500 bg-blue-50 shadow-inner' : 'border-slate-100 bg-white hover:border-slate-200'}`}>
               <div className="p-3 bg-white rounded-lg shadow-sm border"><CreditCard className="text-blue-600" size={28}/></div>
               <div className="text-left"><p className="font-black text-lg text-slate-800">Transfer Bank</p><p className="text-xs text-slate-500 font-semibold">Transfer manual ke rekening</p></div>
             </button>
          </div>

          {metodeBayar === 'qris' && (
             <div className="p-8 bg-white rounded-[40px] border-2 border-slate-50 shadow-sm mb-10 text-center animate-fade-in flex flex-col items-center">
               {settings.qris_url ? (
                 <>
                   <img src={formatImageUrl(settings.qris_url)} className="w-64 h-64 mx-auto mb-6 border p-4 rounded-3xl shadow-sm object-contain bg-white" alt="QRIS Pembayaran"/>
                   <button onClick={handleDownloadQRIS} className="mb-4 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 px-6 py-3 rounded-2xl font-black flex items-center gap-2 transition-all active:scale-95">
                     <Download size={18}/> DOWNLOAD QRIS
                   </button>
                 </>
               ) : (
                 <div className="w-64 h-64 mx-auto mb-6 border-2 border-dashed border-slate-200 rounded-3xl flex items-center justify-center bg-slate-50 text-slate-400 font-bold text-sm">QRIS Belum Diatur</div>
               )}
               <p className="text-[10px] text-slate-400 font-black tracking-[0.2em] uppercase">Scan untuk Kejujuran</p>
             </div>
          )}

          {metodeBayar === 'transfer' && (() => {
             const rekStr = settings.rekening || '';
             const matchResult = rekStr.match(/\d+/);
             const noRek = matchResult ? matchResult[0] : '-';
             const pemilik = rekStr.split(/a\.?n\.?/i)[1] || 'Toko';
             return (
               <div className="p-8 bg-white rounded-[40px] border-2 border-slate-50 shadow-sm mb-10 animate-fade-in text-center relative overflow-hidden">
                 <div className="absolute top-0 right-0 p-4 opacity-5"><Copy size={80}/></div>
                 <p className="text-xs text-slate-400 font-black mb-4 uppercase tracking-widest">Nomor Rekening</p>
                 <div className="flex items-center justify-center gap-4 mb-4">
                    <h4 className="text-3xl font-black tracking-tighter text-slate-800">{noRek}</h4> 
                    <button onClick={handleCopyRekening} className="p-3 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 transition active:scale-90"><Copy size={20}/></button>
                 </div>
                 <div className="bg-slate-50 p-4 rounded-2xl inline-block border border-slate-100 max-w-full overflow-hidden">
                    <p className="font-black text-slate-500 uppercase text-[10px] tracking-widest">Bank & Nama Pemilik:</p>
                    <p className="font-bold text-slate-800 mt-1 truncate px-2">{pemilik.trim()}</p>
                 </div>
               </div>
             );
          })()}

          <button onClick={handleSelesaiBayar} disabled={!metodeBayar || isProcessing} className="mt-auto w-full py-6 bg-slate-900 text-white rounded-3xl font-black text-2xl shadow-xl disabled:opacity-30 active:scale-95 transition-all">
            {isProcessing ? 'MENYIMPAN...' : 'Selesai & Cetak Struk'}
          </button>
        </div>
      )}

      {/* VIEW: STRUK (MODERN) */}
      {view === 'struk' && (
        <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
          <div className="mb-6 flex flex-col items-center animate-slide-up">
            <div className="w-16 h-16 bg-emerald-500 text-white rounded-full flex items-center justify-center mb-3 shadow-lg shadow-emerald-200">
              <CheckCircle size={36} />
            </div>
            <h2 className="text-2xl font-extrabold text-slate-800">Pembayaran Berhasil</h2>
            <p className="text-slate-500 text-sm mt-1 font-bold">Terima kasih atas kejujuran Anda!</p>
          </div>

          <div className="bg-white w-full max-w-md rounded-3xl shadow-xl overflow-hidden animate-fade-in relative">
            <div className="bg-slate-900 p-6 text-center text-white">
              <Store className="mx-auto mb-2 opacity-80" size={32} />
              <h3 className="font-bold text-xl tracking-wide">{settings.nama_toko}</h3>
              <p className="text-xs text-slate-400 mt-1 opacity-80">E-Receipt • {strukTerakhir?.tanggal}</p>
            </div>
            
            <div className="p-6">
              <div className="flex justify-between items-center mb-4 pb-4 border-b border-dashed border-gray-200">
                <span className="text-xs text-gray-400 uppercase tracking-wider font-bold">ID Transaksi</span>
                <span className="text-xs font-mono text-slate-700 font-bold">{strukTerakhir?.id}</span>
              </div>
              
              <div className="space-y-4 mb-6">
                {strukTerakhir?.items?.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-start">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center mt-0.5 border">
                        {getDynamicIcon(item.nama)}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">{item.nama}</p>
                        <p className="text-xs text-gray-500 mt-0.5 font-bold">{item.qty} x {formatRupiah(item.jual)}</p>
                      </div>
                    </div>
                    <p className="font-bold text-slate-800 text-sm">{formatRupiah(item.totalHarga)}</p>
                  </div>
                ))}
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl flex justify-between items-center border border-slate-100">
                <span className="font-bold text-slate-600">Total Dibayar</span>
                <span className="font-extrabold text-emerald-600 text-xl">{formatRupiah(strukTerakhir?.total)}</span>
              </div>
            </div>

            <div className="bg-gray-50 p-4 text-center border-t border-dashed">
              <p className="text-xs text-gray-400 uppercase font-bold tracking-widest">Metode: {strukTerakhir?.metode}</p>
            </div>
            
            <div className="absolute top-[80px] -left-4 w-8 h-8 bg-slate-100 rounded-full"></div>
            <div className="absolute top-[80px] -right-4 w-8 h-8 bg-slate-100 rounded-full"></div>
          </div>

          <button onClick={handleTutupStruk} className="mt-8 px-8 py-3 bg-slate-900 text-white rounded-full font-bold shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all active:scale-95">
            Selesai & Kembali
          </button>
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
      {view === 'admin' && isAdminLogged && (() => {
        const filteredTransactions = transactions.filter(t => {
          if (!filterStart && !filterEnd) return true;
          let tDate;
          const match = t.id.match(/\d+/);
          tDate = match ? new Date(parseInt(match[0])) : new Date();
          const sDate = filterStart ? new Date(filterStart) : new Date(0);
          let eDate = filterEnd ? new Date(filterEnd) : new Date('2100-01-01');
          if (filterEnd) eDate.setHours(23, 59, 59, 999);
          return tDate >= sDate && tDate <= eDate;
        });

        const totalPendapatanKotor = filteredTransactions.reduce((sum, t) => sum + (t.total || 0), 0);
        const totalKeuntunganBersih = filteredTransactions.reduce((sum, t) => sum + (t.profit || 0), 0);
        const totalModalAdmin = filteredTransactions.reduce((sum, t) => sum + (t.modal || 0), 0);

        // LOGIKA PERINGKAT BARANG
        const itemSalesMap = {};
        filteredTransactions.forEach(t => {
          t.items.forEach(item => {
            if (!itemSalesMap[item.id]) itemSalesMap[item.id] = { qty: 0, revenue: 0, profit: 0 };
            itemSalesMap[item.id].qty += item.qty;
            itemSalesMap[item.id].revenue += item.totalHarga;
            itemSalesMap[item.id].profit += item.profitItem;
          });
        });

        const productRankings = products.map(p => {
          const daysActive = Math.max(1, Math.floor((new Date() - new Date(p.tanggal_dibuat || new Date())) / (1000 * 60 * 60 * 24)));
          return {
            id: p.id, nama: p.nama, stok: p.stok,
            qty: itemSalesMap[p.id]?.qty || 0,
            revenue: itemSalesMap[p.id]?.revenue || 0,
            profit: itemSalesMap[p.id]?.profit || 0,
            daysActive
          }
        }).sort((a, b) => b.qty - a.qty); 

        const topSelling = productRankings.filter(p => p.qty > 0).slice(0, 5);
        const bottomSelling = [...productRankings]
          .filter(p => p.stok > 0)
          .sort((a, b) => {
            if (a.qty !== b.qty) return a.qty - b.qty; 
            return b.daysActive - a.daysActive; 
          }).slice(0, 5);

        return (
          <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row relative">
            {/* ADMIN SIDEBAR (STICKY/FREEZE) */}
            <aside className="bg-slate-950 text-white w-full md:w-64 flex-shrink-0 flex flex-col shadow-2xl sticky top-0 z-40 overflow-x-auto md:overflow-x-visible md:overflow-y-auto md:h-screen scrollbar-hide">
              <div className="hidden md:flex p-6 items-center gap-3 border-b border-slate-800 flex-shrink-0">
                 <Store className="text-emerald-400" size={28} />
                 <div>
                   <h2 className="font-extrabold text-xl text-white leading-tight tracking-wide">Admin Area</h2>
                   <p className="text-[10px] text-emerald-400 font-black uppercase tracking-widest mt-1">Toko Kejujuran</p>
                 </div>
              </div>
              <nav className="flex-1 p-4 flex md:flex-col gap-2">
                <button onClick={() => {setAdminTab('analisa'); setEditingId(null); setShowAddForm(false);}} className={`flex items-center gap-3 px-4 py-3 md:py-4 rounded-2xl w-full text-left transition-all whitespace-nowrap flex-shrink-0 ${adminTab==='analisa' ? 'bg-emerald-500 text-white shadow-md font-black' : 'text-slate-400 hover:bg-slate-800 hover:text-white font-bold'}`}>
                  <BarChart3 size={20} className="shrink-0" /> <span className="text-sm md:text-base">Analisa Penjualan</span>
                </button>
                <button onClick={() => {setAdminTab('barang'); setEditingId(null); setShowAddForm(false);}} className={`flex items-center gap-3 px-4 py-3 md:py-4 rounded-2xl w-full text-left transition-all whitespace-nowrap flex-shrink-0 ${adminTab==='barang' ? 'bg-emerald-500 text-white shadow-md font-black' : 'text-slate-400 hover:bg-slate-800 hover:text-white font-bold'}`}>
                  <Package size={20} className="shrink-0" /> <span className="text-sm md:text-base">Manajemen Barang</span>
                </button>
                <button onClick={() => {setAdminTab('pengaturan'); setEditingId(null); setShowAddForm(false);}} className={`flex items-center gap-3 px-4 py-3 md:py-4 rounded-2xl w-full text-left transition-all whitespace-nowrap flex-shrink-0 ${adminTab==='pengaturan' ? 'bg-emerald-500 text-white shadow-md font-black' : 'text-slate-400 hover:bg-slate-800 hover:text-white font-bold'}`}>
                  <Settings size={20} className="shrink-0" /> <span className="text-sm md:text-base">Pengaturan Toko</span>
                </button>
                <button onClick={handleLogout} className="md:mt-auto flex items-center gap-3 px-4 py-3 md:py-4 rounded-2xl w-full text-left text-rose-400 hover:bg-slate-800 hover:text-rose-300 font-black transition-all whitespace-nowrap flex-shrink-0">
                  <LogOut size={20} className="shrink-0" /> <span className="text-sm md:text-base">Keluar (Logout)</span>
                </button>
              </nav>
            </aside>
            
            <main className="flex-1 p-4 md:p-10 overflow-y-auto">
               
               {/* TAB: ANALISA PENJUALAN */}
               {adminTab === 'analisa' && (
                 <div className="animate-fade-in max-w-6xl mx-auto">
                    <div className="flex flex-col xl:flex-row justify-between xl:items-center mb-8 gap-6">
                      <h1 className="text-3xl font-black tracking-tighter text-slate-800">Ikhtisar Penjualan</h1>
                      <div className="flex flex-col md:flex-row gap-4 w-full xl:w-auto">
                        <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm w-full md:w-auto">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Filter:</span>
                          <input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)} className="bg-slate-50 px-3 py-2 rounded-xl text-sm font-bold outline-none text-slate-700 focus:ring-2 focus:ring-emerald-500 border border-slate-100 flex-1 md:flex-none"/>
                          <span className="text-slate-300 font-black hidden md:inline">-</span>
                          <input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} className="bg-slate-50 px-3 py-2 rounded-xl text-sm font-bold outline-none text-slate-700 focus:ring-2 focus:ring-emerald-500 border border-slate-100 flex-1 md:flex-none"/>
                          {(filterStart || filterEnd) && <button onClick={() => {setFilterStart(''); setFilterEnd('');}} className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-500 rounded-xl transition-colors w-full md:w-auto mt-2 md:mt-0"><X size={16} className="mx-auto"/></button>}
                        </div>
                        <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                          <button onClick={handleExportCSV} className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black flex items-center justify-center gap-2 shadow-xl hover:bg-slate-800 active:scale-95 transition-all w-full md:w-auto text-sm"><Download size={18}/> EXPORT EXCEL</button>
                          <button onClick={handleClearTransactions} disabled={isProcessing} className="bg-rose-600 text-white px-6 py-3 rounded-2xl font-black flex items-center justify-center gap-2 shadow-xl hover:bg-rose-700 active:scale-95 transition-all w-full md:w-auto text-sm"><Trash2 size={18}/> {isProcessing ? 'PROSES...' : 'HAPUS DATA UJI COBA'}</button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                       <div className="bg-white p-6 rounded-[32px] shadow-sm border border-gray-100 relative overflow-hidden">
                         <div className="absolute top-0 right-0 p-6 opacity-5"><BarChart3 size={64}/></div>
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Total Omset</p>
                         <p className="text-3xl font-extrabold text-slate-800">{formatRupiah(totalPendapatanKotor)}</p>
                       </div>
                       <div className="bg-white p-6 rounded-[32px] shadow-sm border border-gray-100 relative overflow-hidden">
                         <div className="absolute top-0 right-0 p-6 opacity-5"><Store size={64}/></div>
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Total Modal</p>
                         <p className="text-3xl font-extrabold text-blue-600">{formatRupiah(totalModalAdmin)}</p>
                       </div>
                       <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-6 rounded-[32px] shadow-sm text-white relative overflow-hidden">
                         <div className="absolute top-0 right-0 p-6 opacity-10"><CheckCircle size={64}/></div>
                         <p className="text-[10px] font-black text-emerald-100 uppercase tracking-widest mb-2">Keuntungan Bersih</p>
                         <p className="text-3xl font-extrabold drop-shadow-sm">{formatRupiah(totalKeuntunganBersih)}</p>
                       </div>
                    </div>

                    <div className="grid lg:grid-cols-2 gap-6 mb-8">
                        {/* Tabel Peringkat Barang Laku */}
                        <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden p-6 flex flex-col">
                            <h2 className="font-black text-lg mb-4 flex items-center gap-2 text-slate-900"><TrendingUp className="text-orange-500"/> Barang Paling Laku</h2>
                            {topSelling.length === 0 ? <p className="text-gray-400 text-sm font-bold">Belum ada data penjualan.</p> : (
                              <div className="space-y-3 overflow-y-auto max-h-[300px]">
                                {topSelling.map((item, idx) => (
                                  <div key={idx} className="flex justify-between items-center p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                    <div className="flex items-center gap-3">
                                      <span className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center text-xs font-black text-slate-700 border border-slate-200">{idx+1}</span>
                                      <span className="font-extrabold text-sm text-slate-900">{item.nama}</span>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-sm font-extrabold text-slate-800">{item.qty} terjual</p>
                                      <p className="text-[10px] font-black text-emerald-600 tracking-widest uppercase">+ Untung {formatRupiah(item.profit)}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                        </div>

                        {/* Tabel Barang Nganggur */}
                        <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden p-6 flex flex-col">
                            <h2 className="font-black text-lg mb-4 flex items-center gap-2 text-slate-900"><TrendingDown className="text-red-500"/> Perhatian: Kurang Laku</h2>
                            <div className="space-y-3 overflow-y-auto max-h-[300px]">
                              {bottomSelling.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center p-3 bg-red-50/50 rounded-2xl border border-red-100">
                                  <span className="font-extrabold text-sm text-slate-900">{item.nama}</span>
                                  <div className="text-right">
                                    <p className="text-sm font-extrabold text-red-600">{item.qty} terjual</p>
                                    <p className="text-[10px] font-black text-red-500 tracking-widest uppercase">Nganggur {item.daysActive} hari</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                        </div>
                    </div>

                    {/* Tabel Riwayat Transaksi (Modern) */}
                    <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 p-6 md:p-8">
                      <h2 className="font-black text-lg mb-6 flex items-center gap-2 text-slate-900"><List className="text-blue-500"/> Riwayat Transaksi Lengkap</h2>
                      <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                        {filteredTransactions.length === 0 ? <p className="text-gray-400 text-sm font-bold text-center py-10">Belum ada transaksi.</p> : filteredTransactions.slice().reverse().map(t => (
                          <div key={t.id} className="border border-gray-200 rounded-3xl p-5 bg-gray-50/50 hover:bg-white transition-colors">
                            <div className="flex justify-between items-center text-sm mb-3 pb-3 border-b border-gray-200">
                              <span className="font-mono text-xs font-bold text-slate-500">{t.id} • {t.tanggal}</span>
                              <span className={`text-[10px] font-black px-3 py-1 rounded-xl uppercase tracking-widest ${t.metode === 'qris' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>{t.metode}</span>
                            </div>
                            <div className="space-y-2 mb-3">
                              {t.items.map((i, idx) => (
                                <div key={idx} className="text-xs flex justify-between text-slate-700 font-bold">
                                  <span>{i.qty}x {i.nama}</span>
                                  <span className="text-slate-900">{formatRupiah(i.totalHarga)}</span>
                                </div>
                              ))}
                            </div>
                            <div className="flex justify-between items-end mt-3 pt-3 border-t border-gray-200">
                              <span className="text-[10px] uppercase tracking-widest font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">Untung {formatRupiah(t.profit)}</span>
                              <span className="font-black text-xl text-slate-900">{formatRupiah(t.total)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                 </div>
               )}

               {/* TAB: MANAJEMEN BARANG (CRUD FULL) */}
               {adminTab === 'barang' && (
                 <div className="animate-fade-in max-w-6xl mx-auto">
                    <div className="flex flex-col md:flex-row justify-between md:items-center mb-8 gap-4">
                      <h1 className="text-3xl font-black tracking-tighter text-slate-800">Manajemen Barang</h1>
                      <div className="flex flex-col md:flex-row gap-2">
                        <button onClick={handleClearAllProducts} disabled={isProcessing} className="bg-rose-100 text-rose-600 px-6 py-3 rounded-2xl font-black flex items-center justify-center gap-2 shadow-sm hover:bg-rose-200 active:scale-95 transition-all uppercase w-full md:w-auto text-sm"><Trash2 size={18}/> {isProcessing ? 'PROSES...' : 'Hapus Semua'}</button>
                        <button onClick={() => { setEditingId(null); setNewProduct({ nama: '', modal: 0, jual: 0, stok: 0, barcode: '', diskonQty: '', diskonHarga: '' }); setUseDiskon(false); setShowAddForm(!showAddForm); }} className="bg-emerald-600 text-white px-6 py-3 rounded-2xl font-black flex items-center justify-center gap-2 shadow-xl shadow-emerald-100 hover:bg-emerald-500 active:scale-95 transition-all uppercase w-full md:w-auto text-sm">{showAddForm ? <X size={18}/> : <PlusCircle size={18}/>} {showAddForm ? 'Tutup Form' : 'Tambah Barang'}</button>
                      </div>
                    </div>

                    {showAddForm && (
                      <form onSubmit={handleAddProduct} className={`p-6 md:p-8 rounded-[40px] border shadow-sm mb-8 grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6 animate-slide-up ${editingId ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200'}`}>
                         <h3 className="md:col-span-4 font-black text-slate-800 mb-2 flex items-center gap-2">
                           {editingId ? <><Edit className="text-blue-600"/> Edit Data Barang</> : <><PlusCircle className="text-emerald-600"/> Input Barang Baru</>}
                         </h3>
                         <div className="md:col-span-2">
                           <label className="text-[10px] font-black uppercase text-slate-500 mb-2 block tracking-widest ml-1">Nama Produk</label>
                           <input required value={newProduct.nama} onChange={e => setNewProduct({...newProduct, nama: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl font-bold border border-slate-200 focus:ring-4 focus:ring-emerald-500/20 outline-none transition-all"/>
                         </div>
                         <div className="md:col-span-2">
                           <label className="text-[10px] font-black uppercase text-slate-500 mb-2 block tracking-widest ml-1">Barcode (Pindai Otomatis)</label>
                           <div className="flex gap-2">
                             <input value={newProduct.barcode} onChange={e => setNewProduct({...newProduct, barcode: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl font-bold border border-slate-200 focus:ring-4 focus:ring-emerald-500/20 outline-none transition-all" placeholder="Ketik/Scan"/>
                             <button type="button" onClick={() => startScanner('admin')} className="bg-slate-900 text-white p-4 rounded-2xl cursor-pointer hover:bg-slate-800 transition flex justify-center items-center shadow-md active:scale-95 shrink-0" title="Scan via Kamera HP"><Camera size={24}/></button>
                           </div>
                         </div>
                         <div>
                           <label className="text-[10px] font-black uppercase text-slate-500 mb-2 block tracking-widest ml-1">Modal Beli (Rp)</label>
                           <input required type="number" value={newProduct.modal || ''} onChange={e => setNewProduct({...newProduct, modal: parseInt(e.target.value)})} className="w-full p-4 bg-slate-50 rounded-2xl font-bold border border-slate-200 focus:ring-4 focus:ring-emerald-500/20 outline-none transition-all"/>
                         </div>
                         <div>
                           <label className="text-[10px] font-black uppercase text-slate-500 mb-2 block tracking-widest ml-1">Harga Jual Satuan (Rp)</label>
                           <input required type="number" value={newProduct.jual || ''} onChange={e => setNewProduct({...newProduct, jual: parseInt(e.target.value)})} className="w-full p-4 bg-slate-50 rounded-2xl font-bold border border-slate-200 focus:ring-4 focus:ring-emerald-500/20 outline-none transition-all"/>
                         </div>
                         <div className="md:col-span-2">
                           <label className="text-[10px] font-black uppercase text-slate-500 mb-2 block tracking-widest ml-1">Stok Fisik Awal</label>
                           <input required type="number" value={newProduct.stok === 0 && !editingId ? '' : newProduct.stok} onChange={e => setNewProduct({...newProduct, stok: parseInt(e.target.value) || 0})} className="w-full p-4 bg-slate-50 rounded-2xl font-bold border border-slate-200 focus:ring-4 focus:ring-emerald-500/20 outline-none transition-all"/>
                         </div>
                         <div className="flex items-center gap-3 pt-2 ml-1 md:col-span-4">
                           <input type="checkbox" checked={useDiskon} onChange={e => setUseDiskon(e.target.checked)} className="w-6 h-6 accent-emerald-600 rounded-lg cursor-pointer border-slate-300"/>
                           <span className="font-black text-xs text-slate-600 uppercase tracking-widest cursor-pointer" onClick={() => setUseDiskon(!useDiskon)}>Aktifkan Harga Grosir?</span>
                         </div>
                         {useDiskon && (
                           <div className="flex flex-col md:flex-row gap-4 md:col-span-4 animate-fade-in bg-orange-50 p-6 rounded-3xl border border-orange-200">
                             <div className="w-full md:w-1/2">
                               <label className="text-[10px] font-black uppercase text-orange-700 mb-2 block tracking-widest ml-1">Minimal Beli (Qty)</label>
                               <input type="number" value={newProduct.diskonQty} onChange={e => setNewProduct({...newProduct, diskonQty: e.target.value})} className="w-full p-4 bg-white rounded-2xl border border-orange-100 outline-none font-bold text-orange-900 focus:ring-4 focus:ring-orange-500/20 shadow-sm" placeholder="Contoh: 3"/>
                             </div>
                             <div className="w-full md:w-1/2">
                               <label className="text-[10px] font-black uppercase text-orange-700 mb-2 block tracking-widest ml-1">Total Harga Grosir (Bukan Satuan)</label>
                               <input type="number" value={newProduct.diskonHarga} onChange={e => setNewProduct({...newProduct, diskonHarga: e.target.value})} className="w-full p-4 bg-white rounded-2xl border border-orange-100 outline-none font-bold text-orange-900 focus:ring-4 focus:ring-orange-500/20 shadow-sm" placeholder="Contoh: 10000"/>
                             </div>
                           </div>
                         )}
                         <button disabled={isProcessing} className={`text-white py-5 rounded-[24px] font-black text-lg md:col-span-4 mt-2 transition-all active:scale-[0.98] shadow-xl disabled:opacity-50 ${editingId ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-200' : 'bg-slate-900 hover:bg-slate-800'}`}>
                           {isProcessing ? 'MENYIMPAN...' : (editingId ? 'UPDATE BARANG SEKARANG' : 'SIMPAN BARANG BARU')}
                         </button>
                    </form>
                  )}

                  <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left min-w-[800px]">
                         <thead className="bg-slate-50 border-b border-slate-200">
                           <tr className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
                             <th className="p-6">Data Produk</th>
                             <th className="p-6 text-center">Stok</th>
                             <th className="p-6">Harga & Profit</th>
                             <th className="p-6 text-center">Aksi (CRUD)</th>
                           </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-100">
                           {products.length === 0 && <tr><td colSpan="4" className="p-10 text-center text-slate-400 font-bold">Barang masih kosong.</td></tr>}
                           {products.map(p => (
                             <tr key={p.id} className={`transition-colors ${editingId === p.id ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}>
                               <td className="p-6 flex items-center gap-4">
                                 <div className="w-12 h-12 bg-white rounded-2xl border shadow-sm flex items-center justify-center shrink-0">{getDynamicIcon(p.nama)}</div>
                                 <div className="min-w-0">
                                   <p className="font-extrabold text-sm text-slate-900 truncate">{p.nama}</p>
                                   {p.barcode ? <p className="font-mono text-[10px] text-slate-500 mt-1 uppercase tracking-widest flex items-center gap-1"><QrCode size={10}/> {p.barcode}</p> : <p className="text-[10px] text-slate-400 mt-1 italic">No Barcode</p>}
                                 </div>
                               </td>
                               <td className="p-6 text-center">
                                 <span className={`px-4 py-2 rounded-xl text-[10px] font-black tracking-widest uppercase ${p.stok > 10 ? 'bg-emerald-100 text-emerald-800' : p.stok > 0 ? 'bg-orange-100 text-orange-800' : 'bg-rose-100 text-rose-800'}`}>
                                   {p.stok} Pcs
                                 </span>
                               </td>
                               <td className="p-6">
                                 <div className="font-black text-sm text-emerald-700">{formatRupiah(p.jual)}</div>
                                 <div className="text-[10px] font-bold text-slate-500 mt-1">Modal: {formatRupiah(p.modal)} (Untung: {formatRupiah(p.jual - p.modal)})</div>
                                 {p.diskon && <div className="text-[10px] text-orange-700 font-black bg-orange-100 px-2 py-1 rounded-lg w-max mt-2 border border-orange-200">GROSIR: {p.diskon.min_qty} = {formatRupiah(p.diskon.harga_total)}</div>}
                               </td>
                               <td className="p-6 text-center">
                                 <div className="flex items-center justify-center gap-2">
                                   <button onClick={() => handleEditClick(p)} className="p-3 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-2xl transition-colors shadow-sm" title="Edit Barang"><Edit size={18}/></button>
                                   <button disabled={isProcessing} onClick={() => handleDeleteProduct(p.id)} className="p-3 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white rounded-2xl transition-colors shadow-sm disabled:opacity-50" title="Hapus Barang"><Trash2 size={18}/></button>
                                 </div>
                               </td>
                             </tr>
                           ))}
                         </tbody>
                      </table>
                    </div>
                  </div>
               </div>
             )}

             {/* TAB: PENGATURAN */}
             {adminTab === 'pengaturan' && (
               <div className="max-w-3xl animate-fade-in mx-auto md:mx-0">
                  <h1 className="text-3xl font-black tracking-tighter text-slate-800 mb-8">Konfigurasi Toko</h1>
                  <div className="bg-white p-8 md:p-10 rounded-[40px] border border-slate-200 shadow-sm space-y-8">
                     
                     <div className="space-y-3">
                       <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 flex items-center gap-2"><Store size={14}/> Nama Toko Digital</label>
                       <input value={settings.nama_toko || ''} onChange={e => setSettings({...settings, nama_toko: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-3xl font-black focus:ring-4 focus:ring-emerald-500/20 outline-none transition-all text-lg"/>
                     </div>

                     <hr className="border-slate-100"/>
                     
                     {/* FITUR BARU: UPLOAD & DOWNLOAD QRIS */}
                     <div className="space-y-3">
                       <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 flex items-center gap-2"><QrCode size={14}/> Foto QRIS Pembayaran</label>
                       <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 bg-slate-50 border border-slate-200 p-6 rounded-[32px]">
                         
                         <div className="flex flex-col items-center gap-3 w-full sm:w-auto">
                           <div className="w-40 h-40 shrink-0 bg-white rounded-3xl border-2 border-dashed border-emerald-300 flex items-center justify-center p-2 overflow-hidden shadow-sm relative">
                             {settings.qris_url ? (
                               <img src={formatImageUrl(settings.qris_url)} className="w-full h-full object-contain" alt="QRIS Preview"/>
                             ) : (
                               <span className="text-xs text-slate-400 font-bold text-center">Belum ada QRIS</span>
                             )}
                           </div>
                           <button onClick={handleDownloadQRIS} className="text-[10px] font-black bg-slate-800 hover:bg-slate-700 text-white px-5 py-2.5 rounded-full transition-colors uppercase tracking-widest flex items-center gap-2 shadow-md">
                             <Download size={14}/> Unduh QRIS
                           </button>
                         </div>

                         <div className="flex-1 w-full space-y-4">
                           <label className="w-full flex items-center justify-center gap-2 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 p-4 rounded-2xl font-black cursor-pointer transition-all active:scale-95 border border-emerald-200 text-sm">
                             <UploadCloud size={20}/> Upload dari Galeri/File
                             <input type="file" accept="image/*" className="hidden" onChange={handleUploadQRIS} />
                           </label>
                           <div className="flex items-center gap-3">
                             <div className="h-[1px] bg-slate-300 flex-1"></div>
                             <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ATAU PASTE LINK</span>
                             <div className="h-[1px] bg-slate-300 flex-1"></div>
                           </div>
                           <input placeholder="Link G-Drive/GitHub..." value={settings.qris_url || ''} onChange={e => setSettings({...settings, qris_url: e.target.value})} className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-bold focus:ring-4 focus:ring-emerald-500/20 outline-none text-xs"/>
                         </div>
                       </div>
                     </div>

                     <hr className="border-slate-100"/>
                     
                     <div className="space-y-3">
                       <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 flex items-center gap-2"><CreditCard size={14}/> Info Rekening Manual</label>
                       <input value={settings.rekening || ''} onChange={e => setSettings({...settings, rekening: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-3xl font-bold focus:ring-4 focus:ring-emerald-500/20 outline-none transition-all text-sm"/>
                       <p className="text-[10px] text-slate-400 font-bold ml-2">Format: NAMA BANK [SPASI] NO REKENING [SPASI] a.n NAMA PEMILIK</p>
                     </div>
                     
                     <hr className="border-slate-100"/>

                     <div className="space-y-3">
                       <label className="text-[10px] font-black text-rose-500 uppercase tracking-widest ml-2 flex items-center gap-2"><Lock size={14}/> Sandi Rahasia Admin</label>
                       <input type="text" value={settings.admin_password || ''} onChange={e => setSettings({...settings, admin_password: e.target.value})} className="w-full p-4 bg-rose-50/50 text-rose-900 rounded-3xl font-black border border-rose-200 focus:border-rose-400 focus:ring-4 focus:ring-rose-500/20 outline-none transition-all tracking-[0.5em] text-xl text-center"/>
                     </div>
                     
                     <button disabled={isProcessing} onClick={handleSaveSettings} className="w-full py-5 bg-slate-900 text-white rounded-[32px] font-black text-lg shadow-xl shadow-slate-300 hover:bg-slate-800 transition-all active:scale-95 mt-8 disabled:opacity-50">
                       {isProcessing ? 'MENYIMPAN...' : 'SIMPAN SEMUA PENGATURAN'}
                     </button>
                  </div>
               </div>
             )}
          </main>
        </div>
      );
      })()}
    </div>
  );
}

export default class App extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, errorInfo: null }; }
  static getDerivedStateFromError(error) { return { hasError: true }; }
  componentDidCatch(error, errorInfo) { 
    this.setState({ errorInfo: String(error) + '\n' + errorInfo.componentStack }); 
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', background: '#f87171', color: 'white', minHeight: '100vh', fontFamily: 'sans-serif' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: '900' }}>⚠️ Aplikasi Mengalami Crash Server</h1>
          <p style={{ marginTop: '10px', fontSize: '1.2rem' }}>Layar putih berhasil dihindari! Masalahnya ada pada kode di bawah ini:</p>
          <pre style={{ background: 'rgba(0,0,0,0.3)', padding: '20px', borderRadius: '10px', marginTop: '20px', whiteSpace: 'pre-wrap', fontWeight: 'bold' }}>
            {String(this.state.errorInfo)}
          </pre>
          <p style={{ marginTop: '20px' }}>*Screenshot layar ini dan kirimkan ke AI untuk segera diperbaiki.*</p>
        </div>
      );
    }
    return <MainApp />;
  }
}

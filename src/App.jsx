import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  Store, Search, Camera, X, ChevronRight, ArrowLeft, 
  CreditCard, QrCode, Copy, CheckCircle, AlertTriangle, 
  Lock, BarChart3, Package, Settings, LogOut, PlusCircle, Trash2, Download, Power, UploadCloud, Edit
} from 'lucide-react';

// =========================================================================
// PENGATURAN KONEKSI SUPABASE (ANTI-CRASH & FULL SECURITY BLUEPRINT)
// =========================================================================
let supabase = null;

const formatRupiah = (angka) => {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka || 0);
};

// MENDUKUNG GAMBAR BASE64 (UPLOAD LANGSUNG) DAN FALLBACK URL
const formatImageUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('data:image') || url.startsWith('blob:')) return url; 
  
  const driveMatch = url.match(/(?:file\/d\/|id=)([a-zA-Z0-9_-]+)/);
  if (driveMatch && driveMatch[1]) {
    return `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
  }
  
  if (url.includes('github.com') && url.includes('/blob/')) {
    return url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
  }
  
  return url;
};

// MENGGUNAKAN EMOJI AGAR RINGAN & 100% BEBAS ERROR
const getDynamicEmoji = (namaBarang) => {
  const name = (namaBarang || '').toLowerCase();
  if (name.match(/kopi|minum|teh|coca|susu|sirup|nutrisari|milo|jus/)) return "☕";
  if (name.match(/air|mineral|aqua|cleo|vit/)) return "💧";
  if (name.match(/roti|donat|bolu|brownies|bakpao|kue/)) return "🥐";
  if (name.match(/nasi|mie|lontong|soto|bakso|indomie/)) return "🍜";
  if (name.match(/daging|sapi|ayam|nugget|sosis/)) return "🥩";
  if (name.match(/ikan|lele|seafood|sarden/)) return "🐟";
  if (name.match(/sayur|bayam|wortel|tomat|cabe|bawang/)) return "🥕";
  if (name.match(/buah|apel|jeruk|pisang|mangga|melon/)) return "🍎";
  if (name.match(/garam|gula|merica|micin|bumbu|kecap|saus/)) return "🧂";
  if (name.match(/es|ice|krim|gelato/)) return "🍦";
  if (name.match(/permen|candy|yupi|kopiko/)) return "🍬";
  if (name.match(/wafer|tango|nabati|bengbeng/)) return "🍫";
  if (name.match(/oreo|biskuat|biskuit|malkist/)) return "🍪";
  if (name.match(/kacang|garuda|sukro|peanuts/)) return "🥜";
  if (name.match(/snack|chiki|keripik|camilan|lays/)) return "🍟";
  if (name.match(/obat|panadol|bodrex|vitamin/)) return "💊";
  if (name.match(/sabun|shampo|rinso|odol|deterjen/)) return "🧼";
  if (name.match(/rokok|korek|mancis|sampoerna|djarum/)) return "🚬";
  return "🛍️";
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
// KOMPONEN UTAMA APLIKASI (BLUEPRINT TERKUNCI)
// =========================================================================
function MainApp() {
  const [isSupabaseReady, setIsSupabaseReady] = useState(false);
  const [isLoadingDB, setIsLoadingDB] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState({ show: false, msg: '', type: 'success' });
  
  // STATE NAVIGASI PERSISTENT
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
  
  // STATE CRUD BARANG (TAMBAH & EDIT)
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null); // State baru untuk menyimpan ID barang yang diedit
  const [newProduct, setNewProduct] = useState({ nama: '', modal: 0, jual: 0, stok: 0, barcode: '', diskonQty: '', diskonHarga: '' });
  const [useDiskon, setUseDiskon] = useState(false);

  const showToast = (msg, type = 'success') => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast({ show: false, msg: '', type: 'success' }), 2500);
  };

  // SYSTEM PWA & NOTIFIKASI & FAVICON
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // 1. Meminta Izin Notifikasi
      if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
      }

      // 2. Ubah Favicon Toko
      let link = document.querySelector("link[rel~='icon']");
      if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
      link.href = "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🏪</text></svg>";

      // 3. Injeksi Web App Manifest (PWA) agar bisa di-install jadi App HP
      if (!document.querySelector('link[rel="manifest"]')) {
        const manifest = {
          name: "Toko Kejujuran",
          short_name: "Toko",
          display: "standalone",
          background_color: "#f8fafc",
          theme_color: "#059669",
          icons: [{ src: "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🏪</text></svg>", sizes: "192x192", type: "image/svg+xml", purpose: "any maskable" }]
        };
        const blob = new Blob([JSON.stringify(manifest)], {type: 'application/json'});
        const manifestLink = document.createElement('link');
        manifestLink.rel = 'manifest';
        manifestLink.href = URL.createObjectURL(blob);
        document.head.appendChild(manifestLink);
      }
    }
  }, []);

  useEffect(() => { try { localStorage.setItem('tokojujur_view', view); } catch(e){} }, [view]);
  useEffect(() => { try { localStorage.setItem('tokojujur_admintab', adminTab); } catch(e){} }, [adminTab]);

  // INISIALISASI SUPABASE
  useEffect(() => {
    const initSupabase = () => {
      try {
        const env = typeof import.meta !== 'undefined' ? import.meta.env : {};
        const url = env.VITE_SUPABASE_URL || '';
        const key = env.VITE_SUPABASE_ANON_KEY || '';
        if (url && key && window.supabase && !supabase) {
          supabase = window.supabase.createClient(url, key);
        }
      } catch(e) {}
      setIsSupabaseReady(true);
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

  useEffect(() => {
    if (!isSupabaseReady) return;
    if (!supabase) { setIsLoadingDB(false); return; }
    
    fetchData();
    const channel = supabase.channel('realtime-toko')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'produk' }, fetchProducts)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transaksi' }, fetchTransactions)
      .subscribe();
      
    return () => { supabase.removeChannel(channel); }
  }, [isSupabaseReady]);

  const fetchData = async () => {
    setIsLoadingDB(true);
    await Promise.all([fetchProducts(), fetchTransactions(), fetchSettings()]);
    setIsLoadingDB(false);
  };

  const fetchProducts = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('produk').select('*').order('id', { ascending: true });
    if (data) setProducts(data);
  };

  const fetchTransactions = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('transaksi').select('*').order('isoDate', { ascending: false });
    if (data) setTransactions(data);
  };

  const fetchSettings = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('pengaturan').select('*').eq('id', 1).single();
    if (data) {
      setSettings({
        nama_toko: data.nama_toko || 'Toko Kejujuran',
        qris_url: data.qris_url || '',
        rekening: data.rekening || '',
        admin_password: data.admin_password || ''
      });
    }
  };

  const handleCopyRekening = () => {
    const amanRekening = settings.rekening || '';
    const matchAngka = amanRekening.match(/\d+/);
    const textToCopy = matchAngka ? matchAngka[0] : amanRekening;
    
    if (navigator.clipboard && navigator.clipboard.writeText && textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      showToast('Rekening Disalin', 'success');
    } else if (textToCopy) {
      const textArea = document.createElement("textarea");
      textArea.value = textToCopy;
      document.body.appendChild(textArea);
      textArea.select();
      try { document.execCommand('copy'); showToast('Rekening Disalin', 'success'); } catch(e) {}
      document.body.removeChild(textArea);
    }
  };

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
      // Meminta resolusi HD & Continuous Focus untuk akurasi tinggi
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
          advanced: [{ focusMode: "continuous" }]
        } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      streamRef.current = stream;
    } catch (err) {
      showToast('Akses kamera ditolak atau perangkat tidak mendukung.', 'error');
      setIsScanningModalOpen(false);
    }
  };

  const stopScanner = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
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
    showToast('Barcode Terbaca! Mencari nama produk di internet...', 'success');
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`);
      const data = await res.json();
      if (data.status === 1 && data.product && data.product.product_name) {
        setNewProduct(prev => ({ ...prev, nama: data.product.product_name }));
        showToast('Nama otomatis berhasil terisi!', 'success');
      } else {
        showToast('Barcode terbaca. Silakan ketik nama manual.', 'success');
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
              if (scanTarget === 'toko') {
                handleBarcodeResultToko(code);
              } else {
                handleBarcodeResultAdmin(code);
              }
            }
          } catch (e) {}
        }
      }, 400); // Lakukan pembacaan sangat cepat tiap 0.4 detik
    }
    return () => clearInterval(interval);
  }, [isScanningModalOpen, scanTarget, products]);

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

  const handleSelesaiBayar = async () => {
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
      id: `TRX-${Date.now()}`, tanggal: new Date().toLocaleString('id-ID'), isoDate: new Date().toISOString(), 
      items: detailPesanan, total: totalBelanja, modal: totalModal, 
      profit: totalBelanja - totalModal, metode: metodeBayar 
    };
    
    setTransactions(prev => [newTransaction, ...prev]);
    setProducts(prev => prev.map(prod => {
      const boughtItem = detailPesanan.find(i => i.id === prod.id);
      return boughtItem ? { ...prod, stok: (prod.stok || 0) - boughtItem.qty } : prod;
    }));
    
    setStrukTerakhir(newTransaction);
    setView('struk');
    setIsProcessing(false);

    if (supabase) {
      supabase.from('transaksi').insert([newTransaction]).then();
      detailPesanan.forEach(item => {
        const prod = products.find(p => p.id === item.id);
        if (prod) supabase.from('produk').update({ stok: (prod.stok || 0) - item.qty }).eq('id', item.id).then();
      });
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

  // ADMIN FUNCTIONS
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

  // FUNGSI UPLOAD & DOWNLOAD QRIS
  const handleUploadQRIS = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 1048576) { 
        showToast('Ukuran gambar terlalu besar. Maksimal 1MB.', 'error');
        return;
      }
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
    setIsProcessing(true);
    if (supabase) {
      await supabase.from('pengaturan').update({
        nama_toko: settings.nama_toko,
        qris_url: settings.qris_url,
        rekening: settings.rekening,
        admin_password: settings.admin_password
      }).eq('id', 1);
    }
    setIsProcessing(false);
    showToast('Pengaturan Disimpan', 'success');
  };

  // SYSTEM TOLAK BARANG GANDA & CRUD LENGKAP (ADD / EDIT)
  const handleEditClick = (product) => {
    setNewProduct({
      nama: product.nama,
      modal: product.modal || 0,
      jual: product.jual || 0,
      stok: product.stok || 0,
      barcode: product.barcode || '',
      diskonQty: product.diskon ? product.diskon.min_qty : '',
      diskonHarga: product.diskon ? product.diskon.harga_total : ''
    });
    setUseDiskon(!!product.diskon);
    setEditingId(product.id);
    setShowAddForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' }); // Gulir otomatis ke form atas
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    
    // Cek Toleransi Barang Ganda (Anti-Duplicate)
    const isDuplicate = products.some(p => {
      const isNameSame = p.nama.toLowerCase().trim() === newProduct.nama.toLowerCase().trim();
      const isBarcodeSame = newProduct.barcode && p.barcode === newProduct.barcode;
      // Jika mode Edit, abaikan barang yang sedang di-edit itu sendiri
      if (editingId && p.id === editingId) return false;
      
      return isNameSame || isBarcodeSame;
    });

    if (isDuplicate) {
      showToast('GAGAL: Nama Barang atau Barcode sudah terdaftar!', 'error');
      return;
    }

    let disc = null;
    if (useDiskon) disc = { min_qty: parseInt(newProduct.diskonQty) || 1, harga_total: parseInt(newProduct.diskonHarga) || 0 };
    
    const targetId = editingId ? editingId : Date.now();
    const tempProd = { 
      ...newProduct, modal: newProduct.modal||0, jual: newProduct.jual||0, stok: newProduct.stok||0,
      id: targetId, diskon: disc, tanggal_dibuat: new Date().toISOString() 
    };
    
    // Tampilkan di UI secara Optimistic
    if (editingId) {
       setProducts(p => p.map(item => item.id === editingId ? tempProd : item));
       showToast('Barang Diperbarui', 'success');
    } else {
       setProducts(p => [...p, tempProd]);
       showToast('Barang Ditambahkan', 'success');
    }

    // Reset Form
    setShowAddForm(false);
    setEditingId(null);
    setNewProduct({ nama: '', modal: 0, jual: 0, stok: 0, barcode: '', diskonQty: '', diskonHarga: '' });
    setUseDiskon(false);
    
    if (supabase) {
      if (editingId) {
        const { error } = await supabase.from('produk').update({
          nama: tempProd.nama, barcode: tempProd.barcode, modal: tempProd.modal, 
          jual: tempProd.jual, stok: tempProd.stok, diskon: tempProd.diskon 
        }).eq('id', editingId);
        if (!error) fetchProducts();
      } else {
        const { error } = await supabase.from('produk').insert([{ 
          nama: tempProd.nama, barcode: tempProd.barcode, modal: tempProd.modal, 
          jual: tempProd.jual, stok: tempProd.stok, diskon: tempProd.diskon 
        }]);
        if (!error) fetchProducts(); 
      }
    }
  };

  const handleDeleteProduct = async (id) => {
    if(window.confirm("Yakin ingin menghapus barang ini secara permanen?")) {
       setProducts(prev => prev.filter(item => item.id !== id));
       showToast('Barang Dihapus', 'success');
       if(supabase) {
         await supabase.from('produk').delete().eq('id', id);
       }
    }
  };

  const handleClearAllProducts = async () => {
    if (window.confirm("PERINGATAN SANGAT PENTING!\n\nApakah Anda benar-benar yakin ingin MENGHAPUS SELURUH BARANG TOKO?\n\nData yang dihapus TIDAK BISA DIKEMBALIKAN!")) {
      setIsProcessing(true);
      setProducts([]);
      showToast('Seluruh daftar barang telah dihapus!', 'success');
      if (supabase) {
         await supabase.from('produk').delete().neq('id', '0');
         fetchProducts();
      }
      setIsProcessing(false);
    }
  };

  // FUNGSI MENGHAPUS SEMUA DATA TRANSAKSI (DATA UJI COBA)
  const handleClearTransactions = async () => {
    if (window.confirm("PERINGATAN SANGAT PENTING!\n\nApakah Anda benar-benar yakin ingin MENGHAPUS SELURUH RIWAYAT TRANSAKSI PENJUALAN (Data Uji Coba)?\n\nData yang dihapus TIDAK BISA DIKEMBALIKAN!")) {
      setIsProcessing(true);
      setTransactions([]);
      showToast('Seluruh riwayat transaksi telah dihapus!', 'success');
      if (supabase) {
         await supabase.from('transaksi').delete().neq('id', '0');
         fetchTransactions();
      }
      setIsProcessing(false);
    }
  };

  const handleExportCSV = () => {
    const filteredForExport = transactions.filter(t => {
      if (!filterStart && !filterEnd) return true;
      const tDate = new Date(t.isoDate);
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

  if (!isSupabaseReady) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center font-sans"></div>;
  }

  if (!supabase) {
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

      {/* VIEW: TOKO (HALAMAN DEPAN) */}
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
              <button 
                 onClick={() => startScanner('toko')} 
                 className="bg-slate-800 text-white p-3 rounded-xl cursor-pointer hover:bg-slate-700 transition active:scale-95 flex items-center shadow-lg"
                 title="Scan Langsung via Kamera"
              >
                 <Camera size={24}/>
              </button>
            </div>
          </header>

          <main className="p-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 max-w-5xl mx-auto">
            {searchFilteredProducts.map(p => (
              <div key={p.id} onClick={() => openProductModal(p)} className="bg-white p-4 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col items-center text-center relative active:scale-95 transition-all group hover:shadow-md cursor-pointer border-b-4 border-b-slate-100">
                {cart[p.id] > 0 && <div className="absolute top-2 right-2 bg-emerald-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg">{cart[p.id]}</div>}
                <div className="mb-4 bg-slate-50 p-3 rounded-2xl text-4xl group-hover:bg-emerald-50 transition-colors">{getDynamicEmoji(p.nama)}</div>
                <h3 className="font-bold text-sm mb-1 line-clamp-2 h-10 text-slate-700">{p.nama}</h3>
                <p className="text-emerald-600 font-black mb-2 text-lg">{formatRupiah(p.jual)}</p>
                <div className={`text-[10px] font-black px-2 py-0.5 rounded-full ${(p.stok||0) > 5 ? 'bg-blue-50 text-blue-500' : 'bg-rose-50 text-rose-500'}`}>Sisa: {p.stok || 0}</div>
              </div>
            ))}
          </main>

          {selectedProduct && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-4 animate-fade-in">
              <div className="bg-white w-full max-w-md rounded-[32px] p-8 shadow-2xl animate-slide-up border-4 border-white">
                <div className="flex justify-between items-center mb-8">
                   <div className="flex items-center gap-4">
                     <div className="p-4 bg-slate-50 rounded-2xl text-4xl">{getDynamicEmoji(selectedProduct.nama)}</div>
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
                <button onClick={saveToCart} className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black text-xl shadow-xl active:scale-95 transition-all">Simpan ke Keranjang</button>
              </div>
            </div>
          )}

          {Object.keys(cart).length > 0 && !selectedProduct && (
            <div className="fixed bottom-6 left-4 right-4 z-50 max-w-md mx-auto">
              <button onClick={() => setView('checkout')} className="w-full bg-emerald-600 text-white p-5 rounded-[2rem] shadow-2xl flex justify-between items-center active:scale-95 transition-all border-4 border-emerald-500/20">
                <div className="text-left"><p className="text-[10px] opacity-80 font-black uppercase tracking-widest mb-1">Total Belanja</p><p className="text-2xl font-black">{formatRupiah(totalBelanja)}</p></div>
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
          <div className="bg-slate-900 text-white p-10 rounded-[40px] mb-8 shadow-2xl relative overflow-hidden">
             <div className="absolute -top-10 -right-10 opacity-10 rotate-12"><CreditCard size={150}/></div>
             <p className="text-xs opacity-50 font-black uppercase tracking-widest mb-2">Tagihan Anda</p>
             <h2 className="text-5xl font-black tracking-tighter">{formatRupiah(totalBelanja)}</h2>
          </div>
          <h3 className="font-black text-lg mb-4 ml-1 text-slate-800">Pilih Pembayaran:</h3>
          <div className="space-y-4 mb-10">
             <button onClick={() => setMetodeBayar('qris')} className={`w-full p-6 rounded-3xl border-2 flex items-center gap-5 transition-all ${metodeBayar==='qris' ? 'border-emerald-500 bg-emerald-50 shadow-inner' : 'border-slate-100 bg-white hover:border-slate-200'}`}><QrCode className="text-emerald-600" size={32}/> <div className="text-left font-black text-lg">QRIS Cepat</div></button>
             <button onClick={() => setMetodeBayar('transfer')} className={`w-full p-6 rounded-3xl border-2 flex items-center gap-5 transition-all ${metodeBayar==='transfer' ? 'border-blue-500 bg-blue-50 shadow-inner' : 'border-slate-100 bg-white hover:border-slate-200'}`}><CreditCard className="text-blue-600" size={32}/> <div className="text-left font-black text-lg">Transfer Bank</div></button>
          </div>

          {metodeBayar === 'qris' && (
             <div className="p-8 bg-white rounded-[40px] border-2 border-slate-50 shadow-sm mb-10 text-center animate-fade-in flex flex-col items-center">
               {settings.qris_url ? (
                 <img src={formatImageUrl(settings.qris_url)} className="w-64 h-64 mx-auto mb-6 border p-4 rounded-3xl shadow-sm object-contain bg-white" alt="QRIS Pembayaran"/>
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

          <button onClick={handleSelesaiBayar} disabled={!metodeBayar || isProcessing} className="mt-auto w-full py-6 bg-slate-900 text-white rounded-3xl font-black text-2xl shadow-xl disabled:opacity-30 active:scale-95 transition-all">Selesai Membayar</button>
        </div>
      )}

      {/* VIEW: STRUK */}
      {view === 'struk' && (
        <div className="min-h-screen bg-emerald-600 flex flex-col items-center justify-center p-8 text-white text-center">
           <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mb-6 backdrop-blur-sm animate-bounce"><CheckCircle size={56}/></div>
           <h1 className="text-4xl font-black mb-3 tracking-tighter uppercase">Berhasil!</h1>
           <p className="mb-10 opacity-90 font-bold text-lg leading-tight">Terima kasih atas kejujuran Anda.<br/>Semoga berkah!</p>
           <div className="bg-white text-slate-900 w-full max-w-sm rounded-[40px] p-10 shadow-2xl relative border-b-8 border-slate-100">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-24 h-8 bg-slate-200 rounded-full shadow-inner"></div>
              <h2 className="font-black text-2xl mb-8 border-b-2 border-slate-50 pb-6 text-emerald-600">{settings.nama_toko}</h2>
              <div className="space-y-4 mb-8">
                {strukTerakhir?.items?.map(i => (
                  <div key={i.id} className="flex justify-between text-sm font-bold text-slate-600 text-left gap-4">
                    <span className="truncate">{i.qty}x {i.nama}</span><span className="text-slate-900 whitespace-nowrap">{formatRupiah(i.totalHarga)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center pt-6 border-t-4 border-slate-50 border-dotted"><span className="font-black opacity-30 uppercase text-[10px] tracking-widest">Total Bayar</span> <span className="text-3xl font-black text-emerald-600">{formatRupiah(strukTerakhir?.total)}</span></div>
           </div>
           <button onClick={handleTutupStruk} className="mt-12 px-16 py-5 bg-white text-emerald-700 rounded-full font-black text-xl shadow-2xl hover:scale-110 active:scale-95 transition-all">KEMBALI KE TOKO</button>
        </div>
      )}

      {/* VIEW: ADMIN LOGIN */}
      {view === 'admin' && !isAdminLogged && (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-100">
          <form onSubmit={handleLogin} className="bg-white p-12 rounded-[50px] shadow-2xl w-full max-w-sm border-4 border-white text-center">
            <div className="w-20 h-20 bg-slate-50 text-slate-400 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-inner"><Lock size={40}/></div>
            <h2 className="text-3xl font-black mb-2 text-slate-800 tracking-tighter uppercase">Panel Admin</h2>
            <input type="password" placeholder="••••••" value={loginInput} onChange={e => setLoginInput(e.target.value)} className="w-full p-5 bg-slate-50 rounded-3xl mb-6 outline-none focus:ring-4 focus:ring-emerald-500/20 text-center font-black text-2xl tracking-widest border border-slate-100 mt-6" autoFocus/>
            <button className="w-full py-5 bg-emerald-600 text-white rounded-3xl font-black text-xl shadow-lg shadow-emerald-200 active:scale-95 transition-all">Buka Panel</button>
            <button type="button" onClick={() => setView('toko')} className="mt-6 text-slate-400 font-black text-xs uppercase tracking-widest hover:text-slate-600 transition">Kembali ke Toko</button>
          </form>
        </div>
      )}

      {/* VIEW: ADMIN DASHBOARD */}
      {view === 'admin' && isAdminLogged && (() => {
        const filteredTransactions = transactions.filter(t => {
          if (!filterStart && !filterEnd) return true;
          const tDate = new Date(t.isoDate);
          const sDate = filterStart ? new Date(filterStart) : new Date(0);
          let eDate = filterEnd ? new Date(filterEnd) : new Date('2100-01-01');
          if (filterEnd) eDate.setHours(23, 59, 59, 999);
          return tDate >= sDate && tDate <= eDate;
        });

        const totalPendapatanKotor = filteredTransactions.reduce((sum, t) => sum + (t.total || 0), 0);
        const totalKeuntunganBersih = filteredTransactions.reduce((sum, t) => sum + (t.profit || 0), 0);

        return (
          <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 relative">
            {/* ADMIN SIDEBAR (STICKY/FREEZE) */}
            <aside className="w-full md:w-72 bg-slate-950 text-white p-4 md:p-8 flex flex-row md:flex-col gap-2 md:gap-3 shadow-2xl sticky top-0 z-40 overflow-x-auto md:overflow-x-visible md:overflow-y-auto md:h-screen scrollbar-hide shrink-0">
              <div className="hidden md:flex items-center gap-3 mb-12 flex-shrink-0">
                 <div className="p-3 bg-emerald-500 rounded-2xl shadow-lg shadow-emerald-500/20"><Settings size={28}/></div>
                 <h2 className="font-black text-2xl tracking-tighter uppercase">Admin Panel</h2>
              </div>
              <button onClick={() => {setAdminTab('analisa'); setEditingId(null); setShowAddForm(false);}} className={`flex items-center gap-3 p-4 md:p-5 rounded-2xl font-black transition-all whitespace-nowrap flex-shrink-0 ${adminTab==='analisa' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'text-slate-500 hover:bg-slate-800 hover:text-white'}`}><BarChart3 size={20} className="md:w-6 md:h-6"/> <span className="text-sm md:text-base">Analisa Penjualan</span></button>
              <button onClick={() => {setAdminTab('barang'); setEditingId(null); setShowAddForm(false);}} className={`flex items-center gap-3 p-4 md:p-5 rounded-2xl font-black transition-all whitespace-nowrap flex-shrink-0 ${adminTab==='barang' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'text-slate-500 hover:bg-slate-800 hover:text-white'}`}><Package size={20} className="md:w-6 md:h-6"/> <span className="text-sm md:text-base">Manajemen Barang</span></button>
              <button onClick={() => {setAdminTab('pengaturan'); setEditingId(null); setShowAddForm(false);}} className={`flex items-center gap-3 p-4 md:p-5 rounded-2xl font-black transition-all whitespace-nowrap flex-shrink-0 ${adminTab==='pengaturan' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'text-slate-500 hover:bg-slate-800 hover:text-white'}`}><Settings size={20} className="md:w-6 md:h-6"/> <span className="text-sm md:text-base">Pengaturan Toko</span></button>
              <button onClick={handleLogout} className="md:mt-auto flex items-center gap-3 p-4 md:p-5 rounded-2xl font-black text-rose-500 hover:bg-rose-500/10 transition-all text-left whitespace-nowrap flex-shrink-0"><LogOut size={20} className="md:w-6 md:h-6"/> <span className="text-sm md:text-base">Keluar (Logout)</span></button>
            </aside>
            
            <main className="flex-1 p-4 md:p-12 overflow-y-auto">
               
               {/* TAB: ANALISA PENJUALAN */}
               {adminTab === 'analisa' && (
                 <div className="animate-fade-in max-w-6xl mx-auto">
                    <div className="flex flex-col xl:flex-row justify-between xl:items-center mb-8 md:mb-12 gap-6">
                      <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-slate-800">Ikhtisar Penjualan</h1>
                      <div className="flex flex-col md:flex-row gap-4 w-full xl:w-auto">
                        <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm w-full md:w-auto">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Filter:</span>
                          <input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)} className="bg-slate-50 px-3 py-2 rounded-xl text-sm font-bold outline-none text-slate-700 focus:ring-2 focus:ring-emerald-500 border border-slate-100 flex-1 md:flex-none"/>
                          <span className="text-slate-300 font-black hidden md:inline">-</span>
                          <input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} className="bg-slate-50 px-3 py-2 rounded-xl text-sm font-bold outline-none text-slate-700 focus:ring-2 focus:ring-emerald-500 border border-slate-100 flex-1 md:flex-none"/>
                          {(filterStart || filterEnd) && <button onClick={() => {setFilterStart(''); setFilterEnd('');}} className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-500 rounded-xl transition-colors w-full md:w-auto mt-2 md:mt-0"><X size={16} className="mx-auto"/></button>}
                        </div>
                        <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                          <button onClick={handleExportCSV} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black flex items-center justify-center gap-3 shadow-xl hover:bg-slate-800 active:scale-95 transition-all w-full md:w-auto"><Download size={20}/> EXPORT EXCEL</button>
                          <button onClick={handleClearTransactions} disabled={isProcessing} className="bg-rose-600 text-white px-8 py-4 rounded-2xl font-black flex items-center justify-center gap-3 shadow-xl hover:bg-rose-700 active:scale-95 transition-all w-full md:w-auto"><Trash2 size={20}/> HAPUS DATA UJI COBA</button>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 mb-8 md:mb-12">
                       <div className="bg-white p-6 md:p-8 rounded-[40px] border border-slate-100 shadow-sm"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Total Omset</p><p className="text-3xl font-black text-slate-800">{formatRupiah(totalPendapatanKotor)}</p></div>
                       <div className="bg-emerald-600 p-6 md:p-8 rounded-[40px] text-white shadow-2xl shadow-emerald-200"><p className="text-[10px] font-black opacity-60 uppercase tracking-widest mb-3">Profit Bersih</p><p className="text-3xl font-black">{formatRupiah(totalKeuntunganBersih)}</p></div>
                       <div className="bg-white p-6 md:p-8 rounded-[40px] border border-slate-100 shadow-sm"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Total Transaksi</p><p className="text-3xl font-black text-slate-800">{filteredTransactions.length}</p></div>
                    </div>
                    <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left min-w-[700px]">
                           <thead className="bg-slate-50 border-b-2 border-slate-100"><tr className="text-[10px] font-black uppercase text-slate-400 tracking-widest"><th className="p-6">ID & Tanggal</th><th className="p-6">Total Belanja</th><th className="p-6 text-emerald-600">Keuntungan</th><th className="p-6 text-center">Metode</th></tr></thead>
                           <tbody className="divide-y divide-slate-50">
                             {filteredTransactions.length === 0 && <tr><td colSpan="4" className="p-6 text-center text-slate-400 font-bold">Belum ada data transaksi pada filter tersebut.</td></tr>}
                             {filteredTransactions.slice().reverse().map(t => (
                               <tr key={t.id} className="text-sm font-bold text-slate-700 hover:bg-slate-50/50 transition-colors">
                                 <td className="p-6">
                                   <span className="block text-slate-900 mb-1">{t.id}</span>
                                   <span className="text-xs text-slate-400">{t.tanggal}</span>
                                 </td>
                                 <td className="p-6">{formatRupiah(t.total)}</td>
                                 <td className="p-6 text-emerald-600">{formatRupiah(t.profit)}</td>
                                 <td className="p-6 text-center uppercase text-[10px]"><span className="bg-slate-100 px-3 py-1.5 rounded-xl font-black text-slate-500">{t.metode}</span></td>
                               </tr>
                             ))}
                           </tbody>
                        </table>
                      </div>
                    </div>
                 </div>
               )}

               {/* TAB: MANAJEMEN BARANG (CRUD FULL) */}
               {adminTab === 'barang' && (
                 <div className="animate-fade-in max-w-6xl mx-auto">
                    <div className="flex flex-col md:flex-row justify-between md:items-center mb-8 md:mb-12 gap-4">
                      <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-slate-800">Daftar Barang</h1>
                      <div className="flex flex-col md:flex-row gap-2">
                        <button onClick={handleClearAllProducts} className="bg-rose-100 text-rose-600 px-6 py-4 rounded-2xl font-black flex items-center justify-center gap-3 shadow-sm hover:bg-rose-200 active:scale-95 transition-all uppercase w-full md:w-auto"><Trash2 size={20}/> Hapus Semua</button>
                        <button onClick={() => { setEditingId(null); setNewProduct({ nama: '', modal: 0, jual: 0, stok: 0, barcode: '', diskonQty: '', diskonHarga: '' }); setUseDiskon(false); setShowAddForm(!showAddForm); }} className="bg-emerald-600 text-white px-8 py-4 rounded-2xl font-black flex items-center justify-center gap-3 shadow-xl shadow-emerald-100 hover:bg-emerald-500 active:scale-95 transition-all uppercase w-full md:w-auto">{showAddForm ? <X/> : <PlusCircle/>} {showAddForm ? 'Tutup Form' : 'Tambah Barang'}</button>
                      </div>
                    </div>

                    {showAddForm && (
                      <form onSubmit={handleAddProduct} className={`p-6 md:p-8 rounded-[40px] border shadow-sm mb-8 md:mb-12 grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6 animate-slide-up ${editingId ? 'bg-blue-50 border-blue-100' : 'bg-white border-slate-100'}`}>
                         <h3 className="md:col-span-4 font-black text-slate-800 mb-2 flex items-center gap-2">
                           {editingId ? <><Edit className="text-blue-600"/> Edit Data Barang</> : <><PlusCircle className="text-emerald-600"/> Input Barang Baru</>}
                         </h3>
                         <div className="md:col-span-2">
                           <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block tracking-widest ml-1">Nama Produk</label>
                           <input required value={newProduct.nama} onChange={e => setNewProduct({...newProduct, nama: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-none focus:ring-4 focus:ring-emerald-500/20 outline-none transition-all shadow-inner"/>
                         </div>
                         <div className="md:col-span-2">
                           <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block tracking-widest ml-1">Barcode (Pindai Otomatis)</label>
                           <div className="flex gap-2">
                             <input value={newProduct.barcode} onChange={e => setNewProduct({...newProduct, barcode: e.target.value})} className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-none focus:ring-4 focus:ring-emerald-500/20 outline-none transition-all shadow-inner" placeholder="Bisa ketik manual / Scan kamera"/>
                             <button type="button" onClick={() => startScanner('admin')} className="bg-slate-900 text-white p-4 rounded-2xl cursor-pointer hover:bg-slate-800 transition flex justify-center items-center shadow-md active:scale-95" title="Scan via Kamera HP"><Camera size={24}/></button>
                           </div>
                         </div>
                         <div>
                           <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block tracking-widest ml-1">Modal Beli (Rp)</label>
                           <input required type="number" value={newProduct.modal || ''} onChange={e => setNewProduct({...newProduct, modal: parseInt(e.target.value)})} className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-none focus:ring-4 focus:ring-emerald-500/20 outline-none transition-all shadow-inner"/>
                         </div>
                         <div>
                           <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block tracking-widest ml-1">Harga Jual Satuan (Rp)</label>
                           <input required type="number" value={newProduct.jual || ''} onChange={e => setNewProduct({...newProduct, jual: parseInt(e.target.value)})} className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-none focus:ring-4 focus:ring-emerald-500/20 outline-none transition-all shadow-inner"/>
                         </div>
                         <div className="md:col-span-2">
                           <label className="text-[10px] font-black uppercase text-slate-400 mb-2 block tracking-widest ml-1">Stok Fisik Awal</label>
                           <input required type="number" value={newProduct.stok || ''} onChange={e => setNewProduct({...newProduct, stok: parseInt(e.target.value)})} className="w-full p-4 bg-slate-50 rounded-2xl font-bold border-none focus:ring-4 focus:ring-emerald-500/20 outline-none transition-all shadow-inner"/>
                         </div>
                         <div className="flex items-center gap-3 pt-4 md:pt-6 ml-1 md:col-span-4">
                           <input type="checkbox" checked={useDiskon} onChange={e => setUseDiskon(e.target.checked)} className="w-6 h-6 accent-emerald-600 rounded-lg cursor-pointer"/>
                           <span className="font-black text-xs text-slate-500 uppercase tracking-widest cursor-pointer" onClick={() => setUseDiskon(!useDiskon)}>Aktifkan Harga Grosir?</span>
                         </div>
                         {useDiskon && (
                           <div className="flex flex-col md:flex-row gap-4 md:col-span-4 animate-fade-in bg-orange-50 p-6 rounded-3xl shadow-sm border border-orange-100">
                             <div className="w-full md:w-1/2">
                               <label className="text-[10px] font-black uppercase text-orange-600 mb-2 block tracking-widest ml-1">Minimal Beli (Qty)</label>
                               <input type="number" value={newProduct.diskonQty} onChange={e => setNewProduct({...newProduct, diskonQty: e.target.value})} className="w-full p-4 bg-white rounded-2xl border-none outline-none font-bold text-orange-900 focus:ring-4 focus:ring-orange-500/20 shadow-sm" placeholder="Contoh: 3"/>
                             </div>
                             <div className="w-full md:w-1/2">
                               <label className="text-[10px] font-black uppercase text-orange-600 mb-2 block tracking-widest ml-1">Total Harga Grosir (Bukan Satuan)</label>
                               <input type="number" value={newProduct.diskonHarga} onChange={e => setNewProduct({...newProduct, diskonHarga: e.target.value})} className="w-full p-4 bg-white rounded-2xl border-none outline-none font-bold text-orange-900 focus:ring-4 focus:ring-orange-500/20 shadow-sm" placeholder="Contoh: 10000"/>
                             </div>
                           </div>
                         )}
                         <button className={`text-white py-5 rounded-[24px] font-black text-lg md:col-span-4 mt-2 transition-all active:scale-[0.98] shadow-xl ${editingId ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-900 hover:bg-slate-800'}`}>
                           {editingId ? 'UPDATE BARANG & SINKRONISASI' : 'SIMPAN BARANG & SINKRONISASI'}
                         </button>
                    </form>
                  )}

                  <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left min-w-[700px]">
                         <thead className="bg-slate-50 border-b-2 border-slate-100">
                           <tr className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                             <th className="p-6">Data Produk</th>
                             <th className="p-6 text-center">Stok</th>
                             <th className="p-6">Harga Jual</th>
                             <th className="p-6 text-center">Aksi (CRUD)</th>
                           </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-50">
                           {products.length === 0 && <tr><td colSpan="4" className="p-6 text-center text-slate-400 font-bold">Barang masih kosong.</td></tr>}
                           {products.map(p => (
                             <tr key={p.id} className={`text-sm font-bold transition-colors ${editingId === p.id ? 'bg-blue-50' : 'hover:bg-slate-50 text-slate-700'}`}>
                               <td className="p-6 flex items-center gap-4">
                                 <div className="p-3 bg-white rounded-2xl border shadow-sm text-2xl flex items-center justify-center shrink-0">{getDynamicEmoji(p.nama)}</div>
                                 <div className="min-w-0">
                                   <p className="font-bold text-slate-900 truncate">{p.nama}</p>
                                   {p.barcode ? <p className="font-mono text-[10px] text-slate-400 mt-1 uppercase tracking-wider">{p.barcode}</p> : <p className="text-[10px] text-slate-300 mt-1 italic">No Barcode</p>}
                                 </div>
                               </td>
                               <td className="p-6 text-center">
                                 <span className={`px-4 py-2 rounded-2xl text-[10px] font-black ${p.stok < 5 ? 'bg-rose-100 text-rose-500' : 'bg-slate-100 text-slate-500'}`}>{p.stok || 0} UNIT</span>
                               </td>
                               <td className="p-6 text-emerald-600 font-black">
                                 {formatRupiah(p.jual)}
                                 {p.diskon && <div className="text-[10px] text-orange-500 font-black mt-1 bg-orange-50 px-2 py-1 rounded w-max border border-orange-100">Grosir: {p.diskon.min_qty} = {formatRupiah(p.diskon.harga_total)}</div>}
                               </td>
                               <td className="p-6 text-center">
                                 <div className="flex items-center justify-center gap-2">
                                   <button onClick={() => handleEditClick(p)} className="p-3 text-blue-500 hover:bg-blue-100 hover:text-blue-700 rounded-2xl transition-all" title="Edit Barang"><Edit size={20}/></button>
                                   <button onClick={() => handleDeleteProduct(p.id)} className="p-3 text-rose-400 hover:bg-rose-100 hover:text-rose-600 rounded-2xl transition-all" title="Hapus Barang"><Trash2 size={20}/></button>
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
               <div className="max-w-2xl animate-fade-in mx-auto md:mx-0">
                  <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-slate-800 mb-8 md:mb-12">Konfigurasi Toko</h1>
                  <div className="bg-white p-6 md:p-10 rounded-[40px] md:rounded-[50px] border border-slate-100 shadow-sm space-y-8">
                     
                     <div className="space-y-3">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Nama Toko Digital</label>
                       <input value={settings.nama_toko || ''} onChange={e => setSettings({...settings, nama_toko: e.target.value})} className="w-full p-4 md:p-5 bg-slate-50 rounded-3xl font-black border-none focus:ring-4 focus:ring-emerald-500/20 outline-none shadow-inner transition-all text-lg md:text-xl"/>
                     </div>

                     <hr className="border-slate-100"/>
                     
                     {/* FITUR BARU: UPLOAD & DOWNLOAD QRIS */}
                     <div className="space-y-3">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2"><QrCode size={14}/> Foto QRIS Pembayaran</label>
                       <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 bg-slate-50 p-6 rounded-3xl shadow-inner">
                         
                         {/* Kolom Preview */}
                         <div className="flex flex-col items-center gap-3">
                           <div className="w-40 h-40 shrink-0 bg-white rounded-3xl border-2 border-dashed border-emerald-200 flex items-center justify-center p-2 overflow-hidden shadow-sm relative">
                             {settings.qris_url ? (
                               <img src={formatImageUrl(settings.qris_url)} className="w-full h-full object-contain" alt="QRIS Preview"/>
                             ) : (
                               <span className="text-xs text-slate-400 font-bold text-center">Belum ada QRIS</span>
                             )}
                           </div>
                           <button onClick={handleDownloadQRIS} className="text-[10px] font-black bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-full transition-colors uppercase tracking-widest flex items-center gap-2">
                             <Download size={14}/> Simpan QRIS
                           </button>
                         </div>

                         {/* Kolom Input */}
                         <div className="flex-1 w-full space-y-4">
                           <label className="w-full flex items-center justify-center gap-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 hover:text-emerald-800 p-4 rounded-2xl font-bold cursor-pointer transition-all active:scale-95 border border-emerald-200">
                             <UploadCloud size={20}/> Upload dari Galeri/File
                             <input type="file" accept="image/*" className="hidden" onChange={handleUploadQRIS} />
                           </label>
                           <div className="flex items-center gap-2">
                             <div className="h-[1px] bg-slate-200 flex-1"></div>
                             <span className="text-[10px] font-black text-slate-400 uppercase">ATAU</span>
                             <div className="h-[1px] bg-slate-200 flex-1"></div>
                           </div>
                           <input placeholder="Paste Link Gambar (G-Drive/GitHub)" value={settings.qris_url || ''} onChange={e => setSettings({...settings, qris_url: e.target.value})} className="w-full p-4 bg-white rounded-2xl font-bold border-none focus:ring-4 focus:ring-emerald-500/20 outline-none shadow-sm text-xs md:text-sm"/>
                         </div>
                       </div>
                     </div>

                     <hr className="border-slate-100"/>
                     
                     <div className="space-y-3">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2"><CreditCard size={14}/> Info Rekening Manual</label>
                       <input value={settings.rekening || ''} onChange={e => setSettings({...settings, rekening: e.target.value})} className="w-full p-4 md:p-5 bg-slate-50 rounded-3xl font-bold border-none focus:ring-4 focus:ring-emerald-500/20 outline-none shadow-inner transition-all text-sm"/>
                       <p className="text-[10px] text-slate-400 font-semibold ml-2 italic">Format saran: NAMA BANK [SPASI] NO REKENING [SPASI] a.n NAMA PEMILIK. Contoh: BCA 123456789 a.n Budi</p>
                     </div>
                     
                     <hr className="border-slate-100"/>

                     <div className="space-y-3">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 text-rose-500 flex items-center gap-2"><Lock size={14}/> Sandi Rahasia Admin</label>
                       <input type="text" value={settings.admin_password || ''} onChange={e => setSettings({...settings, admin_password: e.target.value})} className="w-full p-4 md:p-5 bg-rose-50/30 text-rose-900 rounded-3xl font-black border-2 border-rose-100 focus:border-rose-400 outline-none shadow-sm transition-all tracking-[0.5em] text-lg md:text-xl text-center"/>
                     </div>
                     
                     <button onClick={handleSaveSettings} className="w-full py-5 md:py-6 bg-emerald-600 text-white rounded-[32px] font-black text-lg md:text-xl shadow-2xl shadow-emerald-100 hover:bg-emerald-500 transition-all active:scale-95 mt-8">SIMPAN KE DATABASE</button>
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

// BUNGKUS DENGAN ERROR BOUNDARY AGAR TIDAK BLANK PAGE
export default class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, errorInfo: null }; }
  static getDerivedStateFromError(error) { return { hasError: true }; }
  componentDidCatch(error, errorInfo) { this.setState({ errorInfo: error.toString() }); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', background: '#f87171', color: 'white', minHeight: '100vh', fontFamily: 'sans-serif' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: '900' }}>⚠️ Aplikasi Mengalami Crash Server</h1>
          <p style={{ marginTop: '10px', fontSize: '1.2rem' }}>Layar putih berhasil dihindari! Masalahnya ada pada kode di bawah ini:</p>
          <pre style={{ background: 'rgba(0,0,0,0.3)', padding: '20px', borderRadius: '10px', marginTop: '20px', whiteSpace: 'pre-wrap', fontWeight: 'bold' }}>
            {this.state.errorInfo}
          </pre>
          <p style={{ marginTop: '20px' }}>*Screenshot layar ini dan kirimkan ke AI untuk segera diperbaiki.*</p>
        </div>
      );
    }
    return <MainApp />;
  }
}

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Coffee, Utensils, Package, IceCream, Droplet, Candy, 
  CheckCircle, Settings, BarChart3, PlusCircle, 
  Store, QrCode, CreditCard, ChevronRight, ArrowLeft,
  Search, X, Lock, LogOut, TrendingUp, Edit, Trash2, List, TrendingDown,
  Fish, Carrot, Apple, Beef, Soup, Cookie, Pill, Sparkles, Flame, ShoppingBasket, Camera, Barcode,
  AlertTriangle, Loader2
} from 'lucide-react';

// =========================================================================
// PENGATURAN KONEKSI SUPABASE (UNTUK DI VS CODE LOKAL)
// =========================================================================
// PENTING: Di VS Code Anda, tambahkan 4 baris kode di bawah ini 
// (hapus tanda komentar //) dan hapus baris "const supabase = null;"

  import { createClient } from '@supabase/supabase-js';
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;
// =========================================================================

// Mock fallback untuk Canvas agar kompilasi tidak error/blank screen

// --- LOGIKA BANTUAN ---
const formatRupiah = (angka) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka || 0);

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
  if (item.diskon && qty >= item.diskon.min_qty) {
    const paketDiskon = Math.floor(qty / item.diskon.min_qty);
    const sisaBiasa = qty % item.diskon.min_qty;
    return (paketDiskon * item.diskon.harga_total) + (sisaBiasa * item.jual);
  }
  return item.jual * qty;
};

// --- KOMPONEN UTAMA APP ---
export default function App() {
  const [isLoadingDB, setIsLoadingDB] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const [view, setView] = useState('toko'); 
  const [products, setProducts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [settings, setSettings] = useState({ nama_toko: 'Memuat...', qris_url: '', rekening: '', admin_password: '' });
  
  const [cart, setCart] = useState({});
  const [metodeBayar, setMetodeBayar] = useState(null); 
  const [strukTerakhir, setStrukTerakhir] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [tempQty, setTempQty] = useState(0);

  const [isAdminLogged, setIsAdminLogged] = useState(false);
  const [adminTab, setAdminTab] = useState('analisa'); 
  const [loginInput, setLoginInput] = useState('');
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProduct, setNewProduct] = useState({ nama: '', modal: 0, jual: 0, stok: 0, barcode: '', diskonQty: '', diskonHarga: '' });
  const [useDiskon, setUseDiskon] = useState(false);

  // --- FETCH DATA & REAL-TIME LISTENER ---
  useEffect(() => {
    if (!supabase) {
      setIsLoadingDB(false);
      return;
    }

    fetchData();

    const channel = supabase.channel('realtime-toko')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'produk' }, () => {
        fetchProducts(); 
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transaksi' }, () => {
        fetchTransactions(); 
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); }
  }, []);

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
    if (data) setSettings(data);
  };

  // --- LOGIKA SCAN BARCODE ---
  const handleScanBarcode = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!('BarcodeDetector' in window)) {
        alert('Browser/HP Anda belum mendukung pemindaian barcode otomatis. Silakan ketik angka barcode secara manual.');
        return;
    }
    try {
        const barcodeDetector = new window.BarcodeDetector({ formats: ['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'] });
        const imageBitmap = await createImageBitmap(file);
        const barcodes = await barcodeDetector.detect(imageBitmap);
        if (barcodes.length > 0) {
            setNewProduct(prev => ({ ...prev, barcode: barcodes[0].rawValue }));
            setSearchQuery(barcodes[0].rawValue); 
            alert(`✅ Barcode ditemukan: ${barcodes[0].rawValue}`);
        } else {
            alert('❌ Barcode tidak terbaca dengan jelas. Coba atur fokus kamera.');
        }
    } catch (error) { console.error(error); }
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
    } else {
      setCart({ ...cart, [selectedProduct.id]: tempQty });
    }
    setSelectedProduct(null);
  };

  const totalBelanja = useMemo(() => {
    let total = 0;
    Object.entries(cart).forEach(([id, qty]) => {
      const product = products.find(p => p.id === parseInt(id));
      if (product) total += hitungTotalHargaItem(product, qty);
    });
    return total;
  }, [cart, products]);

  const jumlahItem = Object.values(cart).reduce((a, b) => a + b, 0);

  const handleSelesaiBayar = async () => {
    if (!supabase) return;
    setIsProcessing(true);
    
    const detailPesanan = Object.entries(cart).map(([id, qty]) => {
      const product = products.find(p => p.id === parseInt(id));
      const totalHarga = hitungTotalHargaItem(product, qty);
      return { 
        id: product.id,
        nama: product.nama,
        modal: product.modal,
        jual: product.jual,
        qty, 
        totalHarga, 
        profitItem: totalHarga - (product.modal * qty) 
      };
    });

    const totalModal = detailPesanan.reduce((sum, item) => sum + (item.modal * item.qty), 0);
    const totalProfit = totalBelanja - totalModal;

    const newTransaction = {
      id: `TRX-${Date.now()}`,
      tanggal: new Date().toLocaleString('id-ID'),
      isoDate: new Date().toISOString(),
      items: detailPesanan,
      total: totalBelanja,
      modal: totalModal,
      profit: totalProfit,
      metode: metodeBayar
    };

    const { error: errTrx } = await supabase.from('transaksi').insert([newTransaction]);
    if (errTrx) {
      alert("Gagal memproses pembayaran. Coba lagi.");
      setIsProcessing(false);
      return;
    }

    for (const item of detailPesanan) {
      const currentProduct = products.find(p => p.id === item.id);
      if (currentProduct) {
         await supabase.from('produk').update({ stok: currentProduct.stok - item.qty }).eq('id', item.id);
      }
    }

    setStrukTerakhir(newTransaction);
    setIsProcessing(false);
    setView('struk');
  };

  const handleTutupStruk = () => {
    setCart({});
    setMetodeBayar(null);
    setStrukTerakhir(null);
    setView('toko');
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (loginInput === settings.admin_password) {
      setIsAdminLogged(true);
      setLoginInput('');
    } else {
      alert('Password Salah!');
    }
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!supabase) return;
    setIsProcessing(true);
    let diskonRule = null;
    if (useDiskon && newProduct.diskonQty > 1 && newProduct.diskonHarga > 0) {
        diskonRule = { min_qty: parseInt(newProduct.diskonQty), harga_total: parseInt(newProduct.diskonHarga) };
    }

    const { error } = await supabase.from('produk').insert([{
      nama: newProduct.nama,
      barcode: newProduct.barcode || null,
      modal: newProduct.modal,
      jual: newProduct.jual,
      stok: newProduct.stok,
      diskon: diskonRule
    }]);

    setIsProcessing(false);
    if (!error) {
      setShowAddForm(false);
      setNewProduct({ nama: '', modal: 0, jual: 0, stok: 0, barcode: '', diskonQty: '', diskonHarga: '' });
      setUseDiskon(false);
    } else { alert("Gagal menambah barang."); }
  };

  const handleDeleteProduct = async (id) => {
    if (!supabase) return;
    if(confirm("Yakin hapus barang ini?")) {
       await supabase.from('produk').delete().eq('id', id);
    }
  };

  const handleSaveSettings = async () => {
    if (!supabase) return;
    setIsProcessing(true);
    await supabase.from('pengaturan').update(settings).eq('id', 1);
    setIsProcessing(false);
    alert('Pengaturan Berhasil Disimpan!');
  };

  // =========================================================
  // RENDER UI 
  // =========================================================

  // TAMPILAN JIKA ENV VARIABLES BELUM DIISI (BAIK LOKAL MAUPUN CLOUDFLARE)
  if (!supabase) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-white">
        <AlertTriangle size={72} className="text-rose-500 mb-6 animate-pulse" />
        <h1 className="text-3xl font-extrabold mb-3">Siap Dipindahkan ke VS Code</h1>
        <p className="text-slate-300 max-w-lg mb-8 text-sm leading-relaxed">
          Untuk mencegah error kompilasi pada pratinjau ini, fungsi import Supabase dinonaktifkan sementara. 
        </p>
        
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-700 text-left max-w-xl w-full shadow-2xl">
          <p className="font-bold text-sky-400 mb-3 text-lg flex items-center gap-2">💻 Langkah Mengaktifkan di VS Code:</p>
          <ol className="list-decimal pl-5 space-y-2 text-slate-300 text-sm mb-6">
            <li>Jalankan <code className="bg-slate-800 text-emerald-300 px-1 rounded">npm install @supabase/supabase-js</code>.</li>
            <li>Di file <code className="bg-slate-800 text-emerald-300 px-1 rounded">App.jsx</code> ini, cari bagian PENGATURAN KONEKSI SUPABASE (paling atas).</li>
            <li>Hapus tanda komentar <code className="bg-slate-800 text-slate-400 px-1 rounded">//</code> pada baris import dan inisialisasi supabase.</li>
            <li>Hapus baris <code className="bg-slate-800 text-rose-400 px-1 rounded">const supabase = null;</code>.</li>
          </ol>

          <hr className="border-slate-800 mb-6"/>

          <p className="font-bold text-sky-400 mb-3 text-lg flex items-center gap-2">🌐 Jika Layar Ini Muncul di Cloudflare Pages:</p>
          <ol className="list-decimal pl-5 space-y-2 text-slate-300 text-sm">
            <li>Buka Dashboard Cloudflare &gt; Pages &gt; Proyek Anda &gt; <strong>Settings</strong>.</li>
            <li>Klik menu <strong>Environment variables</strong>.</li>
            <li>Tambahkan <code className="bg-slate-800 text-emerald-300 px-1 rounded">VITE_SUPABASE_URL</code> dan <code className="bg-slate-800 text-emerald-300 px-1 rounded">VITE_SUPABASE_ANON_KEY</code>.</li>
            <li>Masuk ke tab <strong>Deployments</strong>, lalu klik <strong>Retry deployment</strong>.</li>
          </ol>
        </div>
      </div>
    );
  }

  if (isLoadingDB) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center flex-col text-emerald-600"><Loader2 className="animate-spin mb-4" size={48} /><h2 className="font-bold text-xl">Membuka Toko...</h2></div>;
  }

  const filteredProducts = products.filter(p => 
    p.nama.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (p.barcode && p.barcode.includes(searchQuery))
  );

  // --- RENDER: TOKO ---
  if (view === 'toko') {
    return (
      <div className="min-h-screen bg-slate-50 pb-24 relative">
        <header className="bg-white shadow-sm p-4 sticky top-0 z-10">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <Store className="text-emerald-600" />
              <h1 className="text-xl font-bold text-gray-800">{settings.nama_toko}</h1>
            </div>
            <button onClick={() => setView('admin')} className="p-2 text-gray-500 bg-gray-100 rounded-full hover:bg-gray-200 transition">
              <Lock size={18} />
            </button>
          </div>
          
          <div className="relative flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 text-gray-400" size={20} />
              <input 
                type="text"
                placeholder="Cari nama barang atau scan..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-100 text-gray-700 rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
              />
            </div>
            <label className="bg-slate-800 text-white rounded-xl flex items-center justify-center px-4 cursor-pointer active:scale-95 transition" title="Scan Barcode">
               <Camera size={20}/>
               <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleScanBarcode} />
            </label>
          </div>
        </header>

        <main className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredProducts.map(product => (
            <div 
              key={product.id} 
              onClick={() => openProductModal(product)}
              className="bg-white rounded-2xl p-5 shadow-sm flex flex-col items-center text-center border border-gray-100 cursor-pointer hover:shadow-md transition relative overflow-hidden"
            >
              {cart[product.id] > 0 && (
                <div className="absolute top-0 right-0 bg-emerald-500 text-white text-xs font-bold px-2 py-1 rounded-bl-xl z-10">
                  {cart[product.id]} di keranjang
                </div>
              )}
              
              <div className="bg-slate-50 p-4 rounded-full mb-3 shadow-sm border border-slate-100">
                {getDynamicIcon(product.nama)}
              </div>
              <h3 className="font-extrabold text-sm text-slate-900 mb-1 leading-tight">{product.nama}</h3>
              <p className="text-emerald-700 font-extrabold mb-2 text-lg">{formatRupiah(product.jual)}</p>
              
              <div className={`text-xs px-2 py-1 rounded-full font-bold ${product.stok > 5 ? 'bg-blue-50 text-blue-700' : product.stok > 0 ? 'bg-orange-50 text-orange-700' : 'bg-red-50 text-red-700'}`}>
                Stok: {product.stok}
              </div>
            </div>
          ))}
          {filteredProducts.length === 0 && (
            <div className="col-span-full text-center text-gray-400 mt-10 font-medium">Barang tidak ditemukan.</div>
          )}
        </main>

        {selectedProduct && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4 animate-fade-in backdrop-blur-sm">
            <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl p-6 shadow-2xl transform transition-transform animate-slide-up">
              <div className="flex justify-between items-start mb-4 border-b pb-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl">{getDynamicIcon(selectedProduct.nama)}</div>
                  <div>
                    <h3 className="font-extrabold text-xl text-slate-900 leading-tight">{selectedProduct.nama}</h3>
                    <p className="text-emerald-700 font-extrabold text-lg">{formatRupiah(selectedProduct.jual)}</p>
                    <p className="text-sm font-bold text-slate-600 mt-1">Sisa stok: {selectedProduct.stok}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedProduct(null)} className="p-2 text-slate-800 bg-slate-100 rounded-full hover:bg-slate-200"><X size={20}/></button>
              </div>

              {selectedProduct.diskon && (
                <div className="bg-orange-50 text-orange-700 p-3 rounded-lg text-sm mb-6 border border-orange-200 text-center font-semibold">
                  🔥 Beli {selectedProduct.diskon.min_qty} cukup bayar <strong className="font-extrabold text-orange-800">{formatRupiah(selectedProduct.diskon.harga_total)}</strong>
                </div>
              )}

              <div className="flex items-center justify-between bg-slate-50 rounded-xl p-3 mb-6 border border-slate-200">
                <button onClick={() => setTempQty(Math.max(0, tempQty - 1))} className="w-14 h-14 bg-white text-slate-800 text-3xl font-extrabold rounded-lg shadow-sm border border-slate-200 active:scale-95 transition">-</button>
                <input 
                  type="number"
                  value={tempQty === 0 ? '' : tempQty}
                  onChange={(e) => setTempQty(Math.min(selectedProduct.stok, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="text-4xl font-black w-24 text-center bg-transparent border-b-4 border-slate-300 focus:border-emerald-600 focus:outline-none text-slate-900 placeholder-slate-300"
                  placeholder="0"
                />
                <button onClick={() => setTempQty(Math.min(selectedProduct.stok, tempQty + 1))} className="w-14 h-14 bg-emerald-600 text-white text-3xl font-extrabold rounded-lg shadow-sm active:scale-95 transition">+</button>
              </div>

              <button onClick={saveToCart} className="w-full py-4 bg-slate-900 text-white rounded-xl font-extrabold text-lg active:scale-95 transition hover:bg-slate-800">
                Simpan ke Keranjang
              </button>
            </div>
          </div>
        )}

        {jumlahItem > 0 && !selectedProduct && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-gray-200 z-40">
            <div className="max-w-3xl mx-auto flex justify-between items-center bg-emerald-600 text-white p-4 rounded-xl shadow-lg cursor-pointer hover:bg-emerald-700 transition" onClick={() => setView('checkout')}>
              <div className="flex flex-col">
                <span className="text-sm opacity-90">{jumlahItem} barang terpilih</span>
                <span className="font-bold text-lg">{formatRupiah(totalBelanja)}</span>
              </div>
              <div className="flex items-center gap-2 font-semibold">Bayar <ChevronRight size={20} /></div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- RENDER: CHECKOUT & STRUK ---
  if (view === 'checkout') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="bg-white p-4 flex items-center gap-4 border-b">
          <button onClick={() => setView('toko')} className="p-2 bg-gray-100 rounded-full"><ArrowLeft size={20}/></button>
          <h1 className="font-bold text-lg">Pilih Pembayaran</h1>
        </header>
        <main className="p-4 flex-1 max-w-md mx-auto w-full">
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-6 mb-6 shadow-md text-white">
            <h2 className="text-emerald-100 text-sm mb-1">Total Tagihan</h2>
            <p className="text-4xl font-bold">{formatRupiah(totalBelanja)}</p>
          </div>
          <h3 className="font-semibold text-gray-800 mb-3 ml-1">Metode Pembayaran:</h3>
          <div className="grid gap-3">
            <button onClick={() => setMetodeBayar('qris')} className={`p-4 rounded-xl border-2 flex items-center gap-4 transition-all ${metodeBayar === 'qris' ? 'border-emerald-500 bg-emerald-50 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
              <div className="p-3 bg-white rounded-lg shadow-sm border"><QrCode className="text-emerald-600" size={28}/></div>
              <div className="text-left"><p className="font-bold text-gray-800">QRIS Cepat</p><p className="text-xs text-gray-500">Scan via e-Wallet/M-Banking</p></div>
            </button>
            <button onClick={() => setMetodeBayar('transfer')} className={`p-4 rounded-xl border-2 flex items-center gap-4 transition-all ${metodeBayar === 'transfer' ? 'border-emerald-500 bg-emerald-50 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
              <div className="p-3 bg-white rounded-lg shadow-sm border"><CreditCard className="text-blue-600" size={28}/></div>
              <div className="text-left"><p className="font-bold text-gray-800">Transfer Bank</p><p className="text-xs text-gray-500">Transfer manual ke rekening</p></div>
            </button>
          </div>
          {metodeBayar === 'qris' && (
             <div className="mt-6 p-6 bg-white rounded-2xl flex flex-col items-center animate-fade-in border shadow-sm">
               <img src={settings.qris_url} alt="QRIS" className="w-56 h-56 rounded-xl border p-2 mb-4" />
               <p className="text-sm text-gray-500 text-center">Silakan scan QR Code di atas. Kejujuran Anda adalah kebanggaan kami.</p>
             </div>
          )}
          {metodeBayar === 'transfer' && (
             <div className="mt-6 p-6 bg-white rounded-2xl flex flex-col items-center animate-fade-in border shadow-sm">
               <p className="text-sm text-gray-500 mb-2">Transfer ke Rekening Resmi:</p>
               <p className="font-bold text-xl text-slate-800 tracking-wider mb-1">{settings.rekening.split(' ')[1]}</p>
               <p className="text-sm text-gray-600 font-medium">{settings.rekening.split(' ')[0]} - {settings.rekening.split('a.n')[1]}</p>
             </div>
          )}
        </main>
        <div className="p-4 bg-white border-t relative">
           <button 
             onClick={handleSelesaiBayar}
             disabled={!metodeBayar || isProcessing}
             className="w-full max-w-md mx-auto flex items-center justify-center gap-2 py-4 bg-slate-900 text-white rounded-xl font-bold text-lg disabled:opacity-30 transition-opacity"
           >
             {isProcessing ? <><Loader2 className="animate-spin"/> Memproses...</> : 'Selesai & Cetak Struk'}
           </button>
        </div>
      </div>
    );
  }

  if (view === 'struk' && strukTerakhir) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
        <div className="mb-6 flex flex-col items-center animate-slide-up">
          <div className="w-16 h-16 bg-emerald-500 text-white rounded-full flex items-center justify-center mb-3 shadow-lg shadow-emerald-200"><CheckCircle size={36} /></div>
          <h2 className="text-2xl font-extrabold text-slate-800">Pembayaran Berhasil</h2>
          <p className="text-slate-500 text-sm mt-1">Terima kasih atas kejujuran Anda!</p>
        </div>
        <div className="bg-white w-full max-w-md rounded-3xl shadow-xl overflow-hidden animate-fade-in relative">
          <div className="bg-slate-900 p-6 text-center text-white">
            <Store className="mx-auto mb-2 opacity-80" size={32} />
            <h3 className="font-bold text-xl tracking-wide">{settings.nama_toko}</h3>
            <p className="text-xs text-slate-400 mt-1 opacity-80">E-Receipt • {strukTerakhir.tanggal}</p>
          </div>
          <div className="p-6">
            <div className="flex justify-between items-center mb-4 pb-4 border-b border-dashed border-gray-200">
              <span className="text-xs text-gray-400 uppercase tracking-wider font-bold">ID Transaksi</span>
              <span className="text-sm font-mono text-slate-700">{strukTerakhir.id}</span>
            </div>
            <div className="space-y-4 mb-6">
              {strukTerakhir.items.map((item, idx) => (
                <div key={idx} className="flex justify-between items-start">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center mt-0.5 border">{getDynamicIcon(item.nama)}</div>
                    <div><p className="font-semibold text-slate-800 text-sm">{item.nama}</p><p className="text-xs text-gray-500 mt-0.5">{item.qty} x {formatRupiah(item.jual)}</p></div>
                  </div>
                  <p className="font-bold text-slate-800 text-sm">{formatRupiah(item.totalHarga)}</p>
                </div>
              ))}
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl flex justify-between items-center">
              <span className="font-bold text-slate-600">Total Dibayar</span>
              <span className="font-extrabold text-emerald-600 text-xl">{formatRupiah(strukTerakhir.total)}</span>
            </div>
          </div>
          <div className="bg-gray-50 p-4 text-center border-t border-dashed"><p className="text-xs text-gray-400 uppercase font-bold tracking-widest">Metode: {strukTerakhir.metode}</p></div>
          <div className="absolute top-[80px] -left-4 w-8 h-8 bg-slate-100 rounded-full"></div>
          <div className="absolute top-[80px] -right-4 w-8 h-8 bg-slate-100 rounded-full"></div>
        </div>
        <button onClick={handleTutupStruk} className="mt-8 px-8 py-3 bg-slate-900 text-white rounded-full font-bold shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all">Selesai & Kembali</button>
      </div>
    );
  }

  // --- RENDER: ADMIN AREA ---
  if (view === 'admin' && !isAdminLogged) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-3xl shadow-lg w-full max-w-sm">
          <div className="w-16 h-16 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center mb-6 mx-auto"><Lock size={32} /></div>
          <h2 className="text-2xl font-bold text-center mb-2">Panel Admin</h2>
          <p className="text-center text-sm text-gray-500 mb-6">Masukkan kata sandi untuk melanjutkan</p>
          <input type="password" placeholder="Password..." value={loginInput} onChange={e => setLoginInput(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-4 focus:outline-none focus:border-emerald-500" autoFocus />
          <button type="submit" className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold shadow-md">Masuk</button>
          <button type="button" onClick={() => setView('toko')} className="w-full text-slate-500 mt-4 text-sm hover:underline">Batal</button>
        </form>
      </div>
    );
  }

  if (view === 'admin' && isAdminLogged) {
    const filteredTransactions = transactions.filter(t => {
      if (!filterStart && !filterEnd) return true;
      const tDate = new Date(t.isoDate);
      const sDate = filterStart ? new Date(filterStart) : new Date(0);
      let eDate = filterEnd ? new Date(filterEnd) : new Date('2100-01-01');
      if (filterEnd) eDate.setHours(23, 59, 59, 999);
      return tDate >= sDate && tDate <= eDate;
    });

    const totalPendapatanKotor = filteredTransactions.reduce((sum, t) => sum + t.total, 0);
    const totalKeuntunganBersih = filteredTransactions.reduce((sum, t) => sum + t.profit, 0);
    const totalModal = filteredTransactions.reduce((sum, t) => sum + t.modal, 0);

    const itemSales = {};
    filteredTransactions.forEach(t => {
      t.items.forEach(item => {
        if (!itemSales[item.id]) itemSales[item.id] = { nama: item.nama, qty: 0, profit: 0 };
        itemSales[item.id].qty += item.qty;
        itemSales[item.id].profit += item.profitItem;
      });
    });
    
    const topSelling = Object.values(itemSales).sort((a, b) => b.qty - a.qty).slice(0, 5);
    const productPerformance = products.map(p => {
      const sales = itemSales[p.id] ? itemSales[p.id].qty : 0;
      const daysActive = Math.max(1, Math.floor((new Date() - new Date(p.tanggal_dibuat)) / (1000 * 60 * 60 * 24)));
      return { ...p, terjual: sales, daysActive };
    });
    const bottomSelling = [...productPerformance].filter(p => p.stok > 0).sort((a, b) => {
        if (a.terjual !== b.terjual) return a.terjual - b.terjual;
        return b.daysActive - a.daysActive; 
    }).slice(0, 5);

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
        {/* Sidebar Admin */}
        <aside className="bg-slate-950 text-white w-full md:w-64 flex-shrink-0 flex flex-col shadow-xl z-10">
          <div className="p-6 flex items-center gap-3 border-b border-slate-800">
             <Store className="text-emerald-400" size={28} />
             <div><h2 className="font-extrabold text-xl text-white leading-tight tracking-wide">Admin Area</h2></div>
          </div>
          <nav className="flex-1 p-4 space-y-2 overflow-x-auto md:overflow-visible flex md:flex-col">
            <button onClick={() => setAdminTab('analisa')} className={`flex items-center gap-3 px-4 py-3 rounded-xl w-full text-left transition-all ${adminTab === 'analisa' ? 'bg-emerald-500 text-white shadow-md font-extrabold' : 'text-slate-400 hover:bg-slate-800 hover:text-white font-semibold'}`}>
              <TrendingUp size={20} className="shrink-0" /> <span className="whitespace-nowrap">Analisa Penjualan</span>
            </button>
            <button onClick={() => setAdminTab('barang')} className={`flex items-center gap-3 px-4 py-3 rounded-xl w-full text-left transition-all ${adminTab === 'barang' ? 'bg-emerald-500 text-white shadow-md font-extrabold' : 'text-slate-400 hover:bg-slate-800 hover:text-white font-semibold'}`}>
              <List size={20} className="shrink-0" /> <span className="whitespace-nowrap">Data Barang</span>
            </button>
            <button onClick={() => setAdminTab('pengaturan')} className={`flex items-center gap-3 px-4 py-3 rounded-xl w-full text-left transition-all ${adminTab === 'pengaturan' ? 'bg-emerald-500 text-white shadow-md font-extrabold' : 'text-slate-400 hover:bg-slate-800 hover:text-white font-semibold'}`}>
              <Settings size={20} className="shrink-0" /> <span className="whitespace-nowrap">Pengaturan</span>
            </button>
          </nav>
          <div className="p-4 border-t border-slate-800">
            <button onClick={() => { setIsAdminLogged(false); setView('toko'); }} className="flex items-center gap-3 px-4 py-3 rounded-xl w-full text-left text-red-400 hover:bg-slate-800 hover:text-red-300 font-bold transition">
              <LogOut size={20} className="shrink-0" /> <span className="whitespace-nowrap">Keluar (Toko)</span>
            </button>
          </div>
        </aside>

        {/* Konten Admin */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
          {adminTab === 'analisa' && (
            <div className="animate-fade-in">
              <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4">
                <h1 className="text-2xl font-bold text-slate-800">Ikhtisar Penjualan</h1>
                <div className="flex items-center gap-2 bg-white p-2 rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                  <span className="text-xs font-bold text-gray-500 pl-2 uppercase tracking-wide">Filter:</span>
                  <input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)} className="text-sm font-semibold border border-gray-100 bg-slate-50 rounded-lg px-2 py-1 outline-none text-slate-700 focus:border-emerald-500" />
                  <span className="text-gray-400 font-bold">-</span>
                  <input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} className="text-sm font-semibold border border-gray-100 bg-slate-50 rounded-lg px-2 py-1 outline-none text-slate-700 focus:border-emerald-500" />
                  {(filterStart || filterEnd) && (<button onClick={() => {setFilterStart(''); setFilterEnd('');}} className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg ml-1 transition" title="Reset Filter"><X size={16}/></button>)}
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden"><div className="absolute top-0 right-0 p-6 opacity-5"><BarChart3 size={64}/></div><p className="text-sm font-semibold text-gray-500 mb-1">Total Omset</p><p className="text-3xl font-extrabold text-slate-800">{formatRupiah(totalPendapatanKotor)}</p></div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden"><div className="absolute top-0 right-0 p-6 opacity-5"><Store size={64}/></div><p className="text-sm font-semibold text-gray-500 mb-1">Total Modal</p><p className="text-3xl font-extrabold text-blue-600">{formatRupiah(totalModal)}</p></div>
                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-6 rounded-2xl shadow-sm text-white relative overflow-hidden"><div className="absolute top-0 right-0 p-6 opacity-10"><CheckCircle size={64}/></div><p className="text-sm font-medium text-emerald-100 mb-1">Keuntungan Bersih</p><p className="text-3xl font-extrabold drop-shadow-sm">{formatRupiah(totalKeuntunganBersih)}</p></div>
              </div>

              <div className="grid lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <h2 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-900"><TrendingUp className="text-orange-500"/> Paling Laku</h2>
                    {topSelling.length === 0 ? <p className="text-gray-400 text-sm font-medium">Belum ada data.</p> : (<div className="space-y-3">{topSelling.map((item, idx) => (<div key={idx} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100"><div className="flex items-center gap-3"><span className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-black text-slate-700">{idx+1}</span><span className="font-extrabold text-sm text-slate-900">{item.nama}</span></div><div className="text-right"><p className="text-sm font-extrabold text-slate-800">{item.qty} terjual</p><p className="text-xs text-emerald-600 font-bold">+ {formatRupiah(item.profit)}</p></div></div>))}</div>)}
                  </div>
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <h2 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-900"><TrendingDown className="text-red-500"/> Kurang Laku</h2>
                    <div className="space-y-3">{bottomSelling.map((item, idx) => (<div key={idx} className="flex justify-between items-center p-3 bg-red-50/50 rounded-xl border border-red-100"><div className="flex items-center gap-3"><span className="font-bold text-sm text-slate-900">{item.nama}</span></div><div className="text-right"><p className="text-sm font-extrabold text-red-600">{item.terjual} terjual</p><p className="text-xs text-red-500 font-bold">Nganggur {item.daysActive} hari</p></div></div>))}</div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <h2 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-900"><List className="text-blue-500"/> Riwayat Transaksi</h2>
                  <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">{filteredTransactions.length === 0 ? <p className="text-gray-400 text-sm font-medium">Belum ada transaksi.</p> : filteredTransactions.map(t => (<div key={t.id} className="border border-gray-200 rounded-xl p-4 bg-gray-50/30"><div className="flex justify-between text-sm mb-2 pb-2 border-b border-gray-200"><span className="font-mono text-xs font-bold text-slate-500">{t.id} • {t.tanggal}</span><span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase ${t.metode === 'qris' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>{t.metode}</span></div><div className="space-y-1 mb-2">{t.items.map((i, idx) => (<div key={idx} className="text-xs flex justify-between text-slate-700 font-semibold"><span>{i.qty}x {i.nama}</span><span className="text-slate-900">{formatRupiah(i.totalHarga)}</span></div>))}</div><div className="flex justify-between items-end mt-2 pt-2 border-t border-gray-200"><span className="text-xs text-emerald-700 font-bold">Untung: {formatRupiah(t.profit)}</span><span className="font-black text-slate-900">{formatRupiah(t.total)}</span></div></div>))}</div>
                </div>
              </div>
            </div>
          )}

          {adminTab === 'barang' && (
            <div className="animate-fade-in">
              <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-slate-800">Manajemen Barang</h1>
                <button onClick={() => setShowAddForm(!showAddForm)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition">
                  {showAddForm ? <X size={18}/> : <PlusCircle size={18}/>} {showAddForm ? 'Batal' : 'Tambah'}
                </button>
              </div>

              {showAddForm && (
                <form onSubmit={handleAddProduct} className="bg-white p-6 rounded-2xl shadow-sm border border-emerald-100 mb-6 bg-emerald-50/30">
                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><PlusCircle size={20} className="text-emerald-600"/> Form Barang Baru</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-5">
                    <div className="lg:col-span-2"><label className="block text-xs font-extrabold text-slate-800 mb-1">Nama Barang</label><input required type="text" value={newProduct.nama} onChange={e => setNewProduct({...newProduct, nama: e.target.value})} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 font-semibold" /></div>
                    <div>
                      <label className="block text-xs font-extrabold text-slate-800 mb-1">Barcode (Opsional)</label>
                      <div className="flex gap-2">
                        <input type="text" value={newProduct.barcode || ''} onChange={e => setNewProduct({...newProduct, barcode: e.target.value})} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono" placeholder="Ketik/Scan" />
                        <label className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-lg cursor-pointer flex items-center transition" title="Foto Barcode"><Camera size={18}/><input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleScanBarcode} /></label>
                      </div>
                    </div>
                    <div><label className="block text-xs font-extrabold text-slate-800 mb-1">Harga Modal</label><input required type="number" value={newProduct.modal || ''} onChange={e => setNewProduct({...newProduct, modal: parseInt(e.target.value)})} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold" /></div>
                    <div><label className="block text-xs font-extrabold text-slate-800 mb-1">Harga Jual</label><input required type="number" value={newProduct.jual || ''} onChange={e => setNewProduct({...newProduct, jual: parseInt(e.target.value)})} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold" /></div>
                    <div><label className="block text-xs font-extrabold text-slate-800 mb-1">Stok Awal</label><input required type="number" value={newProduct.stok || ''} onChange={e => setNewProduct({...newProduct, stok: parseInt(e.target.value)})} className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold" /></div>

                    <div className="lg:col-span-5 mt-2"><label className="flex items-center gap-2 cursor-pointer w-max"><input type="checkbox" checked={useDiskon} onChange={e => setUseDiskon(e.target.checked)} className="w-5 h-5 text-emerald-600 rounded border-slate-300" /><span className="text-sm font-extrabold text-slate-800">Beri Harga Grosir</span></label></div>
                    {useDiskon && (<div className="lg:col-span-5 grid grid-cols-1 md:grid-cols-2 gap-4 bg-orange-50 p-4 rounded-xl border border-orange-200"><div><label className="block text-xs font-extrabold text-orange-900 mb-1">Minimal Beli</label><input required type="number" value={newProduct.diskonQty} onChange={e => setNewProduct({...newProduct, diskonQty: e.target.value})} className="w-full bg-white border border-orange-300 rounded-lg px-3 py-2 font-extrabold" /></div><div><label className="block text-xs font-extrabold text-orange-900 mb-1">Harga Total Grosir (Rp)</label><input required type="number" value={newProduct.diskonHarga} onChange={e => setNewProduct({...newProduct, diskonHarga: e.target.value})} className="w-full bg-white border border-orange-300 rounded-lg px-3 py-2 font-extrabold" /></div></div>)}
                  </div>
                  <button type="submit" disabled={isProcessing} className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-2.5 rounded-xl text-sm font-extrabold shadow-md transition flex items-center gap-2">
                     {isProcessing ? <Loader2 size={16} className="animate-spin"/> : null} Simpan Data Barang
                  </button>
                </form>
              )}

              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-600 text-xs uppercase tracking-wider border-b border-slate-200">
                        <th className="p-4 font-extrabold">Produk</th><th className="p-4 font-extrabold">Barcode</th><th className="p-4 font-extrabold">Stok</th><th className="p-4 font-extrabold">Modal</th><th className="p-4 font-extrabold">Jual</th><th className="p-4 font-extrabold text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {products.map(p => (
                        <tr key={p.id} className="hover:bg-slate-50 transition">
                          <td className="p-4 flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-white shadow-sm flex items-center justify-center border shrink-0">{getDynamicIcon(p.nama)}</div><span className="font-extrabold text-slate-800 text-sm">{p.nama}</span></td>
                          <td className="p-4">{p.barcode ? <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded text-slate-600 border flex items-center gap-1 w-max"><Barcode size={12}/>{p.barcode}</span> : <span className="text-xs text-gray-400 italic">-</span>}</td>
                          <td className="p-4"><span className={`px-2 py-1 rounded-md text-xs font-black ${p.stok > 10 ? 'bg-emerald-100 text-emerald-800' : p.stok > 0 ? 'bg-orange-100 text-orange-800' : 'bg-red-100 text-red-800'}`}>{p.stok}</span></td>
                          <td className="p-4 text-sm font-semibold text-slate-500">{formatRupiah(p.modal)}</td>
                          <td className="p-4 text-sm font-extrabold text-emerald-700">{formatRupiah(p.jual)}{p.diskon && <span className="block text-[10px] text-orange-700 font-bold bg-orange-100 px-1.5 py-0.5 rounded w-max mt-1 border border-orange-200">Grosir: {p.diskon.min_qty} = {formatRupiah(p.diskon.harga_total)}</span>}</td>
                          <td className="p-4 text-center flex justify-center gap-1">
                            <button onClick={() => handleDeleteProduct(p.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition" title="Hapus"><Trash2 size={18}/></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {adminTab === 'pengaturan' && (
             <div className="animate-fade-in max-w-2xl">
              <h1 className="text-2xl font-bold mb-6 text-slate-800">Pengaturan Sistem</h1>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
                <div>
                  <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><Store size={18}/> Profil Toko</h3>
                  <label className="block text-sm font-semibold text-gray-600 mb-2">Nama Toko</label>
                  <input type="text" value={settings.nama_toko} onChange={e => setSettings({...settings, nama_toko: e.target.value})} className="w-full bg-slate-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 focus:bg-white" />
                </div>
                <hr className="border-dashed" />
                <div>
                  <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><CreditCard size={18}/> Metode Pembayaran</h3>
                  <div className="space-y-4">
                    <div><label className="block text-sm font-semibold text-gray-600 mb-2">URL Gambar QRIS</label><input type="text" value={settings.qris_url} onChange={e => setSettings({...settings, qris_url: e.target.value})} className="w-full bg-slate-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 focus:bg-white text-sm font-mono" /></div>
                    <div><label className="block text-sm font-semibold text-gray-600 mb-2">Info Rekening Transfer</label><input type="text" value={settings.rekening} onChange={e => setSettings({...settings, rekening: e.target.value})} className="w-full bg-slate-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 focus:bg-white" /></div>
                  </div>
                </div>
                <hr className="border-dashed" />
                <div>
                  <h3 className="font-bold text-red-600 mb-4 flex items-center gap-2"><Lock size={18}/> Keamanan Admin</h3>
                  <label className="block text-sm font-semibold text-gray-600 mb-2">Ubah Password Admin</label>
                  <input type="text" value={settings.admin_password} onChange={e => setSettings({...settings, admin_password: e.target.value})} className="w-full bg-slate-50 border border-red-200 rounded-xl px-4 py-3 focus:outline-none focus:border-red-500 focus:bg-white" />
                </div>
                <div className="pt-4">
                  <button onClick={handleSaveSettings} disabled={isProcessing} className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold w-full md:w-auto flex items-center justify-center gap-2">
                    {isProcessing ? <Loader2 size={18} className="animate-spin"/> : null} Simpan Pengaturan (Database)
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  return null;
}

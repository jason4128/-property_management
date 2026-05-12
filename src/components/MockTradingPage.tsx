import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, doc, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { analyzeMockTrade } from '../services/aiService';
import { User } from '../types';
import { Brain, TrendingUp, AlertCircle, TrendingDown, Clock, Search, BookOpen, Calculator, RefreshCw, Star, Info, X, Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';

const PRESET_WATCHLIST = ['2330.TW', '0050.TW', '2317.TW', 'AAPL', 'NVDA', 'TSLA'];

export const MockTradingPage = ({ user }: { user: User }) => {
  const [balance, setBalance] = useState<number>(1000000); // 預設一百萬
  const [positions, setPositions] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [newWatchlistSymbol, setNewWatchlistSymbol] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [symbol, setSymbol] = useState('');
  const [price, setPrice] = useState<number | ''>('');
  const [shares, setShares] = useState<number | ''>('');
  const [action, setAction] = useState<'buy' | 'sell'>('buy');
  const [note, setNote] = useState('');

  const [aiFeedback, setAiFeedback] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // 新增功能: 市場資訊與圖表
  const [stockInfo, setStockInfo] = useState<any>(null);
  const [stockHistory, setStockHistory] = useState<any[]>(null);
  const [isLoadingInfo, setIsLoadingInfo] = useState(false);

  // 新增功能: 即時現價更新
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});

  // 初始化並監聽虛擬帳戶餘額
  useEffect(() => {
    if (!user || user.uid === 'default-user') return;
    
    const accountRef = doc(db, 'mockAccounts', user.uid);
    const unsubscribeAccount = onSnapshot(accountRef, (docSnap) => {
      if (docSnap.exists()) {
        setBalance(docSnap.data().balance);
      } else {
        // 如果沒有帳戶，預設建立 100 萬帳戶
        setDoc(accountRef, { balance: 1000000, uid: user.uid }).catch(console.error);
      }
    });

    const qPositions = query(collection(db, 'mockPositions'), where('uid', '==', user.uid));
    const unsubscribePositions = onSnapshot(qPositions, (snapshot) => {
      const posData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPositions(posData);
      
      // Initialize live prices if they exist in DB
      setLivePrices(prev => {
        const newPrices = { ...prev };
        posData.forEach(p => {
           if (p.currentPrice && !newPrices[p.symbol]) newPrices[p.symbol] = p.currentPrice;
        });
        return newPrices;
      });
    });

    const qTrades = query(collection(db, 'mockTrades'), where('uid', '==', user.uid));
    const unsubscribeTrades = onSnapshot(qTrades, (snapshot) => {
      setTrades(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qWatchlists = query(collection(db, 'mockWatchlists'), where('uid', '==', user.uid));
    const unsubscribeWatchlists = onSnapshot(qWatchlists, (snapshot) => {
      setWatchlist(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubscribeAccount();
      unsubscribePositions();
      unsubscribeTrades();
      unsubscribeWatchlists();
    };
  }, [user]);

  // Fetch stock data when symbol changes
  useEffect(() => {
    let active = true;
    const fetchStockData = async () => {
      if (!symbol || symbol.length < 2) {
        setStockInfo(null);
        setStockHistory(null);
        return;
      }
      setIsLoadingInfo(true);
      try {
        const [infoRes, histRes] = await Promise.all([
          fetch(`/api/stock/${encodeURIComponent(symbol)}`),
          fetch(`/api/stock/history/${encodeURIComponent(symbol)}`)
        ]);
        
        let infoData = null;
        if (infoRes.ok) {
          infoData = await infoRes.json();
          if (active && infoData?.regularMarketPrice) {
            setStockInfo(infoData);
            setPrice(infoData.regularMarketPrice);
          }
        } else {
           if (active) setStockInfo(null);
        }

        if (histRes.ok) {
           const historyData = await histRes.json();
           if (active) setStockHistory(historyData);
        } else {
           if (active) setStockHistory(null);
        }
      } catch (e) {
        console.error("Fetch stock data error:", e);
      } finally {
        if (active) setIsLoadingInfo(false);
      }
    };

    const delayDebounce = setTimeout(() => {
      fetchStockData();
    }, 600);

    return () => {
      active = false;
      clearTimeout(delayDebounce);
    };
  }, [symbol]);

  useEffect(() => {
    let active = true;
    const fetchSearch = async () => {
      if (!newWatchlistSymbol || newWatchlistSymbol.length < 2) {
        setSearchResults([]);
        return;
      }
      setIsSearching(true);
      try {
        const res = await fetch(`/api/stock/search/${encodeURIComponent(newWatchlistSymbol)}`);
        if (res.ok) {
          const data = await res.json();
          if (active && data.quotes) {
             setSearchResults(data.quotes.filter((q: any) => q.isYahooFinance === true || q.quoteType === 'EQUITY' || q.quoteType === 'ETF'));
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (active) setIsSearching(false);
      }
    };
    const delay = setTimeout(fetchSearch, 500);
    return () => { active = false; clearTimeout(delay); };
  }, [newWatchlistSymbol]);

  const handleRefreshPrices = async () => {
    setIsRefreshingPrices(true);
    try {
      const newPrices = { ...livePrices };
      const batch = writeBatch(db);
      let updatedCount = 0;
      
      for (const pos of positions) {
         try {
            const res = await fetch(`/api/stock/${encodeURIComponent(pos.symbol)}`);
            if (res.ok) {
               const data = await res.json();
               if (data.regularMarketPrice) {
                  newPrices[pos.symbol] = data.regularMarketPrice;
                  batch.update(doc(db, 'mockPositions', pos.id), { currentPrice: data.regularMarketPrice });
                  updatedCount++;
               }
            }
         } catch (e) {
            console.error(`Error fetching price for ${pos.symbol}`, e);
         }
      }
      
      if (updatedCount > 0) {
        await batch.commit();
      }
      setLivePrices(newPrices);
    } finally {
      setIsRefreshingPrices(false);
    }
  };

  const handleAddWatchlist = async (e: React.FormEvent) => {
    e.preventDefault();
    const sym = newWatchlistSymbol.trim().toUpperCase();
    if (!sym) return;
    if (watchlist.some(w => w.symbol === sym) || PRESET_WATCHLIST.includes(sym)) {
       setNewWatchlistSymbol("");
       return;
    }
    await addDoc(collection(db, 'mockWatchlists'), { uid: user.uid, symbol: sym, addedAt: new Date().toISOString() });
    setNewWatchlistSymbol("");
  };

  const handleRemoveWatchlist = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteDoc(doc(db, 'mockWatchlists', id));
  };

  const handleSimulateAndAnalyze = async () => {
    if (!symbol || !price || !shares || !note) {
      alert("請填寫完整交易資訊與學習筆記！");
      return;
    }

    const tradeAmount = Number(price) * Number(shares);
    if (action === 'buy' && tradeAmount > balance) {
      alert("可用餘額不足！");
      return;
    }

    setIsAnalyzing(true);
    setAiFeedback(null);
    try {
      const result = await analyzeMockTrade(
        symbol,
        balance,
        tradeAmount,
        action === 'buy',
        positions,
        note
      );
      setAiFeedback(result);
    } catch (error) {
      alert("分析失敗，請重試或確認 API 狀態。");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const executeTrade = async () => {
    if (!aiFeedback) return;
    confirmTrade();
  };

  const confirmTrade = async () => {
    if (!symbol || !price || !shares) return;
    const currentPrice = Number(price);
    const currentShares = Number(shares);
    const tradeAmount = currentPrice * currentShares;

    try {
      const batch = writeBatch(db);
      
      // 1. 扣除或增加餘額
      const accountRef = doc(db, 'mockAccounts', user.uid);
      const newBalance = action === 'buy' ? balance - tradeAmount : balance + tradeAmount;
      batch.update(accountRef, { balance: newBalance });

      // 2. 更新部位
      const existingPos = positions.find(p => p.symbol === symbol);
      if (action === 'buy') {
        if (existingPos) {
          const totalShares = existingPos.shares + currentShares;
          const averageCost = ((existingPos.shares * existingPos.averageCost) + tradeAmount) / totalShares;
          batch.update(doc(db, 'mockPositions', existingPos.id), { shares: totalShares, averageCost, currentPrice });
        } else {
          const posRef = doc(collection(db, 'mockPositions'));
          batch.set(posRef, { uid: user.uid, symbol, shares: currentShares, averageCost: currentPrice, currentPrice });
        }
      } else {
        if (existingPos) {
          const totalShares = existingPos.shares - currentShares;
          if (totalShares <= 0) {
            batch.delete(doc(db, 'mockPositions', existingPos.id));
          } else {
            batch.update(doc(db, 'mockPositions', existingPos.id), { shares: totalShares });
          }
        }
      }

      // 3. 記錄交易與 AI 點評
      const tradeRef = doc(collection(db, 'mockTrades'));
      batch.set(tradeRef, {
        uid: user.uid,
        symbol,
        action,
        price: currentPrice,
        shares: currentShares,
        amount: tradeAmount,
        note,
        aiCoachFeedback: aiFeedback?.coachComment || '',
        reasonScore: aiFeedback?.reasonScore || 0,
        date: new Date().toISOString()
      });

      await batch.commit();

      // 重置表單
      setSymbol('');
      setPrice('');
      setShares('');
      setNote('');
      setAiFeedback(null);
      alert("模擬交易執行成功！");

    } catch (e) {
      console.error(e);
      alert("交易失敗");
    }
  };

  const totalCost = positions.reduce((acc, p) => acc + (p.shares * p.averageCost), 0);
  const totalMarketValue = positions.reduce((acc, p) => {
    const pPrice = livePrices[p.symbol] || p.currentPrice || p.averageCost;
    return acc + (p.shares * pPrice);
  }, 0);
  const totalProfit = totalMarketValue - totalCost;

  // Chart Data preparation
  const chartData = stockHistory ? stockHistory.filter(h => h.close).map(h => {
     const date = new Date(typeof h.date === 'string' ? h.date : h.date * 1000);
     return {
        date: date.toLocaleDateString(),
        price: h.close
     };
  }) : [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
              <Calculator size={20} />
            </div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">可用資金</p>
          </div>
          <h3 className="text-3xl font-black text-slate-800 tabular-nums">${balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
              <BookOpen size={20} />
            </div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">目前現值 / 總成本</p>
          </div>
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl font-black text-slate-800 tabular-nums">${totalMarketValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
            <span className="text-sm font-medium text-slate-400">/ ${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-lg ${totalProfit >= 0 ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
              {totalProfit >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
            </div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">總損益 (未實現)</p>
          </div>
          <h3 className={`text-3xl font-black tabular-nums ${totalProfit >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {totalProfit >= 0 ? '+' : ''}{totalProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </h3>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Star size={24} className="text-amber-500" /> 
                股市觀察清單
              </h2>
              <div className="relative">
                <form onSubmit={handleAddWatchlist} className="flex items-center gap-2">
                  <input 
                    type="text" 
                    value={newWatchlistSymbol} 
                    onChange={e => setNewWatchlistSymbol(e.target.value)} 
                    placeholder="輸入代碼新增" 
                    className="px-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500 w-44"
                  />
                  <button type="submit" disabled={!newWatchlistSymbol.trim()} className="bg-indigo-100 text-indigo-600 p-1.5 rounded-lg hover:bg-indigo-200 disabled:opacity-50 z-10 relative">
                    <Plus size={16} />
                  </button>
                </form>
                {searchResults.length > 0 && newWatchlistSymbol.length >= 2 && (
                  <div className="absolute top-full right-0 mt-1 w-64 bg-white border border-slate-200 shadow-xl rounded-xl overflow-hidden z-20 max-h-60 overflow-y-auto">
                     {searchResults.map(res => (
                        <div 
                          key={res.symbol} 
                          className="flex items-center justify-between p-3 border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                          onClick={() => {
                            setNewWatchlistSymbol(res.symbol);
                            setSearchResults([]);
                          }}
                        >
                          <div>
                            <p className="font-bold text-slate-800">{res.symbol}</p>
                            <p className="text-xs text-slate-500 truncate max-w-[140px]">{res.shortname || res.longname}</p>
                          </div>
                          <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{res.exchDisp}</span>
                        </div>
                     ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESET_WATCHLIST.map(sym => (
                <button 
                  key={sym} 
                  onClick={() => setSymbol(sym)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${symbol === sym ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {sym}
                </button>
              ))}
              {watchlist.map(w => (
                <div key={w.id} className="relative group">
                  <button 
                    onClick={() => setSymbol(w.symbol)}
                    className={`px-4 py-2 pr-8 rounded-xl text-sm font-bold transition-all ${symbol === w.symbol ? 'bg-indigo-600 text-white shadow-md' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}
                  >
                    {w.symbol}
                  </button>
                  <button 
                    onClick={(e) => handleRemoveWatchlist(w.id, e)}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-rose-100 hover:text-rose-600 transition-colors ${symbol === w.symbol ? 'text-indigo-200 hover:text-white hover:bg-indigo-500' : 'text-indigo-300'}`}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-8 border-t border-slate-100 pt-6">
               <div className="flex flex-col sm:flex-row gap-4 mb-4">
                 <div className="flex-1">
                   <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 pl-1">股票代碼</label>
                   <input type="text" value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} placeholder="例: 2330.TW 或 AAPL" className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-300 font-bold text-slate-700" />
                 </div>
                 {stockInfo && (
                   <div className="flex-1 bg-slate-50 border border-slate-100 rounded-xl p-3.5 flex flex-col justify-center relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-2 opacity-10">
                        <Info size={48} />
                      </div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">現價</p>
                      <div className="flex items-baseline gap-2">
                         <span className="text-2xl font-black text-slate-800">{stockInfo.regularMarketPrice}</span>
                         <span className={`text-sm font-bold ${stockInfo.regularMarketChangePercent >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                           {stockInfo.regularMarketChangePercent > 0 ? '+' : ''}{(stockInfo.regularMarketChangePercent || 0).toFixed(2)}%
                         </span>
                      </div>
                   </div>
                 )}
               </div>

               {isLoadingInfo ? (
                 <div className="h-48 flex items-center justify-center text-slate-400 animate-pulse bg-slate-50 rounded-2xl">
                    <p className="font-bold flex items-center gap-2"><RefreshCw className="animate-spin" size={16} /> 載入股票基本面與圖表...</p>
                 </div>
               ) : stockInfo ? (
                 <div className="space-y-4">
                   <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-white border border-slate-100 rounded-xl p-3">
                         <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">本益比 (PE)</p>
                         <p className="text-slate-800 font-bold">{stockInfo.trailingPE?.toFixed(2) || 'N/A'}</p>
                      </div>
                      <div className="bg-white border border-slate-100 rounded-xl p-3">
                         <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">殖利率</p>
                         <p className="text-slate-800 font-bold">{(stockInfo.trailingAnnualDividendYield !== undefined ? (stockInfo.trailingAnnualDividendYield * 100).toFixed(2) + '%' : 'N/A')}</p>
                      </div>
                      <div className="bg-white border border-slate-100 rounded-xl p-3">
                         <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">近四季 EPS</p>
                         <p className="text-slate-800 font-bold">{stockInfo.epsTrailingTwelveMonths?.toFixed(2) || 'N/A'}</p>
                      </div>
                      <div className="bg-white border border-slate-100 rounded-xl p-3">
                         <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">市值</p>
                         <p className="text-slate-800 font-bold truncate" title={stockInfo.marketCap ? stockInfo.marketCap.toLocaleString() : 'N/A'}>{stockInfo.marketCap ? (stockInfo.marketCap / 100000000).toFixed(0) + ' 億' : 'N/A'}</p>
                      </div>
                   </div>
                   
                   {chartData.length > 0 && (
                     <div className="h-48 w-full bg-slate-50 rounded-xl p-2 border border-slate-100">
                       <ResponsiveContainer width="100%" height="100%">
                         <AreaChart data={chartData}>
                           <defs>
                             <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                               <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                               <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                             </linearGradient>
                           </defs>
                           <XAxis dataKey="date" hide />
                           <YAxis domain={['auto', 'auto']} hide />
                           <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }} />
                           <Area type="monotone" dataKey="price" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorPrice)" />
                         </AreaChart>
                       </ResponsiveContainer>
                     </div>
                   )}
                 </div>
               ) : symbol.length >= 2 ? (
                 <div className="h-24 flex items-center justify-center text-slate-400 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="font-bold">找不到該股票代碼，請確認是否正確。</p>
                 </div>
               ) : null}
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
            <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
              <Brain size={24} className="text-indigo-500" /> 
              AI 決策教練與下單
            </h2>
            
            <div className="space-y-5">
              <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                <button onClick={() => setAction('buy')} className={`flex-1 py-3 font-bold rounded-lg transition-all ${action === 'buy' ? 'bg-white text-rose-500 shadow-sm ring-1 ring-rose-100' : 'text-slate-500 hover:bg-slate-200/50'}`}>做多買進</button>
                <button onClick={() => setAction('sell')} className={`flex-1 py-3 font-bold rounded-lg transition-all ${action === 'sell' ? 'bg-white text-emerald-500 shadow-sm ring-1 ring-emerald-100' : 'text-slate-500 hover:bg-slate-200/50'}`}>獲利了結 / 停損</button>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 pl-1">委託股價</label>
                  <input type="number" value={price} onChange={e => setPrice(Number(e.target.value))} placeholder="價格" className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 pl-1">股數</label>
                  <input type="number" value={shares} onChange={e => setShares(Number(e.target.value))} placeholder="例如: 1000" className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors font-mono" />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 pl-1">投資筆記 / 決策理由 (必填)</label>
                <textarea 
                  value={note} 
                  onChange={e => setNote(e.target.value)} 
                  placeholder="請描述你為什麼選擇在此時買/賣？例如「均線黃金交叉，投信連續買超三天...」" 
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl h-28 resize-none focus:outline-none focus:border-indigo-500 transition-colors font-medium text-slate-700 placeholder:text-slate-300"
                />
              </div>

              {!aiFeedback ? (
                <button 
                  onClick={handleSimulateAndAnalyze} 
                  disabled={isAnalyzing}
                  className="w-full py-4 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-900 transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                >
                  {isAnalyzing ? (
                    <><Brain className="animate-pulse" /> 教練正瘋狂運算中...</>
                  ) : (
                    <><Search size={20} /> 分析決策邏輯</>
                  )}
                </button>
              ) : (
                <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="p-6 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
                  <div className="flex items-center gap-2 text-indigo-700 font-bold mb-4 border-b border-slate-200 pb-4">
                    <Brain size={24} /> 交易策略點評
                  </div>
                  <div className="text-sm space-y-4 leading-relaxed text-slate-700">
                    <p><span className="font-bold text-slate-900 bg-white px-2 py-1 rounded shadow-sm mr-2">局勢研判</span> {aiFeedback.trend}</p>
                    <p><span className="font-bold text-slate-900 bg-white px-2 py-1 rounded shadow-sm mr-2">技術掃瞄</span> {aiFeedback.technicalDetails}</p>
                    <p className="text-rose-700 bg-rose-50 p-3 rounded-lg border border-rose-100"><span className="font-bold mr-2">⚠️ 風險警示</span> {aiFeedback.riskWarning}</p>
                    <p className="p-4 bg-white rounded-xl border border-slate-200 italic shadow-sm text-slate-600 font-medium">"{aiFeedback.coachComment}"</p>
                    <div className="flex items-center gap-3 font-bold text-slate-800 pt-2">
                      邏輯評分：
                      <span className={`text-2xl ${aiFeedback.reasonScore > 80 ? 'text-emerald-500' : aiFeedback.reasonScore > 60 ? 'text-amber-500' : 'text-rose-500'}`}>
                        {aiFeedback.reasonScore}
                      </span>
                      <span className="text-sm text-slate-400 font-normal">/ 100</span>
                    </div>
                  </div>
                  <button 
                    onClick={executeTrade} 
                    className="w-full mt-4 py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-md"
                  >
                    接受教練建議，確認執行 {action === 'buy' ? '買單' : '賣單'}
                  </button>
                </motion.div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[400px]">
             <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <BookOpen size={24} className="text-indigo-500" /> 
                  目前庫存
                </h2>
                <button 
                   onClick={handleRefreshPrices} 
                   disabled={isRefreshingPrices || positions.length === 0}
                   className="flex items-center gap-1.5 bg-slate-100 text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-50 transition-colors disabled:opacity-50"
                >
                   <RefreshCw size={14} className={isRefreshingPrices ? 'animate-spin' : ''} />
                   更新現價
                </button>
             </div>
             
             {positions.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-slate-400 text-sm font-medium">尚未建倉，點擊左側進行第一筆模擬交易吧</div>
             ) : (
                <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                  {positions.map(p => {
                    const cPrice = livePrices[p.symbol] || p.currentPrice || p.averageCost;
                    const profit = (cPrice - p.averageCost) * p.shares;
                    const profitPercent = ((cPrice - p.averageCost) / p.averageCost) * 100;
                    
                    return (
                      <div key={p.id} className="p-4 bg-slate-50 hover:bg-white rounded-xl border border-slate-200 hover:border-indigo-200 transition-all cursor-pointer group" onClick={() => setSymbol(p.symbol)}>
                         <div className="flex justify-between items-center mb-2">
                            <span className="font-black text-slate-800 text-lg">{p.symbol}</span>
                            <span className={`font-bold ${profit >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                              {profit >= 0 ? '+' : ''}{profit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </span>
                         </div>
                         <div className="flex justify-between text-sm">
                            <div className="text-slate-500 space-y-1">
                               <p className="font-medium">均價: <span className="font-mono bg-white px-1 ml-1 rounded border border-slate-100">{p.averageCost.toFixed(2)}</span></p>
                               <p className="font-medium">現價: <span className="font-mono bg-white px-1 ml-1 rounded border border-slate-100">{cPrice.toFixed(2)}</span></p>
                            </div>
                            <div className="text-right space-y-1">
                               <p className="font-bold text-slate-700">{p.shares.toLocaleString()} 股</p>
                               <p className={`text-xs font-bold px-2 py-0.5 rounded-md inline-block ${profitPercent >= 0 ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                 {profitPercent > 0 ? '+' : ''}{profitPercent.toFixed(2)}%
                               </p>
                            </div>
                         </div>
                      </div>
                    );
                  })}
                </div>
             )}
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[400px]">
            <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
              <Clock size={24} className="text-indigo-500" /> 
              近期訓練紀錄
            </h2>
            {trades.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm font-medium">尚無交易紀錄</div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                {trades.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(t => (
                  <div key={t.id} className="relative pl-4 overflow-hidden group">
                     <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-full ${t.action === 'buy' ? 'bg-rose-400' : 'bg-emerald-400'}`}></div>
                     <div className="flex justify-between items-start mb-1">
                        <div>
                         <span className={`font-black text-sm mr-2 ${t.action === 'buy' ? 'text-rose-600' : 'text-emerald-600'}`}>
                           {t.action === 'buy' ? '買入' : '賣出'} {t.symbol}
                         </span>
                         <span className="text-xs font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded tracking-widest">{new Date(t.date).toLocaleDateString()}</span>
                        </div>
                        <span className="font-bold text-slate-700 text-sm">{t.shares}股 @ {t.price}</span>
                     </div>
                     <p className="text-xs text-slate-500 mb-2 mt-2 leading-relaxed">✏️ {t.note}</p>
                     {t.aiCoachFeedback && (
                       <div className="bg-indigo-50/70 p-2.5 rounded-lg border border-indigo-100/50 mt-1">
                          <p className="text-xs text-indigo-700 font-medium leading-relaxed flex items-start gap-1.5">
                            <Brain size={14} className="shrink-0 mt-0.5" />
                            {t.aiCoachFeedback}
                          </p>
                       </div>
                     )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

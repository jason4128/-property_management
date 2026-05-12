import express from "express";
import { createServer as createViteServer } from "vite";
import yahooFinance from 'yahoo-finance2';
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";

const yf = new yahooFinance();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // AI Scraper endpoint
  app.post("/api/scrape-url", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        res.status(400).json({ error: "URL is required" });
        return;
      }

      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Upgrade-Insecure-Requests': '1'
        },
        timeout: 45000,
        maxRedirects: 10
      });

      const $ = cheerio.load(response.data);
      
      // Remove scripts, styles, etc.
      $('script, style, nav, footer, header').remove();
      
      const text = $('body').text().replace(/\s+/g, ' ').trim();
      res.json({ text: text.substring(0, 10000) }); // Limit to avoid hitting Gemini context too hard on first pass
    } catch (error) {
      console.error(`Scraping error:`, error);
      res.status(500).json({ error: "Failed to scrape URL" });
    }
  });

  // Search endpoint
  app.get("/api/stock/search/:query", async (req, res) => {
    try {
      let { query } = req.params;
      const results = await yf.search(query);
      res.json(results);
    } catch (e) {
      console.error(`Failed to search ${req.params.query}:`, e);
      res.status(500).json({ error: "Search failed" });
    }
  });

  // API routes
  app.get("/api/stocks/quotes", async (req, res) => {
    try {
      const { symbols } = req.query;
      if (!symbols || typeof symbols !== 'string') {
        res.status(400).json({ error: "Symbols query parameter is required" });
        return;
      }
      const symbolList = symbols.split(',');
      
      // For Taiwanese stocks, we need to try appending .TW / .TWO
      // This is trickier in bulk, so we'll map them first
      const fullSymbols = await Promise.all(symbolList.map(async (s) => {
        if (/^\d{4,6}[a-zA-Z]?$/.test(s)) {
          // Try .TW first
          try {
            const check = await yf.quote(`${s}.TW`);
            if (check) return `${s}.TW`;
          } catch (e) {
            return `${s}.TWO`;
          }
        }
        return s;
      }));

      const data = await yf.quote(fullSymbols);
      res.json(Array.isArray(data) ? data : [data]);
    } catch (error) {
      console.error(`Error fetching bulk quotes:`, error);
      res.status(500).json({ error: "Failed to fetch bulk stock data" });
    }
  });

  app.get("/api/stock/:symbol", async (req, res) => {
    try {
      let { symbol } = req.params;
      // If it looks like a Taiwan stock (4-6 digits, optionally followed by a letter), try appending .TW then .TWO
      if (/^\d{4,6}[a-zA-Z]?$/.test(symbol)) {
        try {
          console.log(`Fetching data for: ${symbol}.TW`);
          const data = await yf.quote(`${symbol}.TW`);
          res.json(data);
          return;
        } catch (e) {
          console.log(`Failed with .TW, trying .TWO for ${symbol}`);
          const data = await yf.quote(`${symbol}.TWO`);
          res.json(data);
          return;
        }
      }
      console.log(`Fetching data for: ${symbol}`);
      const data = await yf.quote(symbol);
      console.log(`Data fetched:`, data);
      res.json(data);
    } catch (error) {
      console.error(`Error fetching ${req.params.symbol}:`, error);
      res.status(500).json({ error: "Failed to fetch stock data" });
    }
  });

  app.get("/api/stock/history/:symbol", async (req, res) => {
    try {
      let { symbol } = req.params;
      // If it looks like a Taiwan stock (4-6 digits, optionally followed by a letter), try appending .TW then .TWO
      if (/^\d{4,6}[a-zA-Z]?$/.test(symbol)) {
        try {
          console.log(`Fetching history for: ${symbol}.TW`);
          const data = await yf.chart(`${symbol}.TW`, { period1: '2020-01-01' });
          res.json(data.quotes);
          return;
        } catch (e) {
          console.log(`Failed with .TW, trying .TWO for ${symbol}`);
          try {
            const data = await yf.chart(`${symbol}.TWO`, { period1: '2020-01-01' });
            res.json(data.quotes);
            return;
          } catch (e2) {
            console.error(`Failed with .TWO for ${symbol}:`, e2);
            throw e2;
          }
        }
      }
      console.log(`Fetching history for: ${symbol}`);
      const data = await yf.chart(symbol, { period1: '2020-01-01' });
      res.json(data.quotes);
    } catch (error) {
      console.error(`Error fetching history for ${req.params.symbol}:`, error);
      res.status(500).json({ error: "Failed to fetch historical data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/stock/dividends/:symbol", async (req, res) => {
    try {
      let { symbol } = req.params;
      const getDividends = async (sym: string) => {
        const data = await yf.chart(sym, { period1: '2019-01-01' });
        return { events: data.events, meta: data.meta };
      };

      if (/^\d{4,6}[a-zA-Z]?$/.test(symbol)) {
        try {
          res.json(await getDividends(`${symbol}.TW`));
          return;
        } catch (e) {
          try {
             res.json(await getDividends(`${symbol}.TWO`));
             return;
          } catch(e2) {
             throw e2;
          }
        }
      }
      res.json(await getDividends(symbol));
    } catch (error) {
      console.error(`Error fetching dividends for ${req.params.symbol}:`, error);
      res.status(500).json({ error: "Failed to fetch dividend data", details: error instanceof Error ? error.message : String(error) });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

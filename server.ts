import express from "express";
import { createServer as createViteServer } from "vite";
import yahooFinance from 'yahoo-finance2';
import path from "path";

const yf = new yahooFinance();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API routes
  app.get("/api/stock/:symbol", async (req, res) => {
    try {
      let { symbol } = req.params;
      // If it's a 4-digit number, try appending .TW then .TWO
      if (/^\d{4}$/.test(symbol)) {
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
      // If it's a 4-digit number, try appending .TW then .TWO
      if (/^\d{4}$/.test(symbol)) {
        try {
          console.log(`Fetching history for: ${symbol}.TW`);
          const data = await yf.historical(`${symbol}.TW`, { period1: '2020-01-01' });
          res.json(data);
          return;
        } catch (e) {
          console.log(`Failed with .TW, trying .TWO for ${symbol}`);
          try {
            const data = await yf.historical(`${symbol}.TWO`, { period1: '2020-01-01' });
            res.json(data);
            return;
          } catch (e2) {
            console.error(`Failed with .TWO for ${symbol}:`, e2);
            throw e2;
          }
        }
      }
      console.log(`Fetching history for: ${symbol}`);
      const data = await yf.historical(symbol, { period1: '2020-01-01' });
      res.json(data);
    } catch (error) {
      console.error(`Error fetching history for ${req.params.symbol}:`, error);
      res.status(500).json({ error: "Failed to fetch historical data" });
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

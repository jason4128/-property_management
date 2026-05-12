import { GoogleGenAI } from "@google/genai";
import { ChildRecord } from "../types";

const getAi = () => {
  const apiKey = process.env.GEMINI_API_KEY || localStorage.getItem('GEMINI_API_KEY');
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const withRetry = async <T extends unknown>(fn: () => Promise<T>, maxRetries = 3, initialDelay = 1000): Promise<T> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      const isRetryable = errorMsg.includes('429') || 
                         errorMsg.includes('RESOURCE_EXHAUSTED') ||
                         errorMsg.includes('503') ||
                         errorMsg.includes('UNAVAILABLE') ||
                         errorMsg.includes('deadline');
      
      if (isRetryable && i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        console.warn(`AI request failed, retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
  throw new Error("Max retries reached");
};

function tryExtractJson(text: string) {
  try {
    return JSON.parse(text);
  } catch (e) {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
      try {
        return JSON.parse(match[1]);
      } catch (e2) {}
    }
    const cleaned = text.replace(/^[^{[]+/, '').replace(/[^}\]]+$/, '');
    try {
      return JSON.parse(cleaned);
    } catch (e3) {
      throw new Error(`Failed to parse AI response as JSON: ${text.slice(0, 100)}...`);
    }
  }
}

export async function askChildBudgetAdvisor(message: string, currentRecords: ChildRecord[]) {
  try {
    const ai = getAi();
    if (!ai) return "抱歉，Gemini API Key 未設定。請在設定中輸入您的 API Key。";

    const dataContext = currentRecords.map(r => 
      `${r.date}: ${r.category} (${r.type === 'income' ? '收入' : '支出'}), 金額: ${r.amount}, 頻率: ${r.frequency}, 預算: ${r.budgetAmount}`
    ).join('\n');

    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: [{ parts: [{ text: message }] }],
      config: {
        systemInstruction: `你是一個專業的人身理財與育兒預算顧問。
目前的育兒預算資料如下：
${dataContext}

請根據使用者的提問給予精確、溫嫩且具體的建議。協助使用者規劃存款、識別非必要開銷。`
      }
    }));

    return response.text || "無法取得建議。";
  } catch (error) {
    console.error("AI Advisor Error:", error);
    return "抱歉，理財建議生成失敗。請檢查您的網路或 API Key 設定。";
  }
}

export async function extractSubsidiesFromFile(fileBase64: string, mimeType: string) {
  try {
    const ai = getAi();
    if (!ai) return [];

    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: {
        parts: [
          { inlineData: { data: fileBase64, mimeType } },
          { text: "請解析這份文件或圖片中的政府補助資訊。提取出項目名稱、金額、頻率(monthly/yearly/quarterly/half-yearly)、申請限制條件，並以 JSON 格式回應。" }
        ]
      },
      config: {
        responseMimeType: "application/json"
      }
    }));

    return tryExtractJson(response.text || "[]");
  } catch (error) {
    console.error("AI Extraction Error:", error);
    return [];
  }
}

export async function extractSubsidiesFromText(text: string) {
  try {
    const ai = getAi();
    if (!ai) return [];

    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: [{ 
        parts: [{ 
          text: `請解析以下關於育兒補助的文字或網址內容：\n\n${text}\n\n提取出項目名稱、金額、頻率(monthly/yearly/quarterly/half-yearly)、簡短備註，並以 JSON 格式回應。` 
        }] 
      }],
      config: {
        responseMimeType: "application/json"
      }
    }));

    return tryExtractJson(response.text || "[]");
  } catch (error) {
    console.error("AI Text Extraction Error:", error);
    return [];
  }
}

export async function genericAiCall(payload: { prompt?: string, contents?: any[], systemInstruction?: string, model?: string, responseSchema?: any }) {
  try {
    const ai = getAi();
    if (!ai) throw new Error("API Key not found");

    const response = await withRetry(() => ai.models.generateContent({
      model: payload.model || "gemini-flash-latest",
      contents: payload.contents || { parts: [{ text: payload.prompt || "" }] },
      config: {
        systemInstruction: payload.systemInstruction,
        responseMimeType: payload.responseSchema ? "application/json" : undefined,
        responseSchema: payload.responseSchema
      }
    }));

    const text = response.text || "";
    return payload.responseSchema ? tryExtractJson(text) : { text };
  } catch (error) {
    console.error("Generic AI Call Error:", error);
    throw error;
  }
}

export async function predictStockDividends(symbol: string, currentPrice: number, historyData?: any) {
  try {
    const ai = getAi();
    if (!ai) return null;

    // Filter history data to save tokens and avoid noise
    const simplifiedHistory = Array.isArray(historyData) 
      ? historyData.slice(0, 10).map(d => ({ date: d.date, amount: d.amount }))
      : (historyData && typeof historyData === 'object')
        ? Object.entries(historyData).slice(0, 10).map(([_, d]: any) => ({ date: d.date, amount: d.amount }))
        : historyData;

    const prompt = `你是一個專業的股利分析 AI。
請根據股票代號「${symbol}」以及目前的股價 ${currentPrice}，分析歷史數據並預估該公司未來的「年度總計每股股利」。
歷史配息數據（近幾次）：${simplifiedHistory ? JSON.stringify(simplifiedHistory) : "無"}

請考慮：
1. 歷史配息穩定度與趨勢。
2. 該產業特性（如金融、科技、傳產）。
3. 如果是台灣股票（代號如 2330.TW），回傳台幣金額。如果是美股（如 NVDA），回傳美金金額。
4. frequency 請從以下選擇：月配, 季配, 半年配, 年配, 不定期。

請嚴格按照以下 JSON 格式回覆：
{
  "predictedDividend": number,
  "frequency": string,
  "reason": "簡短的一句話理由"
}
請只回傳 JSON。`;

    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json"
      }
    }));

    return tryExtractJson(response.text || "{}");
  } catch (error) {
    console.error("Predict Dividends Error:", error);
    return null;
  }
}

export async function analyzePortfolioStructure(stocks: any[], funds: any[], usdRate: number) {
  try {
    const ai = getAi();
    if (!ai) throw new Error("API Key not found");

    const portfolioData = [
      ...stocks.map(s => ({
        type: 'Stock',
        name: s.name,
        symbol: s.symbol,
        shares: s.shares,
        price: s.currentPrice,
        cost: s.averageCost,
        source: s.source,
        currency: s.source === 'Firstrade' ? 'USD' : 'TWD'
      })),
      ...funds.map(f => ({
        type: 'Fund',
        name: f.name,
        symbol: 'N/A',
        shares: f.units,
        price: f.units > 0 ? f.currentValue / f.units : 0,
        cost: f.units > 0 ? f.cost / f.units : 0,
        source: f.source,
        currency: 'TWD'
      }))
    ];

    const prompt = `你是一個專業的投資分析師。請針對以下投資組合明細進行深度分析。
投資組合資料：
${JSON.stringify(portfolioData)}
目前的匯率 1 USD = ${usdRate} TWD。

請根據每項資產的名稱與代號，運用你的知識庫進行分類（由你判斷其所屬國家、產業、性質）。
請產生以下結構的 JSON 數據：

1. countryWeight: 國家權重分配 (例如: [{"name": "台灣", "value": 70}, {"name": "美國", "value": 30}])
2. industryWeight: 產業類別分佈 (例如: [{"name": "半導體", "value": 500000}, {"name": "高股息 ETF", "value": 300000}])
3. riskConcentration: 
   - top5Percentage: 前五大持股總佔比 (數字，0-100)
   - top5Holdings: 前五大持股明細陣列，包含 name, percentage, riskComment (風險說明)
4. diagnosis: 綜合診斷報告 (Markdown 格式)，內容包含：
   - 市值型與高股息型佔比分析（若數據有此標籤或你能判斷）。
   - 防禦力與成長性分析。
   - 具體的調整建議。

請確保金額計算考慮了匯率 (Firstrade 來源為 USD)。
請只回傳 JSON。`;

    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json"
      }
    }));

    return tryExtractJson(response.text || "{}");
  } catch (error) {
    console.error("Portfolio Analysis Error:", error);
    throw error;
  }
}

export async function analyzeMockTrade(
  stockSymbol: string, 
  balance: number, 
  tradeAmount: number, 
  isBuy: boolean, 
  portfolio: any[], 
  note: string
) {
  try {
    const ai = getAi();
    if (!ai) throw new Error("API Key not found");

    const prompt = `你是一位專業的量化交易與資產管理教練。
使用者的虛擬帳戶狀況：
- 可用餘額: ${balance}
- 即將 ${isBuy ? '買入' : '賣出'} 股票代碼: ${stockSymbol}
- 交易金額: ${tradeAmount}
- 目前持股: ${JSON.stringify(portfolio)}
- 使用者的交易筆記(理由): "${note}"

請使用 Google 搜尋去查詢 "${stockSymbol} 走勢 均線 RSI MACD Yahoo Finance" 的最新財經資訊與技術線型分析。

根據最新資訊，請回覆以下 JSON 格式：
{
  "trend": "多頭 | 空頭 | 盤整 | 尚未明朗",
  "technicalDetails": "根據近期市場數據(如均線、KD等)，目前的技術面簡要分析",
  "riskWarning": "資產配置與風險控管提醒（這筆交易是否佔總資金過高？產業是否太集中？）",
  "coachComment": "對這筆交易點評(50字以內)",
  "reasonScore": 針對使用者的「交易筆記」給予 0-100 的邏輯合理度評分 (數字)
}
請只回傳符合格式的 JSON。`;

    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json"
      }
    }));

    return tryExtractJson(response.text || "{}");
  } catch (error) {
    console.error("Mock Trade Analysis Error:", error);
    throw error;
  }
}

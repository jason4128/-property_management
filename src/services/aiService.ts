import { GoogleGenAI } from "@google/genai";
import { ChildRecord } from "../types";

const getAi = () => {
  const apiKey = process.env.GEMINI_API_KEY || localStorage.getItem('GEMINI_API_KEY');
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const withRetry = async <T extends unknown>(fn: () => Promise<T>, maxRetries = 3, initialDelay = 2000): Promise<T> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const isRetryable = error?.message?.includes('429') || 
                         error?.message?.includes('RESOURCE_EXHAUSTED') ||
                         error?.message?.includes('503') ||
                         error?.message?.includes('UNAVAILABLE');
      
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

export async function askChildBudgetAdvisor(message: string, currentRecords: ChildRecord[]) {
  try {
    const ai = getAi();
    if (!ai) return "抱歉，Gemini API Key 未設定。請在設定中輸入您的 API Key。";

    const dataContext = currentRecords.map(r => 
      `${r.date}: ${r.category} (${r.type === 'income' ? '收入' : '支出'}), 金額: ${r.amount}, 頻率: ${r.frequency}, 預算: ${r.budgetAmount}`
    ).join('\n');

    const response = await withRetry(() => ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: message }] }],
      config: {
        systemInstruction: `你是一個專業的人身理財與育兒預算顧問。
目前的育兒預算資料如下：
${dataContext}

請根據使用者的提問給予精確、溫嫩且具體的建議。協助使用者規劃存款、識別非必要開銷，並根據台灣的補助政策（如育兒津貼、托嬰補助）提供資訊。
如果使用者問關於「怎麼存錢」，請分析現有的收入跟支出比例。`
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
      model: "gemini-3-flash-preview",
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

    return JSON.parse(response.text || "[]");
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
      model: "gemini-3-flash-preview",
      contents: [{ 
        parts: [{ 
          text: `請解析以下關於育兒補助的文字或網址內容：\n\n${text}\n\n提取出項目名稱、金額、頻率(monthly/yearly/quarterly/half-yearly)、簡短備註，並以 JSON 格式回應。` 
        }] 
      }],
      config: {
        responseMimeType: "application/json"
      }
    }));

    return JSON.parse(response.text || "[]");
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
      model: payload.model || "gemini-3-flash-preview",
      contents: payload.contents || { parts: [{ text: payload.prompt || "" }] },
      config: {
        systemInstruction: payload.systemInstruction,
        responseMimeType: payload.responseSchema ? "application/json" : undefined,
        responseSchema: payload.responseSchema
      }
    }));

    const text = response.text || "";
    return payload.responseSchema ? JSON.parse(text) : { text };
  } catch (error) {
    console.error("Generic AI Call Error:", error);
    throw error;
  }
}

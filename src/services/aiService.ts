import { GoogleGenAI, Type } from "@google/genai";
import { ChildRecord } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function askChildBudgetAdvisor(message: string, currentRecords: ChildRecord[]) {
  try {
    const dataContext = currentRecords.map(r => 
      `${r.date}: ${r.category} (${r.type === 'income' ? '收入' : '支出'}), 金額: ${r.amount}, 頻率: ${r.frequency}, 預算: ${r.budgetAmount}`
    ).join('\n');

    console.log("[AI] Asking budget advisor with model gemini-3.1-pro-preview");
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: [{ parts: [{ text: message }] }],
      config: {
        systemInstruction: { parts: [{ text: `你是一個專業的人身理財與育兒預算顧問。
目前的育兒預算資料如下：
${dataContext}

請根據使用者的提問給予精確、溫嫩且具體的建議。協助使用者規劃存款、識別非必要開銷，並根據台灣的補助政策（如育兒津貼、托嬰補助）提供資訊。
如果使用者問關於「怎麼存錢」，請分析現有的收入跟支出比例。` }] },
      }
    });

    return response.text;
  } catch (error) {
    console.error("AI Advisor Error:", error);
    return "抱歉，我目前無法連線。請稍後再試。";
  }
}

export async function extractSubsidiesFromFile(fileBase64: string, mimeType: string) {
  try {
    console.log("[AI] Extracting subsidies from file with model gemini-3-flash-preview");
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { inlineData: { data: fileBase64, mimeType } },
          { text: "請解析這份文件或圖片中的政府補助資訊。提取出項目名稱、金額、頻率(monthly/yearly/quarterly/half-yearly)、申請限制條件，並以 JSON 格式回應。" }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              category: { type: Type.STRING, description: "補助項目名稱" },
              amount: { type: Type.NUMBER, description: "每期補助金額" },
              frequency: { type: Type.STRING, enum: ["monthly", "quarterly", "half-yearly", "yearly"], description: "發放頻率" },
              note: { type: Type.STRING, description: "簡短的限制條件或備註" }
            },
            required: ["category", "amount", "frequency"]
          }
        }
      }
    });

    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("AI Extraction Error:", error);
    return [];
  }
}

export async function extractSubsidiesFromText(text: string) {
  try {
    console.log("[AI] Extracting subsidies from text with model gemini-3-flash-preview");
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ 
        parts: [{ 
          text: `請解析以下關於育兒補助的文字或網址內容：\n\n${text}\n\n提取出項目名稱、金額、頻率(monthly/yearly/quarterly/half-yearly)、簡短備註，並以 JSON 格式回應。` 
        }] 
      }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              category: { type: Type.STRING, description: "補助項目名稱" },
              amount: { type: Type.NUMBER, description: "每期補助金額" },
              frequency: { type: Type.STRING, enum: ["monthly", "quarterly", "half-yearly", "yearly"], description: "發放頻率" },
              note: { type: Type.STRING, description: "簡短的限制條件或備註" }
            },
            required: ["category", "amount", "frequency"]
          }
        }
      }
    });

    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("AI Text Extraction Error:", error);
    return [];
  }
}

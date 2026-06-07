import { getApps, initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore/lite';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app, "ai-studio-a537b000-3c00-46c0-981c-7d34e6b7e53b");

async function run() {
  const insurancesRef = collection(db, 'insurances');
  const q = query(insurancesRef, where('name', '>=', '全球'));
  const snapshot = await getDocs(q);
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.name.includes('XHR')) {
      if (data.rateTableJSON) {
        let arr = JSON.parse(data.rateTableJSON);
        let p5 = arr.filter((x: any) => x.term && x.term.includes('五'));
        console.log("Plan 5 rates:");
        console.log(JSON.stringify(p5, null, 2));
      }
      if (data.coverageTemplateJSON) {
        console.log("Template:", JSON.stringify(JSON.parse(data.coverageTemplateJSON), null, 2));
      }
    }
  }
}
run();

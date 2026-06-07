import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  const docRef = doc(db, 'insurances', '5G0MuQD6mspEIeSs0cnG');
  const dSnapshot = await getDoc(docRef);
  if (dSnapshot.exists()) {
    const data = dSnapshot.data();
    console.log("XHR Name:", data.name);
    console.log("XHR planCoverage:", data.planCoverage);
    console.log("XHR planAge:", data.planAge);
    console.log("XHR planGender:", data.planGender);
    console.log("XHR planTerm:", data.planTerm);
    
    if (data.rateTableJSON) {
      const rates = JSON.parse(data.rateTableJSON);
      console.log("Number of gender/term blocks:", rates.length);
      rates.forEach((block: any, idx: number) => {
        console.log(`Block ${idx}: gender=${block.gender}, term=${block.term}, keys_count=${Object.keys(block.rates || {}).length}`);
        if (block.gender === '男性' && block.term.includes('五')) {
          console.log("Rates for 男性 計劃五:", JSON.stringify(block.rates));
        } else if (idx === 0 || idx === 4) {
          console.log(`Sample rates for block ${idx}:`, JSON.stringify(block.rates).substring(0, 150) + "...");
        }
      });
    }
  }
  process.exit(0);
}
run();

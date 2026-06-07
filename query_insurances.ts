import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  const snapshot = await getDocs(collection(db, 'insurances'));
  console.log("Insurances in database (XHR ONLY):");
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    if (data.name && (data.name.includes('XHR') || data.name.includes('醫療費用'))) {
      console.log("ID:", doc.id);
      console.log("Name:", data.name);
      console.log("Provider:", data.provider);
      console.log("planCoverage:", data.planCoverage);
      console.log("planAge:", data.planAge);
      console.log("planGender:", data.planGender);
      console.log("planTerm:", data.planTerm);
      console.log("planCalculatedPremium:", data.planCalculatedPremium);
      console.log("planCalculatedCoverage:", data.planCalculatedCoverage);
      console.log("rateTableJSON length:", data.rateTableJSON ? data.rateTableJSON.length : "none");
      if (data.rateTableJSON) {
        console.log("rateTableJSON full:", data.rateTableJSON.substring(0, 1000) + "...");
      }
      if (data.coverageTemplateJSON) {
        console.log("coverageTemplateJSON:", data.coverageTemplateJSON);
      }
      console.log("-----------------------------------------");
    }
  });
  process.exit(0);
}
run();

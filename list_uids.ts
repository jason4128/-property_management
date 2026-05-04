import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  const snapshot = await getDocs(collection(db, 'salaryRecords'));
  const uids = {};
  snapshot.docs.forEach(doc => {
    const uid = doc.data().uid;
    uids[String(uid)] = (uids[String(uid)] || 0) + 1;
  });
  console.log("UIDs in salaryRecords:");
  console.log(uids);
  process.exit(0);
}
run();

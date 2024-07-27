import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY_CONFIIG,
    authDomain: "chatwith-pdf.firebaseapp.com",
    projectId: "chatwith-pdf",
    storageBucket: "chatwith-pdf.appspot.com",
    messagingSenderId: "150169605511",
    appId: "1:150169605511:web:903ed0699dbd0a97356f22",
    measurementId: "G-Z6CKY8L8NY"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const db = getFirestore(app);
const storage = getStorage(app);

export { db, storage };

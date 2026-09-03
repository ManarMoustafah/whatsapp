// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";


// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyApydSyjQXBQhL_nk3kiK6Rrel2mB8WeNM",
  authDomain: "whatsapp-f934a.firebaseapp.com",
  projectId: "whatsapp-f934a",
  storageBucket: "whatsapp-f934a.firebasestorage.app",
  messagingSenderId: "310279659666",
  appId: "1:310279659666:web:eaa88abf193c8d498b464b",
  measurementId: "G-CPN51XS0H6"
};

// const firebaseConfig = {
//   apiKey: "AIzaSyCTWP-xrt7c4C2hnmxk6JUszvTuCEMocy0",
//   authDomain: "whatsappchat-f353c.firebaseapp.com",
//   projectId: "whatsappchat-f353c",
//   storageBucket: "whatsappchat-f353c.firebasestorage.app",
//   messagingSenderId: "423460041870",
//   appId: "1:423460041870:web:91ed65d5502c1fd6b545df",
//   measurementId: "G-2E9MVWTZVH"
// }

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export const googleProvider = new GoogleAuthProvider();
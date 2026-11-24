import {initializeApp, getApps, getApp} from 'firebase/app';
import {getDatabase} from 'firebase/database';

export const FIREBASE_DATABASE_URL = 'https://beyondprofiles-5b71a-default-rtdb.firebaseio.com';

const firebaseConfig = {
  apiKey: 'AIzaSyD36k8EH1Xjr_eGQAS7qHZmDESfBDCN6rw',
  authDomain: 'beyondprofiles-5b71a.firebaseapp.com',
  databaseURL: FIREBASE_DATABASE_URL,
  projectId: 'beyondprofiles-5b71a',
  storageBucket: 'beyondprofiles-5b71a.firebasestorage.app',
  messagingSenderId: '894821956984',
  appId: '1:894821956984:web:c71ef1b440146a9dd2dc8d',
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getDatabase(app);

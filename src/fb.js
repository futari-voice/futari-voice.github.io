// Firebase の部品をひとまとめにして window.FB に入れる（esbuildで1つのファイルにする）
import { initializeApp } from 'firebase/app';
import {
  getAuth, connectAuthEmulator, onAuthStateChanged, GoogleAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult, signInWithCredential,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile, deleteUser,
} from 'firebase/auth';
import {
  initializeFirestore, connectFirestoreEmulator, doc, collection, getDoc, setDoc, deleteDoc,
  onSnapshot, query, where, orderBy, limitToLast, documentId, serverTimestamp, runTransaction, writeBatch,
  getCountFromServer, Timestamp,
} from 'firebase/firestore';
window.FB = {
  initializeApp, getAuth, connectAuthEmulator, onAuthStateChanged, GoogleAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult, signInWithCredential,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile, deleteUser,
  initializeFirestore, connectFirestoreEmulator, doc, collection, getDoc, setDoc, deleteDoc,
  onSnapshot, query, where, orderBy, limitToLast, documentId, serverTimestamp, runTransaction, writeBatch,
  getCountFromServer, Timestamp,
};

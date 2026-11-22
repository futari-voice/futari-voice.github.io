// Firebase のログイン部品をひとまとめにして window.FB に入れる（esbuildで1つのファイルにする）
import { initializeApp } from 'firebase/app';
import {
  getAuth, connectAuthEmulator, onAuthStateChanged, GoogleAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult, signInWithCredential,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile, deleteUser,
} from 'firebase/auth';
window.FB = {
  initializeApp, getAuth, connectAuthEmulator, onAuthStateChanged, GoogleAuthProvider,
  signInWithPopup, signInWithRedirect, getRedirectResult, signInWithCredential,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile, deleteUser,
};

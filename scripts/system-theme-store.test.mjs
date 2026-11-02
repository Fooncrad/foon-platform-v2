import test from "node:test";
import assert from "node:assert/strict";
import {subscribeSystemTheme,systemThemeSnapshot} from "../lib/ux/system-theme-store.ts";
test("system theme reacts to both device changes",()=>{
 let dark=false;const listeners=new Set();
 globalThis.window={matchMedia:()=>({get matches(){return dark;},addEventListener:(_,fn)=>listeners.add(fn),removeEventListener:(_,fn)=>listeners.delete(fn)})};
 let count=0;const stop=subscribeSystemTheme(()=>count++);
 assert.equal(systemThemeSnapshot(),false);
 dark=true;for(const fn of listeners)fn();
 assert.equal(systemThemeSnapshot(),true);
 dark=false;for(const fn of listeners)fn();
 assert.equal(systemThemeSnapshot(),false);
 assert.equal(count,2);stop();assert.equal(listeners.size,0);
});

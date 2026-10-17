"use client";
import {createContext,useContext} from "react";
const PersonalMediaContext=createContext(false);
export function PersonalMediaScope({allowed,children}:{allowed:boolean;children:React.ReactNode}){return <PersonalMediaContext.Provider value={allowed}>{children}</PersonalMediaContext.Provider>;}
export function usePersonalMediaAccess(){return useContext(PersonalMediaContext);}

"use client";

import { createContext, useContext } from "react";

const PublicShellContext = createContext(false);

export function PublicShellProvider({ children }: { children: React.ReactNode }) {
  return <PublicShellContext.Provider value>{children}</PublicShellContext.Provider>;
}

export function usePublicShell() {
  return useContext(PublicShellContext);
}
